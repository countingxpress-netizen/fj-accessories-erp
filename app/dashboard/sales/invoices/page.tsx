import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import InvoiceRow from "./InvoiceRow";

export default async function SalesInvoiceListPage() {
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("sales_invoices")
    .select("*, customers(name), sales_invoice_items(quantity_pcs, unit_price, amount, bookings(booking_no))")
    .order("invoice_date", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Sales Invoices</h1>
        <Link href="/dashboard/sales/invoices/new" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">+ নতুন Sales Invoice</Link>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Invoice No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Bookings</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Total Amount</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(invoices ?? []).map((inv: any) => <InvoiceRow key={inv.id} invoice={inv} />)}
            {(!invoices || invoices.length === 0) && (
              <tr><td colSpan={7} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Sales Invoice নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}