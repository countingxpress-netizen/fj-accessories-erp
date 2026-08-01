import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { notFound } from "next/navigation";

function getRangeDates(range: string | undefined, customFrom?: string, customTo?: string) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (range === "this_month") {
    return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  }
  if (range === "previous_month") {
    return { from: fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: fmt(new Date(now.getFullYear(), now.getMonth(), 0)) };
  }
  if (range === "this_year") {
    return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
  }
  if (range === "previous_year") {
    return { from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31` };
  }
  if (range === "custom") {
    return { from: customFrom || undefined, to: customTo || undefined };
  }
  return { from: undefined, to: undefined };
}

export default async function CustomerLedgerDetailPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const { id } = await params;
  const { range, from: customFrom, to: customTo } = await searchParams;
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

  type Row = { date: string; type: "opening" | "invoice" | "payment"; ref: string; desc: string; debit: number; credit: number };
  const rows: Row[] = [];

  if (customer.opening_balance && customer.opening_balance !== 0) {
    rows.push({
      date: customer.opening_balance_date ?? customer.created_at?.slice(0, 10) ?? "2000-01-01",
      type: "opening", ref: "Opening Balance", desc: "পূর্বের বাকি",
      debit: customer.opening_balance, credit: 0,
    });
  }

  (invoices ?? []).forEach((inv: any) => {
    const amount = (inv.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
    const desc = (inv.sales_invoice_items ?? []).map((i: any) => `${i.finished_goods?.product_name} (${i.quantity_pcs})`).join(", ");
    rows.push({ date: inv.invoice_date, type: "invoice", ref: inv.invoice_no, desc, debit: amount, credit: 0 });
  });

  (payments ?? []).forEach((p: any) => {
    rows.push({ date: p.payment_date, type: "payment", ref: "Payment", desc: p.note || "Payment Received", debit: 0, credit: p.amount });
  });

  rows.sort((a, b) => a.date.localeCompare(b.date));

  // পুরো ইতিহাসের running balance
  let runningBalance = 0;
  const allRowsWithBalance = rows.map((r) => {
    runningBalance += r.debit - r.credit;
    return { ...r, balance: runningBalance };
  });

  const { from: rangeFrom, to: rangeTo } = getRangeDates(range, customFrom, customTo);

  let displayRows = allRowsWithBalance;
  let carryForward = 0;

  if (rangeFrom || rangeTo) {
    const before = allRowsWithBalance.filter((r) => rangeFrom && r.date < rangeFrom);
    carryForward = before.length ? before[before.length - 1].balance : 0;

    displayRows = allRowsWithBalance.filter((r) => {
      if (rangeFrom && r.date < rangeFrom) return false;
      if (rangeTo && r.date > rangeTo) return false;
      return true;
    });
  }

  const totalDebit = displayRows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = displayRows.reduce((s, r) => s + r.credit, 0);
  const finalBalance = displayRows.length ? displayRows[displayRows.length - 1].balance : carryForward;

  return (
    <div>
      <Link href="/dashboard/sales/customer-ledger" className="text-sm text-gray-500 hover:underline">← সব Customer-এর তালিকায় ফিরুন</Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">{customer.name}</h1>
      <p className="text-sm text-gray-500 mb-4">{customer.address} {customer.phone && `· ${customer.phone}`}</p>

      <form className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Date Range</label>
          <select name="range" defaultValue={range ?? ""} className="rounded-lg border px-3 py-2 text-sm">
            <option value="">সব (All Time)</option>
            <option value="this_month">This Month</option>
            <option value="previous_month">Previous Month</option>
            <option value="this_year">This Year</option>
            <option value="previous_year">Previous Year</option>
            <option value="custom">Custom Date Range</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From (Custom-এর জন্য)</label>
          <input type="date" name="from" defaultValue={customFrom} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To (Custom-এর জন্য)</label>
          <input type="date" name="to" defaultValue={customTo} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">দেখুন</button>
        {range && (
          <Link href={`/dashboard/sales/customer-ledger/${id}`} className="text-sm text-gray-500 hover:underline">রিসেট করুন</Link>
        )}
      </form>

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
            {(rangeFrom || rangeTo) && (
              <tr className="border-t bg-gray-50/60">
                <td colSpan={6} className="px-4 py-2 font-medium text-gray-600">Opening Balance (এই সময়ের আগ পর্যন্ত)</td>
                <td className="px-4 py-2 text-right font-medium">{carryForward.toFixed(2)}</td>
              </tr>
            )}
            {displayRows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="px-4 py-2 text-gray-500">{formatDate(r.date)}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${r.type === "invoice" ? "bg-blue-100 text-blue-700" : r.type === "payment" ? "bg-green-100 text-green-700" : "bg-purple-100 text-purple-700"}`}>
                    {r.type === "invoice" ? "Invoice" : r.type === "payment" ? "Payment" : "Opening"}
                  </span>
                </td>
                <td className="px-4 py-2">{r.ref}</td>
                <td className="px-4 py-2 text-gray-600">{r.desc}</td>
                <td className="px-4 py-2 text-right">{r.debit ? r.debit.toFixed(2) : ""}</td>
                <td className="px-4 py-2 text-right">{r.credit ? r.credit.toFixed(2) : ""}</td>
                <td className="px-4 py-2 text-right font-medium">{r.balance.toFixed(2)}</td>
              </tr>
            ))}
            {displayRows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-3 text-gray-400 italic">এই সময়সীমায় কোনো লেনদেন নেই</td></tr>
            )}
          </tbody>
          <tfoot className="border-t-2 font-semibold bg-gray-50">
            <tr>
              <td colSpan={4} className="px-4 py-3 text-right">Total</td>
              <td className="px-4 py-3 text-right">{totalDebit.toFixed(2)}</td>
              <td className="px-4 py-3 text-right">{totalCredit.toFixed(2)}</td>
              <td className="px-4 py-3 text-right">{finalBalance.toFixed(2)} (বাকি)</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}