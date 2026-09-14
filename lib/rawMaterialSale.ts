import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { accountIdByCode, makeVoucher, reverseInventoryJv, COGS_CODE } from "@/lib/inventoryCost";

type Client = ReturnType<typeof createClient>;

const SALES_CODE = "4030"; // Raw Material Sales
const AR_CODE = "1100";
const CASH_CODE = "1000";
const FALLBACK_INV_CODE = "1299"; // Other Raw Material Inventory — material-এ code না থাকলে

export type RawMaterialSaleUnit = "lbs" | "kg";

const round2 = (n: number) => Math.round(n * 100) / 100;

// codebase জুড়ে kg = lbs × 0.453592 — তাই Lbs-equivalent = kg ÷ 0.453592 (lib/wastageSale.ts-এর সাথে মিল)
export const KG_TO_LBS = 1 / 0.453592;
export function toLbsEquiv(quantity: number, unit: RawMaterialSaleUnit): number {
  return unit === "kg" ? round2(quantity * KG_TO_LBS) : quantity;
}

export type RawMaterialSaleParty =
  | { kind: "customer"; customerId: string; label: string }
  | { kind: "account"; accountId: string; label: string };

export type RawMaterialSaleInput = {
  saleDate: string;
  materialId: string;
  warehouseId: string;
  unit: RawMaterialSaleUnit;
  quantity: number; // unit-এ পরিমাণ
  rate: number;     // unit-এ দর
  amount: number;
  party: RawMaterialSaleParty;
  paymentReceived: boolean; // true = নগদ বিক্রি (Dr 1000), false = বাকি (Dr party)
  note: string;
  createdBy: string | null;
};

/** JV উল্টে দেয় + raw_material_stock ফেরত দেয় — row মুছে না (edit-এ লাগে)। */
async function undoRawMaterialSaleEffects(supabase: Client, sale: any): Promise<void> {
  await reverseInventoryJv(supabase, sale.voucher_id, {
    unlink: { table: "raw_material_sales", column: "voucher_id", id: sale.id },
  });

  const { data: ledgers } = await supabase
    .from("stock_ledger").select("*")
    .eq("reference_type", "raw_material_sale").eq("reference_id", sale.id);
  for (const l of ledgers ?? []) {
    const { data: stock } = await supabase
      .from("raw_material_stock").select("*")
      .eq("material_id", l.item_id).eq("warehouse_id", l.warehouse_id).maybeSingle();
    if (stock) {
      const delta = l.txn_type === "out" ? Number(l.quantity) : -Number(l.quantity);
      await supabase.from("raw_material_stock")
        .update({ quantity_lbs: Number(stock.quantity_lbs) + delta, updated_at: new Date().toISOString() })
        .eq("id", stock.id);
    }
    await supabase.from("stock_ledger").delete().eq("id", l.id);
  }
}

