import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todayLocal, monthRange } from "@/lib/payroll";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  // ---- এ মাসের P&L কার্ড: Gross Profit (Sales 4000/4010 − COGS 5050) + Operating Expenses ----
  const { data: allAccounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type");
  const accountsById = new Map<string, any>((allAccounts ?? []).map((a: any) => [a.id, a]));

  const ieIds = (allAccounts ?? [])
    .filter((a: any) => a.account_type === "income" || a.account_type === "expense")
    .map((a: any) => a.id);
  const { data: ieLines } = ieIds.length
    ? await supabase
        .from("journal_entry_lines")
        .select("account_id, debit, credit, journal_vouchers(voucher_date)")
        .in("account_id", ieIds)
    : { data: [] };

  let monthSalesRevenue = 0;
  let monthCogs = 0;
  let monthExpenses = 0; // COGS বাদে বাকি সব expense অ্যাকাউন্ট (operating expense)
  (ieLines ?? []).forEach((l: any) => {
    const d = l.journal_vouchers?.voucher_date ?? "";
    if (d < monthStart || d > monthEnd) return;
    const acc = accountsById.get(l.account_id);
    if (!acc) return;
    if (acc.account_code === "4000" || acc.account_code === "4010") {
      monthSalesRevenue += (l.credit || 0) - (l.debit || 0);
    } else if (acc.account_code === "5050") {
      monthCogs += (l.debit || 0) - (l.credit || 0);
    } else if (acc.account_type === "expense") {
      monthExpenses += (l.debit || 0) - (l.credit || 0);
    }
  });
  const monthGrossProfit = monthSalesRevenue - monthCogs;

  // ---- Selected Account Balance (Settings-এ বাছাই করা) ----
  const { data: company } = await supabase.from("company_profile").select("*").limit(1).maybeSingle();
  const selId = (company as any)?.dashboard_account_id as string | null | undefined;
  let selectedAccount: { id: string; code: string; name: string; balance: number } | null = null;
  if (selId && accountsById.has(selId)) {
    const acc = accountsById.get(selId);
    const { data: selLines } = await supabase
      .from("journal_entry_lines").select("debit, credit").eq("account_id", selId);
    const net = (selLines ?? []).reduce((s: number, l: any) => s + (l.debit || 0) - (l.credit || 0), 0);
    const normalDebit = acc.account_type === "asset" || acc.account_type === "expense";
    selectedAccount = { id: selId, code: acc.account_code, name: acc.account_name, balance: normalDebit ? net : -net };
  }

  // ---- কাঁচামাল স্টক (LBS + গড় খরচে মূল্য) ----
  const { data: rmMaterials } = await supabase.from("raw_materials").select("id, avg_cost_per_lbs");
  const rmCostById = new Map<string, number>((rmMaterials ?? []).map((m: any) => [m.id, Number(m.avg_cost_per_lbs) || 0]));
  const { data: rmStockRows } = await supabase.from("raw_material_stock").select("material_id, quantity_lbs");
  let rawStockLbs = 0;
  let rawStockValue = 0;
  (rmStockRows ?? []).forEach((s: any) => {
    const q = Number(s.quantity_lbs) || 0;
    rawStockLbs += q;
    rawStockValue += q * (rmCostById.get(s.material_id) ?? 0);
  });

  // ---- এ মাসে production-এ ঢালা কাঁচামাল (LBS + মূল্য) ----
  const { data: consumptionRows } = await supabase
    .from("material_consumption")
    .select("material_id, quantity_lbs, consumption_date")
    .gte("consumption_date", monthStart)
    .lte("consumption_date", monthEnd);
  let consumedLbs = 0;
  let consumedValue = 0;
  (consumptionRows ?? []).forEach((c: any) => {
    const q = Number(c.quantity_lbs) || 0;
    consumedLbs += q;
    consumedValue += q * (rmCostById.get(c.material_id) ?? 0);
  });

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

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthLabel = `${MONTHS[month - 1]} ${year}`;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
        <Link href="/dashboard/accounting/profit-loss" className="rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs text-gray-500">Gross Profit — {monthLabel}</p>
          <p className={`text-lg font-semibold ${monthGrossProfit >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(monthGrossProfit)}</p>
          <p className="text-xs text-gray-400">Sales {fmt(monthSalesRevenue)} − COGS {fmt(monthCogs)}</p>
        </Link>
        <Link href="/dashboard/accounting/profit-loss" className="rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs text-gray-500">Expenses — {monthLabel}</p>
          <p className="text-lg font-semibold text-red-700">{fmt(monthExpenses)}</p>
          <p className="text-xs text-gray-400">COGS ছাড়া operating expense</p>
        </Link>
        {selectedAccount ? (
          <Link href={`/dashboard/accounting/ledger/${selectedAccount.id}`} className="rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-xs text-gray-500 truncate">{selectedAccount.code} - {selectedAccount.name}</p>
            <p className={`text-lg font-semibold ${selectedAccount.balance >= 0 ? "text-gray-900" : "text-red-700"}`}>{fmt(selectedAccount.balance)}</p>
            <p className="text-xs text-gray-400">নির্বাচিত অ্যাকাউন্টের ব্যালেন্স</p>
          </Link>
        ) : (
          <Link href="/dashboard/settings" className="rounded-xl border border-dashed bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-xs text-gray-500">Selected Account Balance</p>
            <p className="text-sm font-medium text-blue-700 mt-1">Settings-এ একটি অ্যাকাউন্ট বাছাই করুন →</p>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Link href="/dashboard/reports/stock-report" className="rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs text-gray-500">Raw Material Stock</p>
          <p className="text-lg font-semibold">{fmt(rawStockLbs)} Lbs</p>
          <p className="text-xs text-gray-500">গড় খরচে মূল্য ৳{fmt(rawStockValue)}</p>
        </Link>
        <Link href="/dashboard/reports/production-report" className="rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs text-gray-500">Production-এ ব্যবহৃত কাঁচামাল — {monthLabel}</p>
          <p className="text-lg font-semibold">{fmt(consumedLbs)} Lbs</p>
          <p className="text-xs text-gray-500">গড় খরচে মূল্য ৳{fmt(consumedValue)}</p>
        </Link>
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
