import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProformaTable from "./ProformaTable";
import { AT_DEFAULT_MARKUP_PERCENTAGE } from "@/lib/atCommission";
import { calcInvoiceCommission } from "@/lib/commission";

export default async function ProformaListPage() {
  const supabase = await createClient();
  const { data: pis } = await supabase
    .from("proforma_invoices")
    .select(`*, customers(name, price_per_lbs, code, commission_enabled, commission_percentage),
      pi_items(qty_pcs, booking_id, bookings(garments_name, quantity_pcs, buyer_id, required_lbs, measurement_type, measurement_unit, length_val, width_val, flap_val, gusset_val)),
      creator:app_users!proforma_invoices_created_by_fkey(full_name)`)
    .order("pi_date", { ascending: false })
    .order("created_at", { ascending: false });
  // real_amount/commission_amount আগের কোনো সেশনে DB-তে বসলেও এখানে select("*") দিয়েই আসবে

  // প্রতিটা PI-এর সাথে যুক্ত booking_id গুলোর বিপরীতে sales_invoice_items থেকে মোট বিক্রয় বের করুন
  const bookingIds = Array.from(
    new Set((pis ?? []).flatMap((pi: any) => (pi.pi_items ?? []).map((it: any) => it.booking_id).filter(Boolean)))
  );

  const { data: invoiceItems } = bookingIds.length
    ? await supabase.from("sales_invoice_items").select("booking_id, amount, unit_price, quantity_pcs").in("booking_id", bookingIds)
    : { data: [] };

  const invoiceValueByBooking: Record<string, number> = {};
  const invoiceItemsByBooking: Record<string, { unit_price: number; quantity_pcs: number; amount: number }[]> = {};
  (invoiceItems ?? []).forEach((it: any) => {
    invoiceValueByBooking[it.booking_id] = (invoiceValueByBooking[it.booking_id] ?? 0) + (it.amount || 0);
    (invoiceItemsByBooking[it.booking_id] ??= []).push({ unit_price: it.unit_price || 0, quantity_pcs: it.quantity_pcs || 0, amount: it.amount || 0 });
  });

  // Commission (Sales Invoice লিস্টের ঠিক একই ফর্মুলা — lib/commission.ts) — অটো হিসাবের
  // জন্য প্রতিটা booking-এর buyer markup_percentage লাগে (শুধু AT কাস্টমারের জন্য)।
  const buyerIds = Array.from(
    new Set(
      (pis ?? [])
        .flatMap((pi: any) => (pi.pi_items ?? []).map((it: any) => it.bookings?.buyer_id))
        .filter(Boolean)
    )
  ) as string[];
  const { data: buyers } = buyerIds.length
    ? await supabase.from("buyers").select("id, name, markup_percentage").in("id", buyerIds)
    : { data: [] };
  const markupMap: Record<string, number> = {};
  const buyerNameMap: Record<string, string> = {};
  (buyers ?? []).forEach((b: any) => { markupMap[b.id] = b.markup_percentage ?? AT_DEFAULT_MARKUP_PERCENTAGE; buyerNameMap[b.id] = b.name; });

  const rows = (pis ?? []).map((pi: any) => {
    // booking-লিংকড PI-তে sales_invoice_items থেকে অটো — Manual PI-তে ০,
    // তখন pi.real_amount (হাতে বসানো) প্রাধান্য পাবে (ProformaRow-এর ভেতরে)
    const autoSalesInvoiceValue = (pi.pi_items ?? []).reduce(
      (s: number, it: any) => s + (invoiceValueByBooking[it.booking_id] ?? 0), 0
    );
    const garments = Array.from(
      new Set((pi.pi_items ?? []).map((it: any) => it.bookings?.garments_name).filter(Boolean))
    ).join(", ");

    const commissionItems = (pi.pi_items ?? []).flatMap((it: any) => {
      const b = it.bookings;
      const lines = invoiceItemsByBooking[it.booking_id] ?? [];
      return lines.map((line) => ({
        unit_price: line.unit_price, quantity_pcs: line.quantity_pcs, amount: line.amount,
        order_lbs: b?.required_lbs || 0,
        markup_pct: b?.buyer_id ? (markupMap[b.buyer_id] ?? AT_DEFAULT_MARKUP_PERCENTAGE) : AT_DEFAULT_MARKUP_PERCENTAGE,
        buyer_name: b?.buyer_id ? (buyerNameMap[b.buyer_id] ?? null) : null,
        measurement: b ? {
          type: b.measurement_type ?? null, length: b.length_val ?? null, width: b.width_val ?? null,
          flap: b.flap_val ?? null, gusset: b.gusset_val ?? null, unit: b.measurement_unit ?? null,
        } : null,
      }));
    });
    const autoCommission = calcInvoiceCommission(
      pi.customers?.code ?? null,
      !!pi.customers?.commission_enabled,
      Number(pi.customers?.commission_percentage ?? 1),
      commissionItems,
    );

    return { pi, autoSalesInvoiceValue, autoCommission, garments: garments || "-" };
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Proforma Invoices</h1>
        <Link href="/dashboard/lc-export/proforma/new" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">+ নতুন PI</Link>
      </div>
      <ProformaTable rows={rows} />
    </div>
  );
}
