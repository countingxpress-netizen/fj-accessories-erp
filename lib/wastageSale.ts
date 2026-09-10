import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { accountIdByCode, makeVoucher, reverseInventoryJv } from "@/lib/inventoryCost";

type Client = ReturnType<typeof createClient>;

const RECYCLED_MATERIAL_NAME = "Recycled Chips";
const RECYCLED_INV_CODE = "1203"; // Raw Material Inventory - Recycled Chips
const COGS_CODE = "5050";
const SALES_CODE = "4020"; // Wastage / Scrap Sales
const AR_CODE = "1100";
const CASH_CODE = "1000";

export type WastageSaleSource = "wastage_stock" | "recycled_chips" | "loose";
export type WastageSaleUnit = "lbs" | "kg";

const round2 = (n: number) => Math.round(n * 100) / 100;

// codebase জুড়ে kg = lbs × 0.453592 — তাই Lbs-equivalent = kg ÷ 0.453592
export const KG_TO_LBS = 1 / 0.453592;
export function toLbsEquiv(quantity: number, unit: WastageSaleUnit): number {
  return unit === "kg" ? round2(quantity * KG_TO_LBS) : quantity;
}

export type WastageSaleParty =
  | { kind: "customer"; customerId: string; label: string }
  | { kind: "account"; accountId: string; label: string };

export type WastageSaleInput = {
  saleDate: string;
  source: WastageSaleSource;
  warehouseId: string | null; // শুধু source='recycled_chips'
  unit: WastageSaleUnit;
  quantity: number;   // unit-এ পরিমাণ
  rate: number;       // unit-এ দর
  amount: number;
  party: WastageSaleParty;
  paymentReceived: boolean; // true = নগদ বিক্রি (Dr 1000), false = বাকি (Dr party)
  note: string;
  createdBy: string | null;
};

/** JV উল্টে দেয় + recycled_chips হলে স্টক ফেরত দেয় — row মুছে না (edit-এ লাগে)। */
async function undoWastageSaleEffects(supabase: Client, sale: any): Promise<void> {
  await reverseInventoryJv(supabase, sale.voucher_id, {
    unlink: { table: "wastage_sales", column: "voucher_id", id: sale.id },
  });
  if (sale.source === "recycled_chips") {
    const { data: ledgers } = await supabase
      .from("stock_ledger").select("*")
      .eq("reference_type", "wastage_sale").eq("reference_id", sale.id);
    for (const l of ledgers ?? []) {
      const { data: stock } = await supabase
        .from("raw_material_stock").select("*")
        .eq("material_id", l.item_id).eq("warehouse_id", l.warehouse_id).maybeSingle();
      if (stock) {
        const delta = l.txn_type === "out" ? Number(l.quantity) : -Number(l.quantity);
        await supabase.from("raw_material_stock")
          .update({ quantity_lbs: stock.quantity_lbs + delta, updated_at: new Date().toISOString() })
          .eq("id", stock.id);
      }
      await supabase.from("stock_ledger").delete().eq("id", l.id);
    }
  }
}

