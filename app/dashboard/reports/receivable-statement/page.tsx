import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";

export default async function ReceivableStatementPage() {
  const supabase = await createClient();

  const { data: customers } = await supabase.from("customers").select("id, name").order("name");
  const { data: invoices } = await supabase
    .from("sales_invoices")
    .select("customer_id, invoice_no, invoice_date, sales_invoice_items(amount)");
  const { data: payments } = await supabase.from("customer_payments").select("customer_id, amount, payment_date");

  const customerData: Record<string, { invoiced: number; paid: number; lastInvoiceDate: string | null }> = {};

  (invoices ?? []).forEach((inv: any) => {
    const amt = (inv.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
    if (!customerData[inv.customer_id]) customerData[inv.customer_id] = { invoiced: 0, paid: 0, lastInvoiceDate: null };
    customerData[inv.customer_id].invoiced += amt;
    if (!customerData[inv.customer_id].lastInvoiceDate || inv.invoice_date > customerData[inv.customer_id].lastInvoiceDate!) {
      customerData[inv.customer_id].lastInvoiceDate = inv.invoice_date;
    }
  });

  (payments ?? []).forEach((p: any) => {
    if (!customerData[p.customer_id]) customerData[p.customer_id] = { invoiced: 0, paid: 0, lastInvoiceDate: null };
    customerData[p.customer_id].paid += p.amount;
  });

  const rows = (customers ?? [])
    .map((c) => {
      const d = customerData[c.id] ?? { invoiced: 0, paid: 0, lastInvoiceDate: null };
      return { ...c, ...d, due: d.invoiced - d.paid };
    })
    .filter((r) => r.due > 0)
    .sort((a, b) => b.due - a.due);

  const totalDue = rows.reduce((s, r) => s + r.due, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Receivable Statement (Customer Wise)</h1>
        <Link href="/dashboard/reports" className="text-sm text-gray-500 hover:underline">← Reports-এ ফিরুন</Link>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm mb-6 max-w-xs">
        <p className="text-xs text-gray-500">Total Outstanding Receivable</p>
        <p className="text-lg font-semibold text-blue-700">{totalDue.toFixed(2)}</p>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Last Invoice</th>
              <th className="px-4 py-2 text-right">Total Invoiced</th>
              <th className="px-4 py-2 text-right">Total Paid</th>
              <th className="px-4 py-2 text-right">Due</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2">
                  <Link href={`/dashboard/sales/customer-ledger/${r.id}`} className="hover:underline hover:text-blue-700">{r.name}</Link>
                </td>
                <td className="px-4 py-2 text-gray-500">{r.lastInvoiceDate ? formatDate(r.lastInvoiceDate) : "-"}</td>
                <td className="px-4 py-2 text-right">{r.invoiced.toFixed(2)}</td>
                <td className="px-4 py-2 text-right">{r.paid.toFixed(2)}</td>
                <td className="px-4 py-2 text-right font-medium">{r.due.toFixed(2)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-3 text-gray-400 italic">কোনো বকেয়া নেই</td></tr>
            )}
          </tbody>
          <tfoot className="border-t-2 font-semibold bg-gray-50">
            <tr><td colSpan={4} className="px-4 py-3 text-right">Total Due</td><td className="px-4 py-3 text-right">{totalDue.toFixed(2)}</td></tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}