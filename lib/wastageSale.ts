import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { accountIdByCode, makeVoucher, reverseInventoryJv } from "@/lib/inventoryCost";

type Client = ReturnType<typeof createClient>;

const RECYCLED_MATERIAL_NAME = "Recycled Chips";
const RECYCLED_INV_CODE = "1203"; // Raw Material Inventory - Recycled Chips
const COGS_CODE = "5050";
const SALES_CODE = "4020"; // Wastage / Scrap Sales
const AR_CODE = "1100";

export type WastageSaleSource = "wastage_stock" | "recycled_chips" | "loose";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type WastageSaleInput = {
  saleDate: string;
  source: WastageSaleSource;
  warehouseId: string | null; // শুধু source='recycled_chips'
  quantityLbs: number;
  ratePerLbs: number;
  amount: number;
  /** "কার কাছে বিক্রি" — customer বা chart_of_accounts একটা। */
  party:
    | { kind: "customer"; customerId: string; label: string }
    | { kind: "account"; accountId: string; label: string };
  note: string;
  createdBy: string | null;
};

/**
 * Wastage / Scrap বিক্রি রেকর্ড + JV।
 *
 *   Dr <party: customer হলে 1100 AR / account হলে ঐ account>  amount
 *   Cr 4020 Wastage / Scrap Sales                             amount
 *   + source='recycled_chips' হলে: Dr 5050 / Cr 1203 (COGS = qty × avg_cost) এবং স্টক কমে
 */
export async function createWastageSale(
  supabase: Client,
  input: WastageSaleInput,
): Promise<{ ok: boolean; error?: string }> {
  const saleNo = await generateNextDocNo(
    supabase, "wastage_sales", "sale_no", "WS", "sale_date", input.saleDate,
  );

  const fromRecycled = input.source === "recycled_chips";

  let cogs = 0;
  let recycledMaterialId: string | null = null;
  if (fromRecycled) {
    const { data: mat } = await supabase
      .from("raw_materials").select("id, avg_cost_per_lbs")
      .eq("material_name", RECYCLED_MATERIAL_NAME).maybeSingle();
    if (!mat) return { ok: false, error: `"${RECYCLED_MATERIAL_NAME}" material পাওয়া যায়নি।` };
    recycledMaterialId = mat.id;
    cogs = round2(input.quantityLbs * (Number(mat.avg_cost_per_lbs) || 0));
  }

  const { data: sale, error: saleErr } = await supabase
    .from("wastage_sales")
    .insert({
      sale_no: saleNo, sale_date: input.saleDate, source: input.source,
      warehouse_id: fromRecycled ? input.warehouseId : null,
      quantity_lbs: input.quantityLbs, rate_per_lbs: input.ratePerLbs, amount: input.amount,
      customer_id: input.party.kind === "customer" ? input.party.customerId : null,
      party_account_id: input.party.kind === "account" ? input.party.accountId : null,
      sold_to_name: input.party.label || null, cogs_amount: cogs,
      note: input.note || null, created_by: input.createdBy,
    })
    .select("id").single();
  if (saleErr || !sale) return { ok: false, error: saleErr?.message ?? "Wastage Sale সেভ ব্যর্থ হয়েছে।" };

  // Recycled Chips স্টক কর্তন + ledger (শুধু এই উৎসে)
  if (fromRecycled && recycledMaterialId && input.warehouseId) {
    const { data: stock } = await supabase
      .from("raw_material_stock").select("*")
      .eq("material_id", recycledMaterialId).eq("warehouse_id", input.warehouseId).maybeSingle();
    if (stock) {
      await supabase.from("raw_material_stock")
        .update({ quantity_lbs: stock.quantity_lbs - input.quantityLbs, updated_at: new Date().toISOString() })
        .eq("id", stock.id);
    } else {
      await supabase.from("raw_material_stock")
        .insert({ material_id: recycledMaterialId, warehouse_id: input.warehouseId, quantity_lbs: -input.quantityLbs });
    }
    await supabase.from("stock_ledger").insert({
      item_type: "raw_material", item_id: recycledMaterialId, warehouse_id: input.warehouseId,
      txn_type: "out", quantity: input.quantityLbs,
      reference_type: "wastage_sale", reference_id: sale.id, txn_date: input.saleDate,
    });
  }

  // JV
  const [salesId, cogsId, recId] = await Promise.all([
    accountIdByCode(supabase, SALES_CODE),
    accountIdByCode(supabase, COGS_CODE),
    accountIdByCode(supabase, RECYCLED_INV_CODE),
  ]);
  const debitAccountId = input.party.kind === "account"
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
    await supabase.from("wastage_sales").update({ voucher_id: voucherId }).eq("id", sale.id);
  } else {
    return { ok: true, error: "রেকর্ড সেভ হয়েছে, তবে JV তৈরি হয়নি — অ্যাকাউন্ট বাছাই যাচাই করুন।" };
  }

  return { ok: true };
}

/** Wastage Sale মুছে ফেলা — JV উল্টে দেয়, recycled_chips হলে স্টক ফেরত দেয়। */
export async function reverseWastageSale(supabase: Client, sale: any): Promise<void> {
  await reverseInventoryJv(supabase, sale.voucher_id);

  if (sale.source === "recycled_chips") {
    const { data: ledgers } = await supabase
      .from("stock_ledger").select("*")
      .eq("reference_type", "wastage_sale").eq("reference_id", sale.id);
    for (const l of ledgers ?? []) {
      const { data: stock } = await supabase
        .from("raw_material_stock").select("*")
        .eq("material_id", l.item_id).eq("warehouse_id", l.warehouse_id).maybeSingle();
      if (stock) {
        await supabase.from("raw_material_stock")
          .update({ quantity_lbs: stock.quantity_lbs + Number(l.quantity), updated_at: new Date().toISOString() })
          .eq("id", stock.id);
      }
      await supabase.from("stock_ledger").delete().eq("id", l.id);
    }
  }

  await supabase.from("wastage_sales").delete().eq("id", sale.id);
}
