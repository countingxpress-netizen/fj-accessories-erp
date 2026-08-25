import { createClient } from "@/lib/supabase/client";
import { DeleteResult } from "@/lib/deleteResult";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Deletes a Purchase Entry: reverses the raw_material_stock increments it
 * made (via its "purchase" stock_ledger entries), deletes those ledger
 * entries + purchase_entry_items, cleans up a linked Journal Voucher if one
 * exists (voucherId), then deletes the entry itself.
 */
export async function deletePurchaseEntryCascade(
  supabase: SupabaseClient,
  entryId: string,
  voucherId?: string | null
): Promise<DeleteResult> {
  const { data: ledgerEntries } = await supabase
    .from("stock_ledger").select("*").eq("reference_type", "purchase").eq("reference_id", entryId);

  for (const ledgerEntry of ledgerEntries ?? []) {
    const { data: stock } = await supabase
      .from("raw_material_stock").select("*")
      .eq("material_id", ledgerEntry.item_id).eq("warehouse_id", ledgerEntry.warehouse_id).maybeSingle();
    if (stock) {
      await supabase.from("raw_material_stock")
        .update({ quantity_lbs: stock.quantity_lbs - ledgerEntry.quantity, updated_at: new Date().toISOString() })
        .eq("id", stock.id);
    }
  }
  await supabase.from("stock_ledger").delete().eq("reference_type", "purchase").eq("reference_id", entryId);
  await supabase.from("purchase_entry_items").delete().eq("entry_id", entryId);

  if (voucherId) {
    await supabase.from("journal_entry_lines").delete().eq("voucher_id", voucherId);
    await supabase.from("journal_vouchers").delete().eq("id", voucherId);
  }

  const { error } = await supabase.from("purchase_entries").delete().eq("id", entryId);
  if (error) return { ok: false, error: "মুছে ফেলা যায়নি: " + error.message };
  return { ok: true };
}