/** row আগে থেকেই আছে (saleId জানা) — fields update + স্টক + JV বসায়। */
async function applyWastageSaleEffects(
  supabase: Client, saleId: string, saleNo: string, input: WastageSaleInput,
): Promise<{ ok: boolean; error?: string }> {
  const fromRecycled = input.source === "recycled_chips";
  const qtyLbs = toLbsEquiv(input.quantity, input.unit); // স্টক/COGS Lbs-এ

  let cogs = 0;
  let recycledMaterialId: string | null = null;
  if (fromRecycled) {
    const { data: mat } = await supabase
      .from("raw_materials").select("id, avg_cost_per_lbs")
      .eq("material_name", RECYCLED_MATERIAL_NAME).maybeSingle();
    if (!mat) return { ok: false, error: `"${RECYCLED_MATERIAL_NAME}" material পাওয়া যায়নি।` };
    recycledMaterialId = mat.id;
    cogs = round2(qtyLbs * (Number(mat.avg_cost_per_lbs) || 0));
  }

  await supabase.from("wastage_sales").update({
    sale_date: input.saleDate, source: input.source,
    warehouse_id: fromRecycled ? input.warehouseId : null,
    unit: input.unit, quantity: input.quantity, rate: input.rate,
    quantity_lbs: qtyLbs, amount: input.amount,
    payment_received: input.paymentReceived,
    customer_id: input.party.kind === "customer" ? input.party.customerId : null,
    party_account_id: input.party.kind === "account" ? input.party.accountId : null,
    sold_to_name: input.party.label || null, cogs_amount: cogs, note: input.note || null,
  }).eq("id", saleId);

  // Recycled Chips স্টক কর্তন + ledger (শুধু এই উৎসে) — Lbs-এ
  if (fromRecycled && recycledMaterialId && input.warehouseId) {
    const { data: stock } = await supabase
      .from("raw_material_stock").select("*")
      .eq("material_id", recycledMaterialId).eq("warehouse_id", input.warehouseId).maybeSingle();
    if (stock) {
      await supabase.from("raw_material_stock")
        .update({ quantity_lbs: stock.quantity_lbs - qtyLbs, updated_at: new Date().toISOString() })
        .eq("id", stock.id);
    } else {
      await supabase.from("raw_material_stock")
        .insert({ material_id: recycledMaterialId, warehouse_id: input.warehouseId, quantity_lbs: -qtyLbs });
    }
    await supabase.from("stock_ledger").insert({
      item_type: "raw_material", item_id: recycledMaterialId, warehouse_id: input.warehouseId,
      txn_type: "out", quantity: qtyLbs,
      reference_type: "wastage_sale", reference_id: saleId, txn_date: input.saleDate,
    });
  }

  // JV — Payment Received হলে Dr 1000, নাহলে Dr party (customer→1100 / account→ঐ account)
  const [salesId, cogsId, recId] = await Promise.all([
    accountIdByCode(supabase, SALES_CODE),
    accountIdByCode(supabase, COGS_CODE),
    accountIdByCode(supabase, RECYCLED_INV_CODE),
  ]);
  const debitAccountId = input.paymentReceived
    ? await accountIdByCode(supabase, CASH_CODE)
    : input.party.kind === "account"
      ? input.party.accountId
      : await accountIdByCode(supabase, AR_CODE);

  const memo = `Wastage Sale ${saleNo}${input.party.label ? " — " + input.party.label : ""}`;
  const lines = [
    { account_id: debitAccountId ?? "", debit: input.amount, credit: 0, memo },
    { account_id: salesId ?? "", debit: 0, credit: input.amount, memo },
  ];
  if (fromRecycled && cogs > 0 && cogsId && recId) {
    lines.push({ account_id: cogsId, debit: cogs, credit: 0, memo: `COGS — ${memo}` });
    lines.push({ account_id: recId, debit: 0, credit: cogs, memo: `COGS — ${memo}` });
  }

  const voucherId = await makeVoucher(supabase, input.saleDate, memo, lines, "wastage_sale");
  if (voucherId) {
    await supabase.from("wastage_sales").update({ voucher_id: voucherId }).eq("id", saleId);
    return { ok: true };
  }
  return { ok: true, error: "রেকর্ড সেভ হয়েছে, তবে JV তৈরি হয়নি — অ্যাকাউন্ট বাছাই যাচাই করুন।" };
}

export async function createWastageSale(
  supabase: Client, input: WastageSaleInput,
): Promise<{ ok: boolean; error?: string }> {
  const saleNo = await generateNextDocNo(
    supabase, "wastage_sales", "sale_no", "WS", "sale_date", input.saleDate,
  );
  const { data: sale, error } = await supabase
    .from("wastage_sales")
    .insert({
      sale_no: saleNo, sale_date: input.saleDate, source: input.source,
      unit: input.unit, quantity: input.quantity, rate: input.rate,
      quantity_lbs: toLbsEquiv(input.quantity, input.unit), amount: input.amount,
      payment_received: input.paymentReceived, created_by: input.createdBy,
    })
    .select("id").single();
  if (error || !sale) return { ok: false, error: error?.message ?? "Wastage Sale সেভ ব্যর্থ হয়েছে।" };

  return applyWastageSaleEffects(supabase, sale.id, saleNo, input);
}

export async function updateWastageSale(
  supabase: Client, saleId: string, input: WastageSaleInput,
): Promise<{ ok: boolean; error?: string }> {
  const { data: old } = await supabase.from("wastage_sales").select("*").eq("id", saleId).single();
  if (!old) return { ok: false, error: "বিক্রির রেকর্ড খুঁজে পাওয়া যায়নি।" };
  await undoWastageSaleEffects(supabase, old);
  return applyWastageSaleEffects(supabase, saleId, old.sale_no, input);
}

/** Wastage Sale মুছে ফেলা — JV উল্টে দেয়, recycled_chips হলে স্টক ফেরত দেয়। */
export async function reverseWastageSale(supabase: Client, sale: any): Promise<void> {
  await undoWastageSaleEffects(supabase, sale);
  await supabase.from("wastage_sales").delete().eq("id", sale.id);
}
