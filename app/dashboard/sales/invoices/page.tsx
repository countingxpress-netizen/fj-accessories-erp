import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import InvoicesTable from "./InvoicesTable";

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

      <InvoicesTable invoices={invoices ?? []} />
    </div>
  );
}
