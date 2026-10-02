import { createClient } from "@/lib/supabase/client";
import { DeleteResult, friendlyDeleteError } from "@/lib/deleteResult";
import { recomputeRawAvgCost } from "@/lib/inventoryCost";
import { reverseFreightVouchersForEntry } from "@/lib/purchaseFreight";
import { adjustRawStock } from "@/lib/stockAdjust";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Deletes a Purchase Entry: reverses the raw_material_stock increments it
 * made (via its "purchase" stock_ledger entries), deletes those ledger
 * entries + purchase_entry_items, reverses any freight charge JVs, cleans up
 * the linked purchase Journal Voucher (voucherId), deletes the entry itself
 * (which cascade-deletes its purchase_freight_charges rows), then recomputes
 * the weighted-average cost of every material the entry touched.
 */
export async function deletePurchaseEntryCascade(
  supabase: SupabaseClient,
  entryId: string,
  voucherId?: string | null
): Promise<DeleteResult> {
  // এই entry কোন কোন material ছুঁয়েছে — শেষে avg cost recompute করতে
  const { data: entryItems } = await supabase
    .from("purchase_entry_items").select("material_id").eq("entry_id", entryId);
  const materialIds = Array.from(
    new Set((entryItems ?? []).map((r) => r.material_id).filter(Boolean))
  ) as string[];

  const { data: ledgerEntries } = await supabase
    .from("stock_ledger").select("*").eq("reference_type", "purchase").eq("reference_id", entryId);

  for (const ledgerEntry of ledgerEntries ?? []) {
    await adjustRawStock(supabase, ledgerEntry.item_id, ledgerEntry.warehouse_id, -ledgerEntry.quantity);
  }
  await supabase.from("stock_ledger").delete().eq("reference_type", "purchase").eq("reference_id", entryId);
  await supabase.from("purchase_entry_items").delete().eq("entry_id", entryId);

  // freight charge-এর JV আগে মুছুন (charge row-গুলো entry cascade-এ মুছবে)
  await reverseFreightVouchersForEntry(supabase, entryId);

  // entry row আগে মুছুন — voucher_id plain FK, তাই voucher আগে মুছতে গেলে
  // আটকে যায় আর একটা লাইনহীন orphan voucher থেকে যায়
  const { error } = await supabase.from("purchase_entries").delete().eq("id", entryId);
  if (error) return { ok: false, error: friendlyDeleteError(error) };

  if (voucherId) {
    await supabase.from("journal_entry_lines").delete().eq("voucher_id", voucherId);
    await supabase.from("journal_vouchers").delete().eq("id", voucherId);
  }

  for (const mid of materialIds) await recomputeRawAvgCost(supabase, mid);
  return { ok: true };
}
