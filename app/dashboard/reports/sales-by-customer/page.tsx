import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money, qty } from "@/lib/format";
import { formatDate } from "@/lib/formatDate";
import PrintButton from "@/app/dashboard/PrintButton";
import { loadGroupMap, ledgerHref } from "@/lib/customerGroups";
import {
  aggregateSalesByCustomer,
  salesEntityOptions,
  resolveSalesRange,
  todayDhaka,
  SALES_RANGE_OPTIONS,
} from "@/lib/salesByCustomer";

export default async function SalesByCustomerReportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; customer?: string }>;
}) {
  const { range, from: customFrom, to: customTo, customer } = await searchParams;
  const supabase = await createClient();

  const effectiveRange = range ?? "this_month";
  const { from, to } = resolveSalesRange(effectiveRange, customFrom, customTo);

  const [{ data: company }, { data: customers }] = await Promise.all([
    supabase.from("company_profile").select("name, address, phone, email").maybeSingle(),
    supabase.from("customers").select("id, name").order("name"),
  ]);
  const groupMap = await loadGroupMap(supabase);

  let q = supabase
    .from("sales_invoices")
    .select("customer_id, sales_invoice_items(amount, required_lbs, bookings(required_lbs))");
  if (from) q = q.gte("invoice_date", from);
  if (to) q = q.lte("invoice_date", to);
  const { data: invoices } = await q;

  let rows = aggregateSalesByCustomer(invoices ?? [], customers ?? [], groupMap).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  if (customer) rows = rows.filter((r) => r.key === customer);

  const totAmt = rows.reduce((s, r) => s + r.amount, 0);
  const totLbs = rows.reduce((s, r) => s + r.lbs, 0);
  const totCount = rows.reduce((s, r) => s + r.count, 0);

  const entityOptions = salesEntityOptions(customers ?? [], groupMap);
  const selectedEntity = customer ? entityOptions.find((o) => o.key === customer) : null;

  const periodText =
    from || to
      ? `${from ? formatDate(from) : "শুরু"} — ${to ? formatDate(to) : formatDate(todayDhaka())}`
      : "সব সময় (All Time)";

  return (
    <div className="max-w-4xl mx-auto print:max-w-none">
      {/* ── কন্ট্রোল বার (print-এ লুকানো) ── */}
      <div className="print:hidden">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Sales by Customer</h1>
          <Link href="/dashboard/reports" className="text-sm text-gray-500 hover:underline">
            ← Reports-এ ফিরুন
          </Link>
        </div>

        <form className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date Range</label>
            <select name="range" defaultValue={effectiveRange} className="rounded-lg border px-3 py-2 text-sm">
              {SALES_RANGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">From (Custom)</label>
            <input type="date" name="from" defaultValue={customFrom} className="rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To (Custom)</label>
            <input type="date" name="to" defaultValue={customTo} className="rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Customer</label>
            <select name="customer" defaultValue={customer ?? ""} className="rounded-lg border px-3 py-2 text-sm max-w-[220px]">
              <option value="">সব Customer</option>
              {entityOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
            Run Report
          </button>
          {(range || customer || customFrom || customTo) && (
            <Link href="/dashboard/reports/sales-by-customer" className="text-sm text-gray-500 hover:underline">
              রিসেট
            </Link>
          )}
        </form>

        <PrintButton />
      </div>

      {/* ── রিপোর্ট বডি (এটাই প্রিন্ট হয়) ── */}
      <div className="rounded-xl border bg-white shadow-sm p-6 print:border-0 print:shadow-none print:p-0">
        <div className="text-center mb-5">
          {company?.name && <p className="text-sm text-gray-500">{company.name}</p>}
          <h2 className="text-xl font-bold">Sales by Customer</h2>
          <p className="text-sm text-gray-600">{periodText}</p>
          {selectedEntity && <p className="text-xs text-gray-500 mt-0.5">Customer: {selectedEntity.name}</p>}
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-y-2 border-gray-800 text-left">
              <th className="py-2 pr-3 w-1/2">Name</th>
              <th className="py-2 px-3 text-right whitespace-nowrap">Invoice Count</th>
              <th className="py-2 px-3 text-right whitespace-nowrap">Production LBS</th>
              <th className="py-2 pl-3 text-right whitespace-nowrap">Sales Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b">
                <td className="py-2 pr-3">
                  <Link href={ledgerHref(r)} className="hover:underline hover:text-blue-700 print:text-gray-900 print:no-underline">
                    {r.name}
                  </Link>
                  {r.isGroup && (
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 print:hidden">গ্রুপ</span>
                  )}
                </td>
                <td className="py-2 px-3 text-right text-gray-600 whitespace-nowrap">{r.count}</td>
                <td className="py-2 px-3 text-right whitespace-nowrap">{qty(r.lbs)}</td>
                <td className="py-2 pl-3 text-right whitespace-nowrap">{money(r.amount)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-gray-400 italic">
                  এই সময়সীমায় কোনো বিক্রি নেই
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-800 font-semibold">
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 px-3 text-right">{totCount}</td>
                <td className="py-2 px-3 text-right">{qty(totLbs)}</td>
                <td className="py-2 pl-3 text-right">{money(totAmt)}</td>
              </tr>
            </tfoot>
          )}
        </table>

        <p className="mt-4 text-xs text-gray-400 print:mt-8">
          মোট {rows.length} party · তৈরি: {formatDate(todayDhaka())}
        </p>
      </div>
    </div>
  );
}
