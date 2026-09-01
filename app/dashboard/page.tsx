import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todayLocal, monthRange } from "@/lib/payroll";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_production: "In Production",
  partially_delivered: "Partially Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const [year, month] = todayLocal().split("-").map(Number);
  const { start: monthStart, end: monthEnd } = monthRange(year, month);

  const { data: cashBankAccounts } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("account_type", "asset")
    .or("account_name.ilike.%cash%,account_name.ilike.%bank%");
  const cashBankIds = (cashBankAccounts ?? []).map((a: any) => a.id);
  const { data: cashBankLines } = cashBankIds.length
    ? await supabase.from("journal_entry_lines").select("debit, credit").in("account_id", cashBankIds)
    : { data: [] };
  const cashBankBalance = (cashBankLines ?? []).reduce((s: number, l: any) => s + (l.debit || 0) - (l.credit || 0), 0);

  const { data: customers } = await supabase.from("customers").select("id, opening_balance");
  const { data: invoices } = await supabase.from("sales_invoices").select("customer_id, invoice_date, sales_invoice_items(amount)");
  const { data: customerPayments } = await supabase.from("customer_payments").select("customer_id, amount");

  const customerDue: Record<string, number> = {};
  (customers ?? []).forEach((c: any) => { if (c.opening_balance) customerDue[c.id] = (customerDue[c.id] ?? 0) + c.opening_balance; });
  (invoices ?? []).forEach((inv: any) => {
    const amt = (inv.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
    customerDue[inv.customer_id] = (customerDue[inv.customer_id] ?? 0) + amt;
  });
  (customerPayments ?? []).forEach((p: any) => { customerDue[p.customer_id] = (customerDue[p.customer_id] ?? 0) - p.amount; });
  const totalReceivable = Object.values(customerDue).reduce((s, v) => s + (v > 0 ? v : 0), 0);

  const { data: suppliers } = await supabase.from("suppliers").select("id");
  const { data: purchases } = await supabase.from("purchase_entries").select("supplier_id, purchase_entry_items(quantity_lbs, rate_per_lbs)");
  const { data: supplierPayments } = await supabase.from("supplier_payments").select("supplier_id, amount");

  const supplierDue: Record<string, number> = {};
  (purchases ?? []).forEach((p: any) => {
    const amt = (p.purchase_entry_items ?? []).reduce((s: number, i: any) => s + i.quantity_lbs * i.rate_per_lbs, 0);
    supplierDue[p.supplier_id] = (supplierDue[p.supplier_id] ?? 0) + amt;
  });
  (supplierPayments ?? []).forEach((p: any) => { supplierDue[p.supplier_id] = (supplierDue[p.supplier_id] ?? 0) - p.amount; });
  const totalPayable = Object.values(supplierDue).reduce((s, v) => s + (v > 0 ? v : 0), 0);

  const monthSales = (invoices ?? [])
    .filter((inv: any) => inv.invoice_date >= monthStart && inv.invoice_date <= monthEnd)
    .reduce((s: number, inv: any) => s + (inv.sales_invoice_items ?? []).reduce((t: number, i: any) => t + (i.amount || 0), 0), 0);

  const { data: bookingStatuses } = await supabase.from("bookings").select("status");
  const statusCounts: Record<string, number> = {};
  (bookingStatuses ?? []).forEach((b: any) => { statusCounts[b.status] = (statusCounts[b.status] ?? 0) + 1; });

  const { data: recentInvoices } = await supabase
    .from("sales_invoices")
    .select("id, invoice_no, invoice_date, customers(name), sales_invoice_items(amount)")
    .order("invoice_date", { ascending: false })
    .limit(5);

  const quickLinks = [
    { href: "/dashboard/accounting", label: "Accounting" },
    { href: "/dashboard/inventory", label: "Inventory" },
    { href: "/dashboard/purchase", label: "Purchase" },
    { href: "/dashboard/sales", label: "Sales" },
    { href: "/dashboard/production", label: "Production" },
    { href: "/dashboard/payroll", label: "Payroll" },
    { href: "/dashboard/lc-export", label: "LC & Export" },
    { href: "/dashboard/reports", label: "Reports" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Cash + Bank Balance</p>
          <p className={`text-lg font-semibold ${cashBankBalance >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(cashBankBalance)}</p>
        </div>
        <Link href="/dashboard/reports/outstanding" className="rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs text-gray-500">Total Receivable</p>
          <p className="text-lg font-semibold text-blue-700">{fmt(totalReceivable)}</p>
        </Link>
        <Link href="/dashboard/reports/outstanding" className="rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs text-gray-500">Total Payable</p>
          <p className="text-lg font-semibold text-amber-700">{fmt(totalPayable)}</p>
        </Link>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">This Month&apos;s Sales</p>
          <p className="text-lg font-semibold text-purple-700">{fmt(monthSales)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h2 className="text-sm font-semibold uppercase text-gray-500">সাম্প্রতিক Sales Invoice</h2>
            <Link href="/dashboard/sales/invoices" className="text-xs text-blue-700 hover:underline">সব দেখুন →</Link>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {(recentInvoices ?? []).map((inv: any) => {
                const total = (inv.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
                return (
                  <tr key={inv.id} className="border-t">
                    <td className="px-4 py-2">
                      <Link href={`/dashboard/sales/invoices/${inv.id}/print`} className="hover:underline hover:text-blue-700">{inv.invoice_no}</Link>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{inv.customers?.name}</td>
                    <td className="px-4 py-2 text-gray-500">{inv.invoice_date}</td>
                    <td className="px-4 py-2 text-right">{fmt(total)}</td>
                  </tr>
                );
              })}
              {(recentInvoices ?? []).length === 0 && (
                <tr><td colSpan={4} className="px-4 py-3 text-gray-400 italic">কোনো Invoice নেই</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="text-sm font-semibold uppercase text-gray-500">Booking Status</h2>
          </div>
          <div className="divide-y">
            {Object.keys(STATUS_LABELS).map((key) => (
              <div key={key} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-gray-600">{STATUS_LABELS[key]}</span>
                <span className="font-semibold">{statusCounts[key] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickLinks.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow text-center text-sm font-medium">
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
