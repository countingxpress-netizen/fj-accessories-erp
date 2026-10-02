import { createClient } from "@/lib/supabase/client";
import { accountIdByCode, makeVoucher, reverseInventoryJv } from "@/lib/inventoryCost";

// Material খরচ (consumption → Expense) — যেমন মাস শেষে এডহেসিভ কত কার্টন খরচ হলো।
//   স্টক      : raw_material_stock কমে + stock_ledger "out" (reference_type='material_expense',
//               reference_id = JV-এর id)
//   JV        : Dr বেছে নেওয়া Expense হেড (যেমন 5011 এডহেসিভ খরচ) / Cr material-এর inventory
//               account (raw_materials.inventory_account_code, যেমন 1204 Adhesive)
//   টাকা      : পরিমাণ × রেট (ডিফল্ট রেট = avg_cost_per_lbs; কার্টনের জন্যও এই কলামেই রেট থাকে)
// আলাদা টেবিল নেই — এন্ট্রি = JV (source='material_expense') + তার stock_ledger লাইন।

type Client = ReturnType<typeof createClient>;

export const MATERIAL_EXPENSE_SOURCE = "material_expense";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type MaterialExpenseInput = {
  date: string;
  materialId: string;
  materialName: string;
  inventoryAccountCode: string | null;
  warehouseId: string;
  quantity: number;
  rate: number;
  expenseAccountId: string;
  note: string;
};

export async function createMaterialExpense(
  supabase: Client, input: MaterialExpenseInput,
): Promise<{ ok: boolean; error?: string }> {
  const amount = round2(input.quantity * input.rate);
  if (!(input.quantity > 0) || !(amount > 0)) return { ok: false, error: "পরিমাণ ও রেট শূন্যের বেশি হতে হবে।" };

  const invId = await accountIdByCode(supabase, input.inventoryAccountCode || "1299");
  if (!invId) return { ok: false, error: `Inventory account ${input.inventoryAccountCode} পাওয়া যায়নি।` };

  const memo = `${input.materialName} খরচ — ${input.quantity}${input.note ? ` — ${input.note}` : ""}`;
  const voucherId = await makeVoucher(supabase, input.date, memo, [
    { account_id: input.expenseAccountId, debit: amount, credit: 0, memo },
    { account_id: invId, debit: 0, credit: amount, memo },
  ], MATERIAL_EXPENSE_SOURCE);
  if (!voucherId) return { ok: false, error: "JV বানানো যায়নি।" };

  const { data: stock } = await supabase
    .from("raw_material_stock").select("*")
    .eq("material_id", input.materialId).eq("warehouse_id", input.warehouseId).maybeSingle();
  if (stock) {
    await supabase.from("raw_material_stock")
      .update({ quantity_lbs: Number(stock.quantity_lbs) - input.quantity, updated_at: new Date().toISOString() })
      .eq("id", stock.id);
  } else {
    await supabase.from("raw_material_stock")
      .insert({ material_id: input.materialId, warehouse_id: input.warehouseId, quantity_lbs: -input.quantity });
  }
  const { error } = await supabase.from("stock_ledger").insert({
    item_type: "raw_material", item_id: input.materialId, warehouse_id: input.warehouseId,
    txn_type: "out", quantity: input.quantity,
    reference_type: MATERIAL_EXPENSE_SOURCE, reference_id: voucherId, txn_date: input.date,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** এন্ট্রি মুছে — স্টক ফেরত + stock_ledger লাইন মুছে + JV মুছে। */
export async function deleteMaterialExpense(supabase: Client, voucherId: string): Promise<void> {
  const { data: ledgers } = await supabase
    .from("stock_ledger").select("*")
    .eq("reference_type", MATERIAL_EXPENSE_SOURCE).eq("reference_id", voucherId);
  for (const l of ledgers ?? []) {
    const { data: stock } = await supabase
      .from("raw_material_stock").select("*")
      .eq("material_id", l.item_id).eq("warehouse_id", l.warehouse_id).maybeSingle();
    if (stock) {
      await supabase.from("raw_material_stock")
        .update({ quantity_lbs: Number(stock.quantity_lbs) + Number(l.quantity), updated_at: new Date().toISOString() })
        .eq("id", stock.id);
    }
    await supabase.from("stock_ledger").delete().eq("id", l.id);
  }
  await reverseInventoryJv(supabase, voucherId);
}
