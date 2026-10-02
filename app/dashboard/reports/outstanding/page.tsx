import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";
import { loadGroupMap, foldNumbers, ledgerHref } from "@/lib/customerGroups";
import PrintButton from "@/app/dashboard/PrintButton";
import { fetchAllRows } from "@/lib/fetchAll";
import { computeCustomerDues } from "@/lib/customerDues";
import { resolveDatePreset, periodAsOf, formatLongDate } from "@/lib/datePresets";
import DateRangeFields from "@/components/DateRangeFields";

export default async function OutstandingReportPage({
  searchParams,
}: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  // নির্দিষ্ট তারিখ পর্যন্ত বাকি/পাওনা — বাছাই করা সময়ের শেষ দিন পর্যন্ত সব লেনদেন (ডিফল্ট All Time = আজ পর্যন্ত)
  const sp = await searchParams;
  const period = resolveDatePreset(sp.range, sp.from, sp.to, "all");
  const asOf = periodAsOf(period);
  const upTo = (col: string) => (q: any) => (asOf ? q.lte(col, asOf) : q);
  const supabase = await createClient();

  const [
    { customers, due: customerDue },
    gm,
    { data: suppliers },
    { data: purchases },
    { data: supplierPayments },
  ] = await Promise.all([
    computeCustomerDues(supabase, asOf),
    loadGroupMap(supabase),
    supabase.from("suppliers").select("id, name"),
    fetchAllRows<any>(supabase, "purchase_entries", "supplier_id, purchase_entry_items(quantity_lbs, rate_per_lbs)", upTo("entry_date")).then((data) => ({ data })),
    fetchAllRows<any>(supabase, "supplier_payments", "supplier_id, amount", upTo("payment_date")).then((data) => ({ data })),
  ]);

  // গ্রুপভুক্ত কাস্টমার এক পার্টি — তাদের বাকি একসাথে (net) দেখানো হয়।
  const dueRows = foldNumbers(gm, customers, customerDue)
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  const supplierDue: Record<string, number> = {};
  (purchases ?? []).forEach((p: any) => {
    const amt = (p.purchase_entry_items ?? []).reduce((s: number, i: any) => s + i.quantity_lbs * i.rate_per_lbs, 0);
    supplierDue[p.supplier_id] = (supplierDue[p.supplier_id] ?? 0) + amt;
  });
  (supplierPayments ?? []).forEach((p: any) => {
    supplierDue[p.supplier_id] = (supplierDue[p.supplier_id] ?? 0) - p.amount;
  });

  const totalReceivable = dueRows.reduce((s, r) => s + r.value, 0);
  const totalPayable = Object.values(supplierDue).reduce((s, v) => s + (v > 0 ? v : 0), 0);
  const payableRows = (suppliers ?? []).filter((s) => (supplierDue[s.id] ?? 0) > 0);

  const asOfText = asOf ? `${formatLongDate(asOf)} তারিখ পর্যন্ত` : "আজ পর্যন্ত (সব লেনদেন)";
  const excelRows: (string | number)[][] = [
    ["Outstanding Report"],
    [asOfText],
    [],
    ["Customer Due"],
    ["Customer", "Due Amount"],
    ...dueRows.map((r) => [r.name, Number(r.value.toFixed(2))]),
    ["Total Receivable", Number(totalReceivable.toFixed(2))],
    [],
    ["Supplier Payable"],
    ["Supplier", "Payable Amount"],
    ...payableRows.map((s) => [s.name, Number((supplierDue[s.id] ?? 0).toFixed(2))]),
    ["Total Payable", Number(totalPayable.toFixed(2))],
  ];

  return (
    <div>
      <div className="print:hidden flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Outstanding Report</h1>
        <Link href="/dashboard/reports" className="text-sm text-gray-500 hover:underline">← Reports-এ ফিরুন</Link>
      </div>
      <p className="print:hidden text-sm text-gray-500 -mt-2 mb-3">{asOfText}</p>
      <form className="print:hidden mb-4 flex flex-wrap items-end gap-3">
        <DateRangeFields preset={period.preset} from={period.from} to={period.to} includeAll hideFrom toLabel="As of Date" />
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">দেখুন</button>
      </form>
      <PrintButton excelFilename={`Outstanding-Report${asOf ? `-${asOf}` : ""}`} excelSheets={[{ name: "Outstanding", rows: excelRows }]} />

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Receivable (কাস্টমার বাকি)</p>
          <p className="text-lg font-semibold text-blue-700">{money(totalReceivable)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Payable (সাপ্লায়ার পাওনা)</p>
          <p className="text-lg font-semibold text-amber-700">{money(totalPayable)}</p>
        </div>
      </div>

      <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">Customer Due</h2>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr><th className="px-4 py-2">Customer</th><th className="px-4 py-2 text-right">Due Amount</th></tr>
          </thead>
          <tbody>
            {dueRows.map((r) => (
              <tr key={r.key} className="border-t">
                <td className="px-4 py-2">
                  <Link href={ledgerHref(r)} className="hover:underline hover:text-blue-700">{r.name}</Link>
                  {r.isGroup && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">গ্রুপ</span>}
                </td>
                <td className="px-4 py-2 text-right">{money(r.value)}</td>
              </tr>
            ))}
            {dueRows.length === 0 && (
              <tr><td colSpan={2} className="px-4 py-3 text-gray-400 italic">কোনো বাকি নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">Supplier Payable</h2>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr><th className="px-4 py-2">Supplier</th><th className="px-4 py-2 text-right">Payable Amount</th></tr>
          </thead>
          <tbody>
            {payableRows.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-4 py-2">
                  <Link href={`/dashboard/purchase/supplier-ledger/${s.id}`} className="hover:underline hover:text-blue-700">{s.name}</Link>
                </td>
                <td className="px-4 py-2 text-right">{money((supplierDue[s.id] ?? 0))}</td>
              </tr>
            ))}
            {payableRows.length === 0 && (
              <tr><td colSpan={2} className="px-4 py-3 text-gray-400 italic">কোনো পাওনা নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}