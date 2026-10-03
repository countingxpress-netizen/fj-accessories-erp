import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { notFound } from "next/navigation";
import { money } from "@/lib/format";
import { fetchAllRowsIn } from "@/lib/fetchAll";
import { adjustmentSigned } from "@/lib/customerAdjustment";
import { resolveDatePreset } from "@/lib/datePresets";
import DateRangeFields from "@/components/DateRangeFields";
import AutoSubmitForm from "@/components/AutoSubmitForm";

export default async function GroupLedgerPage({
  params, searchParams,
}: { params: Promise<{ groupId: string }>; searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const { groupId } = await params;
  const { range, from: customFrom, to: customTo } = await searchParams;
  const supabase = await createClient();

  const { data: group } = await supabase.from("customer_groups").select("id, name, note").eq("id", groupId).single();
  if (!group) return notFound();

  const { data: members } = await supabase
    .from("customers")
    .select("id, name, opening_balance, opening_balance_date, created_at")
    .eq("group_id", groupId)
    .order("name");
  const memberList = members ?? [];
  const memberIds = memberList.map((m) => m.id);
  const nameById: Record<string, string> = {};
  memberList.forEach((m) => { nameById[m.id] = m.name; });

  const invoices = await fetchAllRowsIn<any>(
    supabase, "sales_invoices",
    "id, customer_id, invoice_no, invoice_date, payment_type, sales_invoice_items(quantity_pcs, amount, line_label, finished_goods(product_name))",
    "customer_id", memberIds
  );

  const { data: payments } = memberIds.length
    ? await supabase.from("customer_payments").select("customer_id, amount, payment_date, note").in("customer_id", memberIds)
    : { data: [] };

  const { data: wastageSales } = memberIds.length
    ? await supabase.from("wastage_sales").select("customer_id, sale_no, sale_date, amount, payment_received").in("customer_id", memberIds)
    : { data: [] };

  const { data: rawMaterialSales } = memberIds.length
    ? await supabase.from("raw_material_sales").select("customer_id, sale_no, sale_date, amount, payment_received").in("customer_id", memberIds)
    : { data: [] };

  const adjustments = await fetchAllRowsIn<any>(
    supabase, "customer_adjustments",
    "customer_id, adj_no, adj_date, direction, amount, note, contra:chart_of_accounts!customer_adjustments_contra_account_id_fkey(account_name)",
    "customer_id", memberIds
  );

  type Row = { date: string; type: "opening" | "invoice" | "payment" | "adjustment"; customer: string; ref: string; desc: string; debit: number; credit: number };
  const rows: Row[] = [];

  // নগদ বিক্রি সব স্টেটমেন্টে দৃশ্যমান থাকে (সারি হিসেবে), কিন্তু Dr+Cr একইসাথে
  // বসে বলে Due Balance-এ কোনো প্রভাব ফেলে না — শুধু বাকি বিক্রিই আসল বাকি বাড়ায়।
  const saleRow = (amount: number, isCash: boolean) =>
    isCash ? { debit: amount, credit: amount } : { debit: amount, credit: 0 };

  memberList.forEach((m) => {
    if (m.opening_balance && m.opening_balance !== 0) {
      rows.push({
        date: m.opening_balance_date ?? m.created_at?.slice(0, 10) ?? "2000-01-01",
        type: "opening", customer: m.name, ref: "Opening Balance", desc: "পূর্বের বাকি",
        debit: m.opening_balance, credit: 0,
      });
    }
  });

  (invoices ?? []).forEach((inv: any) => {
    const amount = (inv.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
    const isCash = inv.payment_type === "cash";
    const desc = (inv.sales_invoice_items ?? []).map((i: any) => `${i.finished_goods?.product_name ?? i.line_label ?? "-"} (${i.quantity_pcs})`).join(", ");
    rows.push({ date: inv.invoice_date, type: "invoice", customer: nameById[inv.customer_id] ?? "-", ref: inv.invoice_no, desc: desc + (isCash ? " · নগদ" : ""), ...saleRow(amount, isCash) });
  });

  (payments ?? []).forEach((p: any) => {
    rows.push({ date: p.payment_date, type: "payment", customer: nameById[p.customer_id] ?? "-", ref: "Payment", desc: p.note || "Payment Received", debit: 0, credit: p.amount });
  });

  (wastageSales ?? []).forEach((w: any) => {
    const isCash = !!w.payment_received;
    rows.push({ date: w.sale_date, type: "invoice", customer: nameById[w.customer_id] ?? "-", ref: w.sale_no, desc: `Wastage / Scrap বিক্রি${isCash ? " · নগদ" : " (বাকি)"}`, ...saleRow(Number(w.amount || 0), isCash) });
  });

  (rawMaterialSales ?? []).forEach((r: any) => {
    const isCash = !!r.payment_received;
    rows.push({ date: r.sale_date, type: "invoice", customer: nameById[r.customer_id] ?? "-", ref: r.sale_no, desc: `Raw Material বিক্রি${isCash ? " · নগদ" : " (বাকি)"}`, ...saleRow(Number(r.amount || 0), isCash) });
  });

  // কাস্টমার এডজাস্টমেন্ট — "বাকিতে যোগ" Dr, "বাকি কমানো" Cr
  adjustments.forEach((a: any) => {
    const amt = Number(a.amount || 0);
    const isCredit = a.direction === "credit";
    rows.push({
      date: a.adj_date, type: "adjustment", customer: nameById[a.customer_id] ?? "-", ref: a.adj_no,
      desc: `${isCredit ? "বাকি কমানো" : "বাকিতে যোগ"}${a.contra?.account_name ? ` — ${a.contra.account_name}` : ""}${a.note ? ` (${a.note})` : ""}`,
      debit: isCredit ? 0 : amt, credit: isCredit ? amt : 0,
    });
  });

  rows.sort((a, b) => a.date.localeCompare(b.date));

  let runningBalance = 0;
  const allRowsWithBalance = rows.map((r) => {
    runningBalance += r.debit - r.credit;
    return { ...r, balance: runningBalance };
  });

  // তারিখ-ফিল্টার preset (lib/datePresets.ts, Asia/Dhaka) — ডিফল্ট All Time (আগের মতো)
  const period = resolveDatePreset(range, customFrom, customTo, "all");
  const rangeFrom = period.from || undefined;
  const rangeTo = period.to || undefined;

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

  // কাস্টমার-ওয়াইজ subtotal (পুরো ইতিহাসের, তারিখ-সীমা নির্বিশেষে বাকি) —
  // শুধু বাকি (credit) বিক্রি "Invoiced"-এ যোগ হয়, নগদ বিক্রি বাদ (Due-তে প্রভাব ফেলবে না)।
  const perCustomer = memberList.map((m) => {
    const inv = (invoices ?? [])
      .filter((i: any) => i.customer_id === m.id && i.payment_type !== "cash")
      .reduce((s: number, i: any) => s + (i.sales_invoice_items ?? []).reduce((t: number, x: any) => t + (x.amount || 0), 0), 0);
    const wsCredit = (wastageSales ?? [])
      .filter((w: any) => w.customer_id === m.id && !w.payment_received)
      .reduce((s: number, w: any) => s + Number(w.amount || 0), 0);
    const rmsCredit = (rawMaterialSales ?? [])
      .filter((r: any) => r.customer_id === m.id && !r.payment_received)
      .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const opening = m.opening_balance || 0;
    const adjNet = adjustments
      .filter((a: any) => a.customer_id === m.id)
      .reduce((s: number, a: any) => s + adjustmentSigned(a), 0);
    const paid = (payments ?? []).filter((p: any) => p.customer_id === m.id).reduce((s: number, p: any) => s + p.amount, 0);
    const invoiced = opening + inv + wsCredit + rmsCredit + adjNet;
    return { id: m.id, name: m.name, invoiced, paid, due: invoiced - paid };
  });

  return (
    <div>
      <Link href="/dashboard/sales/customer-ledger" className="text-sm text-gray-500 hover:underline">← সব তালিকায় ফিরুন</Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">{group.name} <span className="text-sm font-normal text-gray-400">(গ্রুপ লেজার)</span></h1>
      <p className="text-sm text-gray-500 mb-4">
        {memberList.length} কাস্টমার একসাথে
        {group.note ? ` · ${group.note}` : ""}
      </p>

      {memberList.length === 0 ? (
        <p className="rounded-xl border bg-white p-4 shadow-sm text-sm text-gray-500">
          এই গ্রুপে কোনো কাস্টমার নেই। <Link href="/dashboard/sales/customer-groups" className="text-blue-600 hover:underline">গ্রুপে কাস্টমার যোগ করুন</Link>।
        </p>
      ) : (
        <>
          <AutoSubmitForm className="mb-4 flex flex-wrap items-end gap-3">
            <DateRangeFields preset={period.preset} from={period.from} to={period.to} includeAll />
            {range && (
              <Link href={`/dashboard/sales/customer-ledger/group/${group.id}`} className="text-sm text-gray-500 hover:underline">রিসেট করুন</Link>
            )}
          </AutoSubmitForm>

          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Customer</th>
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
                    <td colSpan={7} className="px-4 py-2 font-medium text-gray-600">Opening Balance (এই সময়ের আগ পর্যন্ত)</td>
                    <td className="px-4 py-2 text-right font-medium">{money(carryForward)}</td>
                  </tr>
                )}
                {displayRows.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-4 py-2 text-gray-500">{formatDate(r.date)}</td>
                    <td className="px-4 py-2 text-gray-700">{r.customer}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${r.type === "invoice" ? "bg-blue-100 text-blue-700" : r.type === "payment" ? "bg-green-100 text-green-700" : r.type === "adjustment" ? "bg-amber-100 text-amber-800" : "bg-purple-100 text-purple-700"}`}>
                        {r.type === "invoice" ? "Invoice" : r.type === "payment" ? "Payment" : r.type === "adjustment" ? "Adjustment" : "Opening"}
                      </span>
                    </td>
                    <td className="px-4 py-2">{r.ref}</td>
                    <td className="px-4 py-2 text-gray-600">{r.desc}</td>
                    <td className="px-4 py-2 text-right">{r.debit ? money(r.debit) : ""}</td>
                    <td className="px-4 py-2 text-right">{r.credit ? money(r.credit) : ""}</td>
                    <td className="px-4 py-2 text-right font-medium">{money(r.balance)}</td>
                  </tr>
                ))}
                {displayRows.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-3 text-gray-400 italic">এই সময়সীমায় কোনো লেনদেন নেই</td></tr>
                )}
              </tbody>
              <tfoot className="border-t-2 font-semibold bg-gray-50">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-right">Total</td>
                  <td className="px-4 py-3 text-right">{money(totalDebit)}</td>
                  <td className="px-4 py-3 text-right">{money(totalCredit)}</td>
                  <td className="px-4 py-3 text-right">{money(finalBalance)} (বাকি)</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">কাস্টমার-ওয়াইজ (পুরো ইতিহাস)</h2>
          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2 text-right">Invoiced (+ Opening)</th>
                  <th className="px-4 py-2 text-right">Paid</th>
                  <th className="px-4 py-2 text-right">Due</th>
                </tr>
              </thead>
              <tbody>
                {perCustomer.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-4 py-2">
                      <Link href={`/dashboard/sales/customer-ledger/${c.id}`} className="hover:underline hover:text-blue-700">{c.name}</Link>
                    </td>
                    <td className="px-4 py-2 text-right">{money(c.invoiced)}</td>
                    <td className="px-4 py-2 text-right">{money(c.paid)}</td>
                    <td className="px-4 py-2 text-right font-medium">{money(c.due)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 font-semibold bg-gray-50">
                <tr>
                  <td className="px-4 py-3 text-right">Total</td>
                  <td className="px-4 py-3 text-right">{money(perCustomer.reduce((s, c) => s + c.invoiced, 0))}</td>
                  <td className="px-4 py-3 text-right">{money(perCustomer.reduce((s, c) => s + c.paid, 0))}</td>
                  <td className="px-4 py-3 text-right">{money(perCustomer.reduce((s, c) => s + c.due, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
