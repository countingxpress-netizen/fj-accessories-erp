import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { money } from "@/lib/format";
import { loadGroupMap, displayEntity, ledgerHref } from "@/lib/customerGroups";
import PrintButton from "@/app/dashboard/PrintButton";
import { fetchAllRows } from "@/lib/fetchAll";
import { resolveDatePreset, datePresetLabel } from "@/lib/datePresets";
import DateRangeFields from "@/components/DateRangeFields";
import AutoSubmitForm from "@/components/AutoSubmitForm";

// Receivable Statement (কাস্টমার-ওয়াইজ) — সময়ভিত্তিক:
//   সাবেক বাকি (from-এর আগে) + এই সময়ে বাকি-বিক্রি (Invoiced) − এই সময়ে জমা (Paid) = শেষ বাকি (Due)
// ডিফল্ট All Time → সাবেক বাকি 0, বাকি সব Invoiced/Paid-এ (আগের মতো)। to-এর পরের লেনদেন বাদ।
//   Invoiced = Opening Balance + বাকি Invoice + বাকি Wastage/কাঁচামাল বিক্রি + "বাকিতে যোগ" এডজাস্টমেন্ট
//   Paid     = Customer Payment + "বাকি কমানো" এডজাস্টমেন্ট
// নগদ বিক্রি বাকি বাড়ায় না, তবে Last Invoice তারিখে ধরা হয় (শেষ কবে বিক্রি হলো)।
export default async function ReceivableStatementPage({
  searchParams,
}: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const period = resolveDatePreset(sp.range, sp.from, sp.to, "all");
  const from = period.from || undefined;
  const to = period.to || undefined;
  const supabase = await createClient();

  const [{ data: customers }, invoices, payments, wastageSales, rawMaterialSales, adjustments, gm] = await Promise.all([
    supabase.from("customers").select("id, name, opening_balance, opening_balance_date").order("name"),
    fetchAllRows<any>(supabase, "sales_invoices", "customer_id, invoice_no, invoice_date, payment_type, sales_invoice_items(amount)"),
    fetchAllRows<any>(supabase, "customer_payments", "customer_id, amount, payment_date"),
    fetchAllRows<any>(supabase, "wastage_sales", "customer_id, amount, sale_date, payment_received", (q) => q.not("customer_id", "is", null)),
    fetchAllRows<any>(supabase, "raw_material_sales", "customer_id, amount, sale_date, payment_received", (q) => q.not("customer_id", "is", null)),
    fetchAllRows<any>(supabase, "customer_adjustments", "customer_id, direction, amount, adj_date"),
    loadGroupMap(supabase),
  ]);

  type Data = { opening: number; invoiced: number; paid: number; lastInvoiceDate: string | null };
  const customerData: Record<string, Data> = {};
  const get = (cid: string) => (customerData[cid] ??= { opening: 0, invoiced: 0, paid: 0, lastInvoiceDate: null });

  // তারিখ অনুযায়ী ভাগ: from-এর আগে → সাবেক বাকি, সময়ের ভেতরে → Invoiced/Paid, to-এর পরে → বাদ
  const bucket = (date: string | null | undefined): "before" | "in" | "after" => {
    const d = date ?? "";
    if (to && d > to) return "after";
    if (from && d < from) return "before";
    return "in";
  };
  const addDebit = (cid: string, date: string | null | undefined, amt: number) => {
    const b = bucket(date);
    if (b === "after" || !amt) return;
    if (b === "before") get(cid).opening += amt; else get(cid).invoiced += amt;
  };
  const addCredit = (cid: string, date: string | null | undefined, amt: number) => {
    const b = bucket(date);
    if (b === "after" || !amt) return;
    if (b === "before") get(cid).opening -= amt; else get(cid).paid += amt;
  };
  const touchLast = (cid: string, date: string | null | undefined) => {
    if (!date || bucket(date) !== "in") return;
    const c = get(cid);
    if (!c.lastInvoiceDate || date > c.lastInvoiceDate) c.lastInvoiceDate = date;
  };

  // Opening Balance — তারিখ না থাকলে সবচেয়ে পুরনো ধরা হয়
  (customers ?? []).forEach((c: any) => addDebit(c.id, c.opening_balance_date ?? "0000-01-01", Number(c.opening_balance || 0)));

  invoices.forEach((inv: any) => {
    const amt = (inv.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
    if (inv.payment_type !== "cash") addDebit(inv.customer_id, inv.invoice_date, amt);
    touchLast(inv.customer_id, inv.invoice_date);
  });
  [...wastageSales, ...rawMaterialSales].forEach((s: any) => {
    if (!s.payment_received) addDebit(s.customer_id, s.sale_date, Number(s.amount || 0));
    touchLast(s.customer_id, s.sale_date);
  });
  payments.forEach((p: any) => addCredit(p.customer_id, p.payment_date, Number(p.amount || 0)));
  adjustments.forEach((a: any) => {
    if (a.direction === "credit") addCredit(a.customer_id, a.adj_date, Number(a.amount || 0));
    else addDebit(a.customer_id, a.adj_date, Number(a.amount || 0));
  });

  // গ্রুপভুক্ত কাস্টমার এক পার্টি — সব অঙ্ক একসাথে যোগ, শেষ ইনভয়েস তারিখ = সর্বশেষ।
  type Agg = { key: string; id: string; name: string; isGroup: boolean } & Data;
  const aggByKey: Record<string, Agg> = {};
  (customers ?? []).forEach((c: any) => {
    const d = customerData[c.id];
    if (!d) return;
    const e = displayEntity(gm, c.id, c.name);
    const a = (aggByKey[e.key] ??= { key: e.key, id: e.id, name: e.name, isGroup: e.isGroup, opening: 0, invoiced: 0, paid: 0, lastInvoiceDate: null });
    a.opening += d.opening;
    a.invoiced += d.invoiced;
    a.paid += d.paid;
    if (d.lastInvoiceDate && (!a.lastInvoiceDate || d.lastInvoiceDate > a.lastInvoiceDate)) a.lastInvoiceDate = d.lastInvoiceDate;
  });

  const rows = Object.values(aggByKey)
    .map((a) => ({ ...a, due: a.opening + a.invoiced - a.paid }))
    .filter((r) => r.due > 0)
    .sort((a, b) => b.due - a.due);

  const showOpening = !!from;
  const totalOpening = rows.reduce((s, r) => s + r.opening, 0);
  const totalInvoiced = rows.reduce((s, r) => s + r.invoiced, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
  const totalDue = rows.reduce((s, r) => s + r.due, 0);
  const periodText = datePresetLabel(period);

  const excelRows: (string | number)[][] = [
    ["Receivable Statement (Customer Wise)"],
    [periodText],
    [],
    ["Customer", "Last Invoice", ...(showOpening ? ["সাবেক বাকি"] : []), "Total Invoiced", "Total Paid", "Due"],
    ...rows.map((r) => [
      r.name, r.lastInvoiceDate ? formatDate(r.lastInvoiceDate) : "-",
      ...(showOpening ? [Number(r.opening.toFixed(2))] : []),
      Number(r.invoiced.toFixed(2)), Number(r.paid.toFixed(2)), Number(r.due.toFixed(2)),
    ]),
    ["Total", "", ...(showOpening ? [Number(totalOpening.toFixed(2))] : []), Number(totalInvoiced.toFixed(2)), Number(totalPaid.toFixed(2)), Number(totalDue.toFixed(2))],
  ];

  return (
    <div>
      <div className="print:hidden flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Receivable Statement (Customer Wise)</h1>
        <Link href="/dashboard/reports" className="text-sm text-gray-500 hover:underline">← Reports-এ ফিরুন</Link>
      </div>
      <p className="text-sm text-gray-500 -mt-2 mb-3">{periodText}</p>

      <AutoSubmitForm className="print:hidden mb-4 flex flex-wrap items-end gap-3">
        <DateRangeFields preset={period.preset} from={period.from} to={period.to} includeAll />
      </AutoSubmitForm>

      <PrintButton excelFilename="Receivable-Statement" excelSheets={[{ name: "Receivable", rows: excelRows }]} />

      <div className="rounded-xl border bg-white p-4 shadow-sm mb-6 max-w-xs">
        <p className="text-xs text-gray-500">Total Outstanding Receivable{to ? " (সময়ের শেষে)" : ""}</p>
        <p className="text-lg font-semibold text-blue-700">{money(totalDue)}</p>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Last Invoice</th>
              {showOpening && <th className="px-4 py-2 text-right">সাবেক বাকি</th>}
              <th className="px-4 py-2 text-right">Total Invoiced</th>
              <th className="px-4 py-2 text-right">Total Paid</th>
              <th className="px-4 py-2 text-right">Due</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t">
                <td className="px-4 py-2">
                  <Link href={ledgerHref(r)} className="hover:underline hover:text-blue-700">{r.name}</Link>
                  {r.isGroup && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">গ্রুপ</span>}
                </td>
                <td className="px-4 py-2 text-gray-500">{r.lastInvoiceDate ? formatDate(r.lastInvoiceDate) : "-"}</td>
                {showOpening && <td className="px-4 py-2 text-right">{money(r.opening)}</td>}
                <td className="px-4 py-2 text-right">{money(r.invoiced)}</td>
                <td className="px-4 py-2 text-right">{money(r.paid)}</td>
                <td className="px-4 py-2 text-right font-medium">{money(r.due)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={showOpening ? 6 : 5} className="px-4 py-3 text-gray-400 italic">কোনো বকেয়া নেই</td></tr>
            )}
          </tbody>
          <tfoot className="border-t-2 font-semibold bg-gray-50">
            <tr>
              <td colSpan={2} className="px-4 py-3 text-right">Total</td>
              {showOpening && <td className="px-4 py-3 text-right">{money(totalOpening)}</td>}
              <td className="px-4 py-3 text-right">{money(totalInvoiced)}</td>
              <td className="px-4 py-3 text-right">{money(totalPaid)}</td>
              <td className="px-4 py-3 text-right">{money(totalDue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
