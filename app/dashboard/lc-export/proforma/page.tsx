import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProformaRow from "./ProformaRow";

export default async function ProformaListPage() {
  const supabase = await createClient();
  const { data: pis } = await supabase
    .from("proforma_invoices")
    .select("*, customers(name, price_per_lbs), pi_items(qty_pcs, booking_id, bookings(garments_name, quantity_pcs))")
    .order("pi_date", { ascending: false });

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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Proforma Invoices</h1>
        <Link href="/dashboard/lc-export/proforma/new" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">+ নতুন PI</Link>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">PI No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Garments</th>
              <th className="px-4 py-2 text-right">PI Value</th>
              <th className="px-4 py-2 text-right">Sales Invoice Value</th>
              <th className="px-4 py-2 text-right">Difference</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(pis ?? []).map((pi: any) => {
              const salesInvoiceValue = (pi.pi_items ?? []).reduce(
                (s: number, it: any) => s + (invoiceValueByBooking[it.booking_id] ?? 0), 0
              );
              const garments = Array.from(
                new Set((pi.pi_items ?? []).map((it: any) => it.bookings?.garments_name).filter(Boolean))
              ).join(", ");
              return (
                <ProformaRow key={pi.id} pi={pi} salesInvoiceValue={salesInvoiceValue} garments={garments || "-"} />
              );
            })}
            {(!pis || pis.length === 0) && (
              <tr><td colSpan={9} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Proforma Invoice নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}