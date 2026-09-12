import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProformaTable from "./ProformaTable";

export default async function ProformaListPage() {
  const supabase = await createClient();
  const { data: pis } = await supabase
    .from("proforma_invoices")
    .select("*, customers(name, price_per_lbs), pi_items(qty_pcs, booking_id, bookings(garments_name, quantity_pcs)), creator:app_users!proforma_invoices_created_by_fkey(full_name)")
    .order("pi_date", { ascending: false })
    .order("created_at", { ascending: false });
  // real_amount/commission_amount আগের কোনো সেশনে DB-তে বসলেও এখানে select("*") দিয়েই আসবে

  // প্রতিটা PI-এর সাথে যুক্ত booking_id গুলোর বিপরীতে sales_invoice_items থেকে মোট বিক্রয় বের করুন
  const bookingIds = Array.from(
    new Set((pis ?? []).flatMap((pi: any) => (pi.pi_items ?? []).map((it: any) => it.booking_id).filter(Boolean)))
  );

  const { data: invoiceItems } = bookingIds.length
    ? await supabase.from("sales_invoice_items").select("booking_id, amount").in("booking_id", bookingIds)
    : { data: [] };

  const invoiceValueByBooking: Record<string, number> = {};
  (invoiceItems ?? []).forEach((it: any) => {
    invoiceValueByBooking[it.booking_id] = (invoiceValueByBooking[it.booking_id] ?? 0) + (it.amount || 0);
  });

  const rows = (pis ?? []).map((pi: any) => {
    // booking-লিংকড PI-তে sales_invoice_items থেকে অটো — Manual PI-তে ০,
    // তখন pi.real_amount (হাতে বসানো) প্রাধান্য পাবে (ProformaRow-এর ভেতরে)
    const autoSalesInvoiceValue = (pi.pi_items ?? []).reduce(
      (s: number, it: any) => s + (invoiceValueByBooking[it.booking_id] ?? 0), 0
    );
    const garments = Array.from(
      new Set((pi.pi_items ?? []).map((it: any) => it.bookings?.garments_name).filter(Boolean))
    ).join(", ");
    return { pi, autoSalesInvoiceValue, garments: garments || "-" };
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