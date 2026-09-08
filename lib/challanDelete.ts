import { createClient } from "@/lib/supabase/client";
import { DeleteResult, friendlyDeleteError } from "@/lib/deleteResult";
import { recalcBookingStatus } from "@/lib/recalcBookingStatus";
import { reverseInventoryJv } from "@/lib/inventoryCost";
import { reverseChallanFulfilment } from "@/lib/challanProduction";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Deletes a Delivery Challan and undoes everything it created:
 *   • shipment COGS JV (Dr 5050 / Cr 1210) reversed
 *   • challan-triggered FG Receive(s) reversed — WIP cost back to the production
 *     order, finished_goods_receive rows removed, production stage rolled back if
 *     this challan was the only reason it finished (lib/challanProduction.ts)
 *   • finished_goods_stock restored for every stock_ledger entry (both the
 *     'challan_receive' in and the 'delivery' out)
 *   • linked bookings' statuses recalculated (one challan may span many bookings)
 */
export async function deleteChallanCascade(
  supabase: SupabaseClient,
  challanId: string,
  _bookingId?: string | null,
): Promise<DeleteResult> {
  // shipment-এর COGS JV উল্টে দিন (voucher delete-এর আগে challan-এর
  // inventory_voucher_id null করে, নাহলে plain FK-এ আটকে orphan থেকে যায়)
  const { data: challanRow } = await supabase
    .from("delivery_challans").select("inventory_voucher_id").eq("id", challanId).maybeSingle();
  await reverseInventoryJv(supabase, challanRow?.inventory_voucher_id, {
    unlink: { table: "delivery_challans", column: "inventory_voucher_id", id: challanId },
  });

  // চালান-ট্রিগার করা FG Receive + production completion উল্টান
  await reverseChallanFulfilment(supabase, challanId);

  // shipment (out) ledger থেকে finished_goods_stock ফেরত
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

  // এই challan-এর সব booking (item.booking_id) — delete-এর আগে সংগ্রহ করে রাখি
  const { data: itemRows } = await supabase
    .from("delivery_challan_items").select("booking_id").eq("challan_id", challanId);
  const bookingIds = Array.from(
    new Set([
      ...(itemRows ?? []).map((i: any) => i.booking_id).filter(Boolean),
      ...(_bookingId ? [_bookingId] : []),
    ]),
  );

  await supabase.from("delivery_challan_items").delete().eq("challan_id", challanId);
  const { error } = await supabase.from("delivery_challans").delete().eq("id", challanId);

  if (error) return { ok: false, error: friendlyDeleteError(error) };

  for (const bId of bookingIds) await recalcBookingStatus(supabase, bId as string);
  return { ok: true };
}
