import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";
import { formatDate } from "@/lib/formatDate";
import { AT_DEFAULT_MARKUP_PERCENTAGE } from "@/lib/atCommission";
import { calcInvoiceCommission } from "@/lib/commission";
import { loadGroupMap, displayEntity } from "@/lib/customerGroups";
import CommissionRow from "./CommissionRow";

export default async function CommissionReportPage({
  searchParams,
}: { searchParams: Promise<{ from?: string; to?: string; customer?: string }> }) {
  const { from, to, customer } = await searchParams;
  const supabase = await createClient();

  const { data: customers } = await supabase
    .from("customers").select("id, name, code, commission_enabled, commission_percentage").order("name");

  // গ্রুপভুক্ত কাস্টমারের নাম রিপোর্টে গ্রুপ নামে দেখাবে।
  const gm = await loadGroupMap(supabase);

  let q = supabase
    .from("sales_invoices")
    .select(`id, invoice_no, invoice_date, customer_id, commission_adjustment, commission_note,
      customers(name, code, commission_enabled, commission_percentage),
      sales_invoice_items(quantity_pcs, unit_price, amount, bookings(required_lbs, buyer_id))`)
    .order("invoice_date", { ascending: false })
    .order("invoice_no", { ascending: false });
  if (from) q = q.gte("invoice_date", from);
  if (to) q = q.lte("invoice_date", to);
  if (customer) q = q.eq("customer_id", customer);
  const { data: invoices } = await q;

  const buyerIds = Array.from(new Set(
    (invoices ?? []).flatMap((inv: any) => inv.sales_invoice_items ?? []).map((i: any) => i.bookings?.buyer_id).filter(Boolean)
  )) as string[];
  const { data: buyers } = buyerIds.length
    ? await supabase.from("buyers").select("id, markup_percentage").in("id", buyerIds)
    : { data: [] };
  const markupMap: Record<string, number> = {};
  (buyers ?? []).forEach((b: any) => (markupMap[b.id] = b.markup_percentage ?? AT_DEFAULT_MARKUP_PERCENTAGE));

  const rows = (invoices ?? [])
    .map((inv: any) => {
      const items = (inv.sales_invoice_items ?? []).map((it: any) => ({
        unit_price: it.unit_price || 0,
        quantity_pcs: it.quantity_pcs || 0,
        amount: it.amount || 0,
        order_lbs: it.bookings?.required_lbs || 0,
        markup_pct: it.bookings?.buyer_id ? (markupMap[it.bookings.buyer_id] ?? AT_DEFAULT_MARKUP_PERCENTAGE) : AT_DEFAULT_MARKUP_PERCENTAGE,
      }));
      const invoiceTotal = items.reduce((s: number, it: any) => s + it.amount, 0);
      const calc = calcInvoiceCommission(
        inv.customers?.code ?? null,
        !!inv.customers?.commission_enabled,
        Number(inv.customers?.commission_percentage ?? 1),
        items,
      );
      if (calc == null) return null;
      const adjustment = Number(inv.commission_adjustment || 0);
      const ent = displayEntity(gm, inv.customer_id, inv.customers?.name);
      return {
        id: inv.id, invoice_no: inv.invoice_no, invoice_date: inv.invoice_date,
        customer_name: ent.name, customer_code: ent.isGroup ? null : (inv.customers?.code ?? null),
        invoiceTotal, calc, adjustment, note: inv.commission_note ?? "",
        final: calc + adjustment,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const totalCalc = rows.reduce((s, r) => s + r.calc, 0);
  const totalAdj = rows.reduce((s, r) => s + r.adjustment, 0);
  const totalFinal = rows.reduce((s, r) => s + r.final, 0);

  const commissionCustomers = (() => {
    const seen = new Set<string>();
    const opts: { id: string; name: string }[] = [];
    (customers ?? []).filter((c: any) => c.commission_enabled || c.code === "AT").forEach((c: any) => {
      const e = displayEntity(gm, c.id, c.name);
      if (seen.has(e.key)) return;
      seen.add(e.key);
      opts.push({ id: c.id, name: e.name });
    });
    return opts;
  })();

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Commission Report <span className="text-sm font-normal text-amber-600">(খসড়া)</span></h1>
        <Link href="/dashboard/reports" className="text-sm text-gray-500 hover:underline">← Reports-এ ফিরুন</Link>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        শুধু হিসাব দেখানোর জন্য — কোনো Journal Voucher তৈরি হয় না। AT → markup + freight নিয়ম; বাকি → Invoice Total × Commission %।
        প্রতি সারিতে Adjustment (±) হাতে দিয়ে সেভ করা যায়।
      </p>

      <form className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" name="from" defaultValue={from} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" name="to" defaultValue={to} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Customer</label>
          <select name="customer" defaultValue={customer ?? ""} className="rounded-lg border px-3 py-2 text-sm">
            <option value="">সব (commission-enabled)</option>
            {commissionCustomers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">ফিল্টার করুন</button>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Invoice No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2 text-right">Invoice Total</th>
              <th className="px-4 py-2 text-right">হিসাবি কমিশন</th>
              <th className="px-4 py-2 w-32 text-right">Adjustment (±)</th>
              <th className="px-4 py-2">Note</th>
              <th className="px-4 py-2 text-right">Final Commission</th>
              <th className="px-4 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <CommissionRow
                key={r.id}
                invoiceId={r.id}
                invoiceNo={r.invoice_no}
                invoiceDate={formatDate(r.invoice_date)}
                customer={r.customer_code ? `${r.customer_name} (${r.customer_code})` : r.customer_name}
                invoiceTotal={r.invoiceTotal}
                calc={r.calc}
                adjustment={r.adjustment}
                note={r.note}
              />
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-3 text-gray-400 italic">এই ফিল্টারে commission-enabled কোনো Invoice নেই</td></tr>
            )}
          </tbody>
          <tfoot className="border-t-2 font-semibold bg-gray-50">
            <tr>
              <td colSpan={4} className="px-4 py-3 text-right">Total</td>
              <td className="px-4 py-3 text-right">{money(totalCalc)}</td>
              <td className="px-4 py-3 text-right">{money(totalAdj)}</td>
              <td></td>
              <td className="px-4 py-3 text-right text-purple-700">{money(totalFinal)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
