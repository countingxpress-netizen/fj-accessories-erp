import { createClient } from "@/lib/supabase/client";
import { DeleteResult, friendlyDeleteError } from "@/lib/deleteResult";
import { reverseInventoryJv } from "@/lib/inventoryCost";
import { syncAutoInvoiceForGroup } from "@/lib/autoInvoiceFromBooking";

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
  const { data: invoiceItems } = await supabase
    .from("sales_invoice_items")
    .select("id, invoice_id")
    .eq("booking_id", bookingId);

  // এই booking-এর invoice item-গুলো কোন invoice-এ, আর সেগুলো auto না হাতে তৈরি —
  // embed এড়িয়ে আলাদা query (embed-এর array/object আচরণ role-ভেদে বদলাতে পারে)
  const invoiceIds = Array.from(new Set((invoiceItems ?? []).map((i: any) => i.invoice_id).filter(Boolean)));
  let autoInvoiceIds = new Set<string>();
  if (invoiceIds.length > 0) {
    const { data: invs } = await supabase.from("sales_invoices").select("id, auto_generated").in("id", invoiceIds);
    autoInvoiceIds = new Set((invs ?? []).filter((v: any) => v.auto_generated).map((v: any) => v.id));
  }

  // Booking সেভ করলে যে auto Sales Invoice তৈরি হয় সেটা delete আটকায় না — নিচে
  // cascade-এর সাথে re-sync হবে। শুধু হাতে তৈরি invoice বা Delivery Challan থাকলে আটকাবে।
  const hasManualInvoice = invoiceIds.some((id) => !autoInvoiceIds.has(id));
  if ((challanItems && challanItems.length > 0) || hasManualInvoice) {
    return { ok: false, error: "এই বুকিং-এর সাথে Delivery Challan বা হাতে তৈরি Sales Invoice যুক্ত আছে, তাই মুছে ফেলা যাবে না।" };
  }

  // booking-এর নিজস্ব RM-issue JV (Dr WIP / Cr material inv) — voucher delete-এর
  // আগে reference null করা হয়, নাহলে plain FK-এ আটকে লাইনহীন orphan থেকে যায়
  const { data: bookingRow } = await supabase.from("bookings").select("inventory_voucher_id, booking_group_id").eq("id", bookingId).maybeSingle();

  // auto Sales Invoice থাকলে — এই booking-এর লাইন সরাও (FK আনব্লক); booking delete-এর
  // পরে group re-sync হবে (বাকি booking থাকলে invoice আপডেট, না থাকলে invoice + JV মুছবে)
  const autoInvoiceItemIds = (invoiceItems ?? []).filter((i: any) => autoInvoiceIds.has(i.invoice_id)).map((i: any) => i.id);
  if (autoInvoiceItemIds.length > 0) {
    await supabase.from("sales_invoice_items").delete().in("id", autoInvoiceItemIds);
  }
  await reverseInventoryJv(supabase, bookingRow?.inventory_voucher_id, {
    unlink: { table: "bookings", column: "inventory_voucher_id", id: bookingId },
  });

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
      await reverseInventoryJv(supabase, r.inventory_voucher_id, {
        unlink: { table: "finished_goods_receive", column: "inventory_voucher_id", id: r.id },
      });
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
      await reverseInventoryJv(supabase, w.inventory_voucher_id, {
        unlink: { table: "wastage", column: "inventory_voucher_id", id: w.id },
      });
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

  // booking মুছে যাওয়ার পর group-এর auto Sales Invoice ঠিক করা — বাকি booking-এর
  // সাথে মিলিয়ে invoice + JV নতুন করে, group খালি হলে invoice + JV মুছে যাবে
  if (bookingRow?.booking_group_id) {
    await syncAutoInvoiceForGroup(supabase, bookingRow.booking_group_id, {});
  }

  return { ok: true };
}
