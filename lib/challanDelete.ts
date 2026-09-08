import { createClient } from "@/lib/supabase/client";
import { DeleteResult, friendlyDeleteError } from "@/lib/deleteResult";
import { recalcBookingStatus } from "@/lib/recalcBookingStatus";
import { reverseChallanDerived } from "@/lib/challanWrite";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Deletes a Delivery Challan and undoes everything it created (shipment COGS JV,
 * challan-triggered FG receive + production completion, finished_goods_stock,
 * stock_ledger). Kept for programmatic/cleanup use — the UI no longer deletes
 * challans, only edits the latest one (lib/challanWrite.ts).
 */
export async function deleteChallanCascade(
  supabase: SupabaseClient,
  challanId: string,
  _bookingId?: string | null,
): Promise<DeleteResult> {
  const bookingIds = await reverseChallanDerived(supabase, challanId, { removeItems: true });

  const { error } = await supabase.from("delivery_challans").delete().eq("id", challanId);
  if (error) return { ok: false, error: friendlyDeleteError(error) };

  for (const bId of bookingIds) await recalcBookingStatus(supabase, bId);
  return { ok: true };
}