/** row আগে থেকেই আছে (saleId জানা) — fields update + স্টক + JV বসায়। */
async function applyRawMaterialSaleEffects(
  supabase: Client, saleId: string, saleNo: string, input: RawMaterialSaleInput,
): Promise<{ ok: boolean; error?: string }> {
  const qtyLbs = toLbsEquiv(input.quantity, input.unit); // স্টক/COGS Lbs-এ

  const { data: mat } = await supabase
    .from("raw_materials").select("id, material_name, avg_cost_per_lbs, inventory_account_code")
    .eq("id", input.materialId).maybeSingle();
  if (!mat) return { ok: false, error: "Raw Material পাওয়া যায়নি।" };

  const cogs = round2(qtyLbs * (Number(mat.avg_cost_per_lbs) || 0));
  const invCode = mat.inventory_account_code || FALLBACK_INV_CODE;

  await supabase.from("raw_material_sales").update({
    sale_date: input.saleDate, material_id: input.materialId, warehouse_id: input.warehouseId,
    unit: input.unit, quantity: input.quantity, rate: input.rate,
    quantity_lbs: qtyLbs, amount: input.amount,
    payment_received: input.paymentReceived,
    customer_id: input.party.kind === "customer" ? input.party.customerId : null,
    party_account_id: input.party.kind === "account" ? input.party.accountId : null,
    sold_to_name: input.party.label || null, cogs_amount: cogs, note: input.note || null,
  }).eq("id", saleId);

  // Raw Material স্টক কর্তন + ledger — Lbs-এ
  const { data: stock } = await supabase
    .from("raw_material_stock").select("*")
    .eq("material_id", input.materialId).eq("warehouse_id", input.warehouseId).maybeSingle();
  if (stock) {
    await supabase.from("raw_material_stock")
      .update({ quantity_lbs: Number(stock.quantity_lbs) - qtyLbs, updated_at: new Date().toISOString() })
      .eq("id", stock.id);
  } else {
    await supabase.from("raw_material_stock")
      .insert({ material_id: input.materialId, warehouse_id: input.warehouseId, quantity_lbs: -qtyLbs });
  }
  await supabase.from("stock_ledger").insert({
    item_type: "raw_material", item_id: input.materialId, warehouse_id: input.warehouseId,
    txn_type: "out", quantity: qtyLbs,
    reference_type: "raw_material_sale", reference_id: saleId, txn_date: input.saleDate,
  });

  // JV — Payment Received হলে Dr 1000, নাহলে Dr party (customer→1100 / account→ঐ account)
  const [salesId, cogsId, invId] = await Promise.all([
    accountIdByCode(supabase, SALES_CODE),
    accountIdByCode(supabase, COGS_CODE),
    accountIdByCode(supabase, invCode),
  ]);
  const debitAccountId = input.paymentReceived
    ? await accountIdByCode(supabase, CASH_CODE)
    : input.party.kind === "account"
      ? input.party.accountId
      : await accountIdByCode(supabase, AR_CODE);

  const memo = `Raw Material Sale ${saleNo}${input.party.label ? " — " + input.party.label : ""} (${mat.material_name})`;
  const lines = [
    { account_id: debitAccountId ?? "", debit: input.amount, credit: 0, memo },
    { account_id: salesId ?? "", debit: 0, credit: input.amount, memo },
  ];
  if (cogs > 0 && cogsId && invId) {
    lines.push({ account_id: cogsId, debit: cogs, credit: 0, memo: `COGS — ${memo}` });
    lines.push({ account_id: invId, debit: 0, credit: cogs, memo: `COGS — ${memo}` });
  }

  const voucherId = await makeVoucher(supabase, input.saleDate, memo, lines, "raw_material_sale");
  if (voucherId) {
    await supabase.from("raw_material_sales").update({ voucher_id: voucherId }).eq("id", saleId);
    return { ok: true };
  }
  return { ok: true, error: "রেকর্ড সেভ হয়েছে, তবে JV তৈরি হয়নি — অ্যাকাউন্ট বাছাই যাচাই করুন।" };
}

export async function createRawMaterialSale(
  supabase: Client, input: RawMaterialSaleInput,
): Promise<{ ok: boolean; error?: string }> {
  const saleNo = await generateNextDocNo(
    supabase, "raw_material_sales", "sale_no", "RMS", "sale_date", input.saleDate,
  );
  const { data: sale, error } = await supabase
    .from("raw_material_sales")
    .insert({
      sale_no: saleNo, sale_date: input.saleDate, material_id: input.materialId, warehouse_id: input.warehouseId,
      unit: input.unit, quantity: input.quantity, rate: input.rate,
      quantity_lbs: toLbsEquiv(input.quantity, input.unit), amount: input.amount,
      payment_received: input.paymentReceived, created_by: input.createdBy,
    })
    .select("id").single();
  if (error || !sale) return { ok: false, error: error?.message ?? "Raw Material Sale সেভ ব্যর্থ হয়েছে।" };

  return applyRawMaterialSaleEffects(supabase, sale.id, saleNo, input);
}

export async function updateRawMaterialSale(
  supabase: Client, saleId: string, input: RawMaterialSaleInput,
): Promise<{ ok: boolean; error?: string }> {
  const { data: old } = await supabase.from("raw_material_sales").select("*").eq("id", saleId).single();
  if (!old) return { ok: false, error: "বিক্রির রেকর্ড খুঁজে পাওয়া যায়নি।" };
  await undoRawMaterialSaleEffects(supabase, old);
  return applyRawMaterialSaleEffects(supabase, saleId, old.sale_no, input);
}

/** Raw Material Sale মুছে ফেলা — JV উল্টে দেয়, স্টক ফেরত দেয়। */
export async function reverseRawMaterialSale(supabase: Client, sale: any): Promise<void> {
  await undoRawMaterialSaleEffects(supabase, sale);
  await supabase.from("raw_material_sales").delete().eq("id", sale.id);
}
