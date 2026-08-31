import { createClient } from "@/lib/supabase/client";
import { DeleteResult, friendlyDeleteError } from "@/lib/deleteResult";
import { reverseInventoryJv } from "@/lib/inventoryCost";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Deletes a single booking and reverses everything it caused:
 * production_orders (+ material_consumption / finished_goods_receive /
 * wastage stock reversals), booking_materials, then the booking itself.
 * Refuses if a Delivery Challan or Sales Invoice already references it.
 *
 * No confirm()/alert() here — callers (single-row delete, bulk delete)
 * own the UI around this so the same cascade logic isn't duplicated.
 */
export async function deleteBookingCascade(
  supabase: SupabaseClient,
  bookingId: string
): Promise<DeleteResult> {
  const { data: challanItems } = await supabase.from("delivery_challans").select("id").eq("booking_id", bookingId);
  const { data: invoiceItems } = await supabase.from("sales_invoice_items").select("id").eq("booking_id", bookingId);
  if ((challanItems && challanItems.length > 0) || (invoiceItems && invoiceItems.length > 0)) {
    return { ok: false, error: "এই বুকিং-এর সাথে ইতিমধ্যে Delivery Challan বা Sales Invoice যুক্ত আছে, তাই মুছে ফেলা যাবে না।" };
  }

  // booking-এর নিজস্ব RM-issue JV (Dr WIP / Cr material inv)
  const { data: bookingRow } = await supabase.from("bookings").select("inventory_voucher_id").eq("id", bookingId).maybeSingle();
  await reverseInventoryJv(supabase, bookingRow?.inventory_voucher_id);

  const { data: prodOrders } = await supabase.from("production_orders").select("id").eq("booking_id", bookingId);
  for (const po of prodOrders ?? []) {
    const { data: consumptions } = await supabase.from("material_consumption").select("*").eq("production_id", po.id);
    for (const c of consumptions ?? []) {
      const { data: ledgerEntry } = await supabase
        .from("stock_ledger").select("*")
        .eq("reference_type", "production").eq("reference_id", po.id).eq("item_id", c.material_id).maybeSingle();
      if (ledgerEntry) {
        const { data: stock } = await supabase
          .from("raw_material_stock").select("*")
          .eq("material_id", c.material_id).eq("warehouse_id", ledgerEntry.warehouse_id).maybeSingle();
        if (stock) {
          await supabase.from("raw_material_stock")
            .update({ quantity_lbs: stock.quantity_lbs + c.quantity_lbs, updated_at: new Date().toISOString() })
            .eq("id", stock.id);
        }
        await supabase.from("stock_ledger").delete().eq("id", ledgerEntry.id);
      }
    }
    await supabase.from("material_consumption").delete().eq("production_id", po.id);

    const { data: receives } = await supabase.from("finished_goods_receive").select("*").eq("production_id", po.id);
    for (const r of receives ?? []) {
      await reverseInventoryJv(supabase, r.inventory_voucher_id);
      const { data: ledgerEntry } = await supabase
        .from("stock_ledger").select("*")
        .eq("reference_type", "production").eq("reference_id", po.id)
        .eq("item_type", "finished_goods").eq("item_id", r.product_id).maybeSingle();
      if (ledgerEntry) {
        const { data: stock } = await supabase
          .from("finished_goods_stock").select("*")
          .eq("product_id", r.product_id).eq("warehouse_id", ledgerEntry.warehouse_id).maybeSingle();
        if (stock) {
          await supabase.from("finished_goods_stock")
            .update({ quantity_pcs: stock.quantity_pcs - r.quantity_pcs, updated_at: new Date().toISOString() })
            .eq("id", stock.id);
        }
        await supabase.from("stock_ledger").delete().eq("id", ledgerEntry.id);
      }
    }
    await supabase.from("finished_goods_receive").delete().eq("production_id", po.id);

    const { data: wastages } = await supabase.from("wastage").select("*").eq("production_id", po.id);
    for (const w of wastages ?? []) {
      await reverseInventoryJv(supabase, w.inventory_voucher_id);
      if (w.recycled) {
        const { data: ledgerEntry } = await supabase
          .from("stock_ledger").select("*")
          .eq("reference_type", "wastage").eq("reference_id", po.id).maybeSingle();
        if (ledgerEntry) {
          const { data: stock } = await supabase
            .from("raw_material_stock").select("*")
            .eq("material_id", ledgerEntry.item_id).eq("warehouse_id", ledgerEntry.warehouse_id).maybeSingle();
          if (stock) {
            await supabase.from("raw_material_stock")
              .update({ quantity_lbs: stock.quantity_lbs - ledgerEntry.quantity, updated_at: new Date().toISOString() })
              .eq("id", stock.id);
          }
          await supabase.from("stock_ledger").delete().eq("id", ledgerEntry.id);
        }
      }
    }
    await supabase.from("wastage").delete().eq("production_id", po.id);
  }

  const { error: prodOrderDeleteError } = await supabase.from("production_orders").delete().eq("booking_id", bookingId);
  if (prodOrderDeleteError) {
    return { ok: false, error: friendlyDeleteError(prodOrderDeleteError) };
  }
  await supabase.from("booking_materials").delete().eq("booking_id", bookingId);

  const { error } = await supabase.from("bookings").delete().eq("id", bookingId);
  if (error) {
    return { ok: false, error: friendlyDeleteError(error) };
  }
  return { ok: true };
}
