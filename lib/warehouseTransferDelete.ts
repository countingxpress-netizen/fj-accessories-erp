import { createClient } from "@/lib/supabase/client";
import { DeleteResult, friendlyDeleteError } from "@/lib/deleteResult";
import { adjustRawStock } from "@/lib/stockAdjust";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Deletes a Warehouse Transfer: reverses both stock_ledger legs it created
 * (the "out" at the source warehouse and the "in" at the destination
 * warehouse) against raw_material_stock, deletes those ledger entries, then
 * deletes the transfer itself.
 */
export async function deleteWarehouseTransferCascade(
  supabase: SupabaseClient,
  transferId: string,
  referenceType: "stock_transfer" | "wastage_transfer"
): Promise<DeleteResult> {
  const { data: ledgerEntries } = await supabase
    .from("stock_ledger").select("*").eq("reference_type", referenceType).eq("reference_id", transferId);

  for (const ledgerEntry of ledgerEntries ?? []) {
    const delta = ledgerEntry.txn_type === "in" ? -ledgerEntry.quantity : ledgerEntry.quantity;
    await adjustRawStock(supabase, ledgerEntry.item_id, ledgerEntry.warehouse_id, delta);
  }
  await supabase.from("stock_ledger").delete().eq("reference_type", referenceType).eq("reference_id", transferId);

  const { error } = await supabase.from("warehouse_transfers").delete().eq("id", transferId);
  if (error) return { ok: false, error: friendlyDeleteError(error) };
  return { ok: true };
}
