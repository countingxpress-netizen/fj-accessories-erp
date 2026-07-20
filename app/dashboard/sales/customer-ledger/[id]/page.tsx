import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { notFound } from "next/navigation";

export default async function CustomerLedgerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: customer } = await supabase.from("customers").select("*").eq("id", id).single();
  if (!customer) return notFound();

  const { data: invoices } = await supabase
    .from("sales_invoices")
    .select("id, invoice_no, invoice_date, sales_invoice_items(quantity_pcs, unit_price, amount, finished_goods(product_name))")
    .eq("customer_id", id);

  const { data: payments } = await supabase
    .from("customer_payments")
    .select("*")
    .eq("customer_id", id);

  type Row = { date: string; type: "invoice" | "payment"; ref: string; desc: string; debit: number; credit: number };

  const rows: Row[] = [];

  (invoices ?? []).forEach((inv: any) => {
    const amount = (inv.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
    const desc = (inv.sales_invoice_items ?? []).map((i: any) => `${i.finished_goods?.product_name} (${i.quantity_pcs})`).join(", ");
    rows.push({ date: inv.invoice_date, type: "invoice", ref: inv.invoice_no, desc, debit: amount, credit: 0 });
  });

  (payments ?? []).forEach((p: any) => {
    rows.push({ date: p.payment_date, type: "payment", ref: "Payment", desc: p.note || "Payment Received", debit: 0, credit: p.amount });
  });

  rows.sort((a, b) => a.date.localeCompare(b.date));

  let runningBalance = 0;
  const finalRows = rows.map((r) => {
    runningBalance += r.debit - r.credit;
    return { ...r, balance: runningBalance };
  });

  const totalSales = rows.reduce((s, r) => s + r.debit, 0);
  const totalPayments = rows.reduce((s, r) => s + r.credit, 0);

  return (
    <div>
      <Link href="/dashboard/sales/customer-ledger" className="text-sm text-gray-500 hover:underline">← সব Customer-এর তালিকায় ফিরুন</Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">{customer.name}</h1>
      <p className="text-sm text-gray-500 mb-4">{customer.address} {customer.phone && `· ${customer.phone}`}</p>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Reference</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2 text-right">Invoice (Dr)</th>
              <th className="px-4 py-2 text-right">Payment (Cr)</th>
              <th className="px-4 py-2 text-right">Due Balance</th>
            </tr>
          </thead>
          <tbody>
            {finalRows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="px-4 py-2 text-gray-500">{formatDate(r.date)}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${r.type === "invoice" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                    {r.type === "invoice" ? "Invoice" : "Payment"}
                  </span>
                </td>
                <td className="px-4 py-2">{r.ref}</td>
                <td className="px-4 py-2 text-gray-600">{r.desc}</td>
                <td className="px-4 py-2 text-right">{r.debit ? r.debit.toFixed(2) : ""}</td>
                <td className="px-4 py-2 text-right">{r.credit ? r.credit.toFixed(2) : ""}</td>
                <td className="px-4 py-2 text-right font-medium">{r.balance.toFixed(2)}</td>
              </tr>
            ))}
            {finalRows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Invoice/Payment নেই</td></tr>
            )}
          </tbody>
          <tfoot className="border-t-2 font-semibold bg-gray-50">
            <tr>
              <td colSpan={4} className="px-4 py-3 text-right">Total</td>
              <td className="px-4 py-3 text-right">{totalSales.toFixed(2)}</td>
              <td className="px-4 py-3 text-right">{totalPayments.toFixed(2)}</td>
              <td className="px-4 py-3 text-right">{runningBalance.toFixed(2)} (বাকি)</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}