import { createClient } from "@/lib/supabase/client";
import { DeleteResult, friendlyDeleteError } from "@/lib/deleteResult";
import { recalcBookingStatus } from "@/lib/recalcBookingStatus";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Deletes a Delivery Challan, restores finished_goods_stock for every
 * stock_ledger entry it created, then recalculates the linked booking's
 * status (delivered/partial state depends on remaining challans).
 */
export async function deleteChallanCascade(
  supabase: SupabaseClient,
  challanId: string,
  bookingId?: string | null
): Promise<DeleteResult> {
  const { data: ledgerEntries } = await supabase
    .from("stock_ledger").select("*").eq("reference_type", "delivery").eq("reference_id", challanId);

  for (const entry of ledgerEntries ?? []) {
    const { data: stock } = await supabase
      .from("finished_goods_stock").select("*")
      .eq("product_id", entry.item_id).eq("warehouse_id", entry.warehouse_id).maybeSingle();
    if (stock) {
      await supabase.from("finished_goods_stock")
        .update({ quantity_pcs: stock.quantity_pcs + entry.quantity, updated_at: new Date().toISOString() })
        .eq("id", stock.id);
    } else {
      await supabase.from("finished_goods_stock").insert({
        product_id: entry.item_id, warehouse_id: entry.warehouse_id, quantity_pcs: entry.quantity,
      });
    }
  }
  await supabase.from("stock_ledger").delete().eq("reference_type", "delivery").eq("reference_id", challanId);
  await supabase.from("delivery_challan_items").delete().eq("challan_id", challanId);
  const { error } = await supabase.from("delivery_challans").delete().eq("id", challanId);

  if (error) return { ok: false, error: friendlyDeleteError(error) };

  if (bookingId) await recalcBookingStatus(supabase, bookingId);
  return { ok: true };
}
