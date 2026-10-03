/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadGroupMap, foldNumbers, ledgerHref } from "@/lib/customerGroups";
import SalesByCustomer from "./SalesByCustomer";
import { fetchAllRows } from "@/lib/fetchAll";
import { computeCustomerDues } from "@/lib/customerDues";
import { aggregateSalesByCustomer, salesEntityOptions } from "@/lib/salesByCustomer";
import { resolveDatePreset, periodAsOf, datePresetLabel, formatLongDate, type DatePreset } from "@/lib/datePresets";
import DateRangeFields from "@/components/DateRangeFields";
import AutoSubmitForm from "@/components/AutoSubmitForm";

// Dashboard — উপরের ফিল্টার বার (Date Range / Customer / Account) অনুযায়ী সব কার্ড:
//   • "পর্যন্ত" কার্ড (Cash+Bank, Receivable, Payable, Raw Material Stock) — বাছাই করা সময়ের শেষ দিন
//     পর্যন্ত ব্যালেন্স (ভবিষ্যৎ হলে আজ; All Time = আজ পর্যন্ত সব)। Outstanding / Stock Report-এর মতো।
//   • "সময়ের" কার্ড (Sales, Payment Received, Gross Profit, Expenses, Production, Sales by Customer,
//     Booking Status) — শুধু বাছাই করা সময়ের লেনদেন।
//   • Customer — কাস্টমার/পার্টি (গ্রুপ) ভিত্তিক তথ্যগুলো শুধু সেই পার্টির; Gross Profit ও Account কার্ড
//     সেই পার্টির ডকুমেন্টের JV (invoice, COGS, payment, adjustment, RM/wastage বিক্রি, booking-এর
//     কাঁচামাল issue/wastage) থেকে। Cash+Bank / Payable / Expenses / Raw Stock কাস্টমার-ভিত্তিক না —
//     সেগুলো সব মিলিয়ে দেখায় (কার্ডে লেখা থাকে)।
//   • Account — যেকোনো অ্যাকাউন্টের Opening / Debit / Credit / Closing (ডিফল্ট: Settings-এ বাছাই করা)।

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

const ACCOUNT_TYPES: { value: string; label: string }[] = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** কার্ডের শিরোনামে ছোট করে সময়ের নাম — "Oct 2026", "2026", "03 Oct 2026", "01 Sep 2026 – 15 Sep 2026" */
function periodShort(p: { preset: DatePreset; from: string; to: string }): string {
  if (p.preset === "all" || (!p.from && !p.to)) return "All Time";
  if (p.preset === "this_month" || p.preset === "previous_month") {
    const [y, m] = p.from.split("-").map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }
  if (p.preset === "this_year" || p.preset === "previous_year") return p.from.slice(0, 4);
  if (p.from === p.to) return formatLongDate(p.from);
  return `${p.from ? formatLongDate(p.from) : "শুরু"} – ${p.to ? formatLongDate(p.to) : "আজ"}`;
}

/** Supabase embed কখনো object, কখনো array — প্রথমটা নেওয়া */
const one = (x: any) => (Array.isArray(x) ? x[0] : x);

function Card({
  href, title, period, value, valueClass = "", sub, note, dashed = false,
}: {
  href?: string;
  title: string;
  /** শিরোনামের নিচে ছোট লাইনে সময় — "Oct 2026" / "03 Oct 2026 পর্যন্ত" */
  period?: string;
  value: React.ReactNode;
  valueClass?: string;
  sub?: React.ReactNode;
  note?: string;
  dashed?: boolean;
}) {
  const cls = `min-w-0 rounded-xl border ${dashed ? "border-dashed" : ""} bg-white p-4 shadow-sm ${href ? "hover:shadow-md transition-shadow" : ""}`;
  const body = (
    <>
      <p className="text-xs text-gray-500 break-words">{title}</p>
      {period && <p className="text-[11px] text-gray-400">{period}</p>}
      <div className={`mt-1 text-lg font-semibold break-words ${valueClass}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
      {note && <p className="mt-1 text-[11px] italic text-gray-400">{note}</p>}
    </>
  );
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; customer?: string; account?: string }>;
}) {
  const sp = await searchParams;
  // ডিফল্ট This Month (আগের "এ মাসের" কার্ডগুলোর মতো); "আজ" Asia/Dhaka ধরে — lib/datePresets.ts
  const period = resolveDatePreset(sp.range, sp.from, sp.to);
  const { preset, from, to } = period;
  const asOf = periodAsOf(period);
  const inPeriod = (d: string) => (!from || d >= from) && (!to || d <= to);
  const upToAsOf = (d: string) => !asOf || d <= asOf;
  const periodQ = (col: string) => (q: any) => {
    if (from) q = q.gte(col, from);
    if (to) q = q.lte(col, to);
    return q;
  };
  const upToQ = (col: string) => (q: any) => (asOf ? q.lte(col, asOf) : q);

  const supabase = await createClient();

  // এই রাউন্ডের সব query একে অপরের থেকে স্বাধীন — সিরিয়ালি await করলে প্রতিটা
  // network round-trip যোগ হয়ে পেজ-লোড ধীর লাগে, তাই একসাথে fire করা হয়।
  const [
    { data: customers },
    groupMap,
    { data: allAccounts },
    { data: company },
    jvLines,
    dues,
    purchases,
    supplierPayments,
    periodInvoices,
    periodRmSales,
    periodPayments,
    { data: rmMaterials },
    { data: rmStockRows },
    laterRawMoves,
    consumptionRows,
    periodBookings,
  ] = await Promise.all([
    supabase.from("customers").select("id, name").order("name"),
    loadGroupMap(supabase),
    supabase.from("chart_of_accounts").select("id, account_code, account_name, account_type").order("account_code"),
    supabase.from("company_profile").select("dashboard_account_id").limit(1).maybeSingle(),
    fetchAllRows<any>(supabase, "journal_entry_lines", "voucher_id, account_id, debit, credit, journal_vouchers(voucher_date, narration)"),
    computeCustomerDues(supabase, asOf),
    fetchAllRows<any>(supabase, "purchase_entries", "supplier_id, purchase_entry_items(quantity_lbs, rate_per_lbs)", upToQ("entry_date")),
    fetchAllRows<any>(supabase, "supplier_payments", "supplier_id, amount", upToQ("payment_date")),
    fetchAllRows<any>(
      supabase, "sales_invoices", "customer_id, daybook_lbs, sales_invoice_items(amount, required_lbs, bookings(required_lbs))",
      periodQ("invoice_date"),
    ),
    fetchAllRows<any>(supabase, "raw_material_sales", "customer_id, amount, quantity_lbs", periodQ("sale_date")),
    fetchAllRows<any>(supabase, "customer_payments", "customer_id, amount", periodQ("payment_date")),
    supabase.from("raw_materials").select("id, material_name, unit, inventory_account_code"),
    supabase.from("raw_material_stock").select("material_id, quantity_lbs"),
    // asOf-এর পরের স্টক লেনদেন — আজকের স্টক থেকে উল্টো হিসাব করে ওই দিনের স্টক (Stock Report-এর মতো)
    asOf
      ? fetchAllRows<any>(supabase, "stock_ledger", "item_id, txn_type, quantity", (q) => q.eq("item_type", "raw_material").gt("txn_date", asOf))
      : Promise.resolve([] as any[]),
    fetchAllRows<any>(
      supabase, "material_consumption", "material_id, quantity_lbs, production_orders(bookings(customer_id))",
      periodQ("consumption_date"),
    ),
    fetchAllRows<any>(supabase, "bookings", "status, customer_id", periodQ("booking_date")),
  ]);

  const custList = (customers ?? []) as { id: string; name: string }[];
  const accountsById = new Map<string, any>((allAccounts ?? []).map((a: any) => [a.id, a]));

  // ---- Customer ফিল্টার (গ্রুপ = এক পার্টি, key "g:<groupId>" / "c:<customerId>") ----
  const entityOptions = salesEntityOptions(custList, groupMap);
  const custKey = sp.customer ?? "";
  const selEntity = entityOptions.find((o) => o.key === custKey) ?? null;
  const custIds: Set<string> | null = selEntity
    ? new Set(custKey.startsWith("g:") ? groupMap.membersOf[custKey.slice(2)] ?? [] : [custKey.slice(2)])
    : null;
  const custOk = (id: string | null | undefined) => !custIds || (!!id && custIds.has(id));
  const selEntityRef = selEntity
    ? { id: custKey.slice(2), isGroup: custKey.startsWith("g:") }
    : null;

  // ---- Account ফিল্টার — param না থাকলে Settings-এ বাছাই করা অ্যাকাউন্ট; ফাঁকা = কোনোটা না ----
  const selAccId = sp.account !== undefined ? sp.account : ((company as any)?.dashboard_account_id ?? "");
  const selAcc = selAccId ? accountsById.get(selAccId) : undefined;

  // ---- পার্টির JV — Gross Profit ও Account কার্ড কাস্টমার অনুযায়ী দেখাতে ----
  let custVouchers: Set<string> | null = null;
  if (custIds) {
    const ids = [...custIds];
    const byCust = (q: any) => q.in("customer_id", ids);
    const [invs, cogs, pays, adjs, rms, wss, bks, wastage] = await Promise.all([
      fetchAllRows<any>(supabase, "sales_invoices", "id, voucher_id", byCust),
      fetchAllRows<any>(supabase, "invoice_cogs", "invoice_id, voucher_id"),
      fetchAllRows<any>(supabase, "customer_payments", "voucher_id", byCust),
      fetchAllRows<any>(supabase, "customer_adjustments", "voucher_id", byCust),
      fetchAllRows<any>(supabase, "raw_material_sales", "voucher_id", byCust),
      fetchAllRows<any>(supabase, "wastage_sales", "voucher_id", byCust),
      fetchAllRows<any>(supabase, "bookings", "id, inventory_voucher_id", byCust),
      fetchAllRows<any>(supabase, "wastage", "booking_id, inventory_voucher_id", (q) => q.not("booking_id", "is", null)),
    ]);
    const set = new Set<string>();
    const add = (v: string | null | undefined) => { if (v) set.add(v); };
    const invIds = new Set(invs.map((r: any) => r.id));
    const bkIds = new Set(bks.map((r: any) => r.id));
    invs.forEach((r: any) => add(r.voucher_id));
    cogs.forEach((r: any) => { if (invIds.has(r.invoice_id)) add(r.voucher_id); });
    [...pays, ...adjs, ...rms, ...wss].forEach((r: any) => add(r.voucher_id));
    bks.forEach((r: any) => add(r.inventory_voucher_id));
    wastage.forEach((r: any) => { if (bkIds.has(r.booking_id)) add(r.inventory_voucher_id); });
    custVouchers = set;
  }
  const lineDate = (l: any) => one(l.journal_vouchers)?.voucher_date ?? "";
  const custLines = custVouchers ? jvLines.filter((l: any) => custVouchers!.has(l.voucher_id)) : jvLines;

  // ---- Cash + Bank — asOf পর্যন্ত ব্যালেন্স + এই সময়ে নিট পরিবর্তন (সব মিলিয়ে) ----
  const cashBankIds = new Set(
    (allAccounts ?? []).filter((a: any) => a.account_type === "asset" && /cash|bank/i.test(a.account_name)).map((a: any) => a.id),
  );
  let cashBankBalance = 0;
  let cashBankNet = 0;
  jvLines.forEach((l: any) => {
    if (!cashBankIds.has(l.account_id)) return;
    const d = lineDate(l);
    const amt = (l.debit || 0) - (l.credit || 0);
    if (upToAsOf(d)) cashBankBalance += amt;
    if (inPeriod(d)) cashBankNet += amt;
  });

  // ---- Receivable — asOf পর্যন্ত; গ্রুপভুক্ত কাস্টমার এক পার্টি হিসেবে net (Outstanding রিপোর্টের সাথে মিল) ----
  const dueRows = foldNumbers(groupMap, dues.customers, dues.due);
  const receivable = selEntity
    ? dueRows.find((r) => r.key === custKey)?.value ?? 0
    : dueRows.reduce((s, r) => s + (r.value > 0 ? r.value : 0), 0);

  // ---- Payable — asOf পর্যন্ত (সব সাপ্লায়ার) ----
  const supplierDue: Record<string, number> = {};
  purchases.forEach((p: any) => {
    const amt = (p.purchase_entry_items ?? []).reduce((s: number, i: any) => s + i.quantity_lbs * i.rate_per_lbs, 0);
    supplierDue[p.supplier_id] = (supplierDue[p.supplier_id] ?? 0) + amt;
  });
  supplierPayments.forEach((p: any) => { supplierDue[p.supplier_id] = (supplierDue[p.supplier_id] ?? 0) - p.amount; });
  const totalPayable = Object.values(supplierDue).reduce((s, v) => s + (v > 0 ? v : 0), 0);

  // ---- Sales (Invoice) ও Payment Received — এই সময়ে, কাস্টমার অনুযায়ী ----
  const invoicesShown = periodInvoices.filter((inv: any) => custOk(inv.customer_id));
  const periodSales = invoicesShown.reduce(
    (s: number, inv: any) => s + (inv.sales_invoice_items ?? []).reduce((t: number, i: any) => t + (i.amount || 0), 0), 0,
  );
  const paymentsShown = periodPayments.filter((p: any) => custOk(p.customer_id));
  const periodReceived = paymentsShown.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);

  // ---- P&L কার্ড: Gross Profit (Sales 4000/4010 − COGS 5050) + Operating Expenses ----
  let salesRevenue = 0;
  let cogs = 0;
  custLines.forEach((l: any) => {
    if (!inPeriod(lineDate(l))) return;
    const acc = accountsById.get(l.account_id);
    if (!acc) return;
    if (acc.account_code === "4000" || acc.account_code === "4010") salesRevenue += (l.credit || 0) - (l.debit || 0);
    else if (acc.account_code === "5050") cogs += (l.debit || 0) - (l.credit || 0);
  });
  const grossProfit = salesRevenue - cogs;
  let expenses = 0; // COGS বাদে বাকি সব expense অ্যাকাউন্ট (operating expense) — সব মিলিয়ে
  jvLines.forEach((l: any) => {
    if (!inPeriod(lineDate(l))) return;
    const acc = accountsById.get(l.account_id);
    if (acc && acc.account_type === "expense" && acc.account_code !== "5050") expenses += (l.debit || 0) - (l.credit || 0);
  });

  // ---- Account কার্ড — Opening (সময়ের আগে) / Debit / Credit / Closing, স্বাভাবিক দিক অনুযায়ী চিহ্ন ----
  let acct: { opening: number; debit: number; credit: number; closing: number } | null = null;
  if (selAcc) {
    let opening = 0, debit = 0, credit = 0;
    custLines.forEach((l: any) => {
      if (l.account_id !== selAcc.id) return;
      const d = lineDate(l);
      if (from && d < from) opening += (l.debit || 0) - (l.credit || 0);
      else if (!to || d <= to) { debit += l.debit || 0; credit += l.credit || 0; }
    });
    const sign = selAcc.account_type === "asset" || selAcc.account_type === "expense" ? 1 : -1;
    acct = { opening: sign * opening, debit, credit, closing: sign * (opening + debit - credit) };
  }

  // ---- কাঁচামাল স্টক — asOf দিনের Lbs (stock_ledger) + খাতা (GL) অনুযায়ী মূল্য, সব মিলিয়ে ----
  // কার্টনে গোনা material (Adhesive) Lbs-এ যোগ হয় না — আলাদা দেখায়। মূল্য inventory account-এর
  // asOf পর্যন্ত ব্যালেন্স (Stock Report / Balance Sheet-এর সাথে মেলে)।
  const rmById = new Map<string, any>((rmMaterials ?? []).map((m: any) => [m.id, m]));
  const isCarton = (m: any) => m?.unit === "carton";
  const rawQty: Record<string, number> = {};
  (rmStockRows ?? []).forEach((s: any) => { rawQty[s.material_id] = (rawQty[s.material_id] ?? 0) + (Number(s.quantity_lbs) || 0); });
  laterRawMoves.forEach((l: any) => {
    const sign = l.txn_type === "in" ? 1 : l.txn_type === "out" ? -1 : 0;
    rawQty[l.item_id] = (rawQty[l.item_id] ?? 0) - sign * (Number(l.quantity) || 0);
  });
  let rawStockLbs = 0;
  let cartonQty = 0;
  Object.entries(rawQty).forEach(([id, q]) => {
    if (isCarton(rmById.get(id))) cartonQty += q;
    else rawStockLbs += q;
  });
  const lbsCodes = new Set((rmMaterials ?? []).filter((m: any) => !isCarton(m)).map((m: any) => m.inventory_account_code || "1299"));
  const cartonCodes = new Set((rmMaterials ?? []).filter((m: any) => isCarton(m)).map((m: any) => m.inventory_account_code || "1299"));
  const cartonNames = (rmMaterials ?? []).filter((m: any) => isCarton(m)).map((m: any) => m.material_name).join(", ");
  let rawStockValue = 0;
  let cartonValue = 0;
  jvLines.forEach((l: any) => {
    if (!upToAsOf(lineDate(l))) return;
    const code = accountsById.get(l.account_id)?.account_code;
    const v = (l.debit || 0) - (l.credit || 0);
    if (lbsCodes.has(code)) rawStockValue += v;
    else if (cartonCodes.has(code)) cartonValue += v;
  });

  // ---- এই সময়ে production-এ ঢালা কাঁচামাল — কাস্টমার অনুযায়ী (production order → booking) ----
  // Lbs: material_consumption; মূল্য: booking-এর "RM issued" JV-তে WIP-এ যত তোলা হয়েছে (খাতা অনুযায়ী)
  let consumedLbs = 0;
  consumptionRows.forEach((c: any) => {
    if (custIds && !custOk(one(one(c.production_orders)?.bookings)?.customer_id)) return;
    consumedLbs += Number(c.quantity_lbs) || 0;
  });
  const wipAccId = (allAccounts ?? []).find((a: any) => a.account_code === "1220")?.id;
  let consumedValue = 0;
  custLines.forEach((l: any) => {
    if (l.account_id !== wipAccId) return;
    const jv = one(l.journal_vouchers);
    if (!(jv?.narration ?? "").startsWith("RM issued") || !inPeriod(jv?.voucher_date ?? "")) return;
    consumedValue += (l.debit || 0) - (l.credit || 0);
  });

  // ---- Booking Status — এই সময়ে বুক করা, কাস্টমার অনুযায়ী ----
  const statusCounts: Record<string, number> = {};
  periodBookings.forEach((b: any) => {
    if (!custOk(b.customer_id)) return;
    statusCounts[b.status] = (statusCounts[b.status] ?? 0) + 1;
  });

  // ---- Sales by Customer ----
  let salesRows = aggregateSalesByCustomer(periodInvoices, custList, groupMap, periodRmSales).sort((a, b) => b.amount - a.amount);
  if (selEntity) salesRows = salesRows.filter((r) => r.key === custKey);

  // ---- লিংক — রিপোর্টেও একই তারিখ-সীমা যায় ----
  const rangeQuery = new URLSearchParams(
    preset === "custom" ? { range: preset, from, to } : { range: preset },
  ).toString();
  const salesReportHref = `/dashboard/reports/sales-by-customer?${rangeQuery}${selEntity ? `&customer=${encodeURIComponent(custKey)}` : ""}`;
  const receivableHref = selEntityRef ? `${ledgerHref(selEntityRef)}?${rangeQuery}` : `/dashboard/reports/outstanding?${rangeQuery}`;

  const pLabel = periodShort(period);
  const asOfLabel = asOf ? `${formatLongDate(asOf)} পর্যন্ত` : "আজ পর্যন্ত";
  const allNote = selEntity ? "Customer প্রযোজ্য নয় — সব মিলিয়ে" : undefined;
  const custName = selEntity?.name ?? "";

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
      <h1 className="text-2xl font-semibold mb-1">Dashboard</h1>
      <p className="text-sm text-gray-500 mb-3">
        {datePresetLabel(period)}
        {selEntity && <> · Customer: <span className="font-medium text-gray-700">{custName}</span></>}
        {selAcc && <> · Account: <span className="font-medium text-gray-700">{selAcc.account_code} - {selAcc.account_name}</span></>}
      </p>

      {/* কোনো ঘর বদলালেই নিজে থেকে লোড হয় (AutoSubmitForm) */}
      <AutoSubmitForm
        className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-3 shadow-sm"
      >
        <DateRangeFields preset={preset} from={from} to={to} includeAll />
        <div>
          <label className="block text-xs text-gray-500 mb-1">Customer</label>
          <select name="customer" defaultValue={selEntity ? custKey : ""} className="rounded-lg border px-3 py-2 text-sm max-w-[220px]">
            <option value="">সব Customer</option>
            {entityOptions.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Account</label>
          <select name="account" defaultValue={selAcc ? selAccId : ""} className="rounded-lg border px-3 py-2 text-sm max-w-[260px]">
            <option value="">— কোনো Account না —</option>
            {ACCOUNT_TYPES.map((t) => {
              const list = (allAccounts ?? []).filter((a: any) => a.account_type === t.value);
              return list.length ? (
                <optgroup key={t.value} label={t.label}>
                  {list.map((a: any) => <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>)}
                </optgroup>
              ) : null;
            })}
          </select>
        </div>
        <Link href="/dashboard" className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Clear</Link>
      </AutoSubmitForm>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4 mb-4">
        <Card
          title="Cash + Bank Balance"
          period={asOfLabel}
          value={fmt(cashBankBalance)}
          valueClass={cashBankBalance >= 0 ? "text-green-700" : "text-red-700"}
          sub={from ? `${pLabel}-এ নিট ${cashBankNet >= 0 ? "+" : ""}${fmt(cashBankNet)}` : undefined}
          note={allNote}
        />
        <Card
          href={receivableHref}
          title={selEntity ? `${custName}-এর বাকি` : "Total Receivable"}
          period={asOfLabel}
          value={fmt(receivable)}
          valueClass={receivable >= 0 ? "text-blue-700" : "text-red-700"}
          sub={selEntity && receivable < 0 ? "অগ্রিম (advance)" : undefined}
        />
        <Card
          href={`/dashboard/reports/outstanding?${rangeQuery}`}
          title="Total Payable"
          period={asOfLabel}
          value={fmt(totalPayable)}
          valueClass="text-amber-700"
          note={allNote}
        />
        <Card
          href={salesReportHref}
          title="Sales Invoice"
          period={pLabel}
          value={fmt(periodSales)}
          valueClass="text-purple-700"
          sub={`${invoicesShown.length}টি Invoice`}
        />
        <Card
          title="Payment Received"
          period={pLabel}
          value={fmt(periodReceived)}
          valueClass="text-teal-700"
          sub={`${paymentsShown.length}টি পেমেন্ট`}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <Card
          href={`/dashboard/accounting/profit-loss?${rangeQuery}`}
          title="Gross Profit"
          period={pLabel}
          value={fmt(grossProfit)}
          valueClass={grossProfit >= 0 ? "text-green-700" : "text-red-700"}
          sub={`Sales ${fmt(salesRevenue)} − COGS ${fmt(cogs)}`}
        />
        <Card
          href={`/dashboard/accounting/profit-loss?${rangeQuery}`}
          title="Expenses"
          period={pLabel}
          value={fmt(expenses)}
          valueClass="text-red-700"
          sub="COGS ছাড়া operating expense"
          note={allNote}
        />
        {selAcc && acct ? (
          <Card
            href={`/dashboard/accounting/ledger/${selAcc.id}?${rangeQuery}`}
            title={`${selAcc.account_code} - ${selAcc.account_name}`}
            period={`Closing — ${to ? `${formatLongDate(to)} পর্যন্ত` : "আজ পর্যন্ত"}`}
            value={fmt(acct.closing)}
            valueClass={acct.closing >= 0 ? "text-gray-900" : "text-red-700"}
            sub={
              <>
                {from && <>Opening {fmt(acct.opening)} · </>}Dr {fmt(acct.debit)} · Cr {fmt(acct.credit)}
              </>
            }
            note={selEntity ? `শুধু ${custName}-এর লেনদেন (কাস্টমার Opening Balance বাদে)` : undefined}
          />
        ) : (
          <Card
            href="/dashboard/settings"
            dashed
            title="Account Balance"
            value={<span className="text-sm font-medium text-blue-700">উপরে Account বাছাই করুন (বা Settings-এ ডিফল্ট দিন) →</span>}
          />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card
          href={`/dashboard/reports/stock-report?${rangeQuery}`}
          title="Raw Material Stock"
          period={asOfLabel}
          value={`${fmt(rawStockLbs)} Lbs`}
          sub={
            <span className="text-gray-500">
              খাতা অনুযায়ী মূল্য ৳{fmt(rawStockValue)}
              {cartonNames && Math.abs(cartonQty) > 0.001 && <><br />{cartonNames} {fmt(cartonQty)} ctn (৳{fmt(cartonValue)}) — আলাদা</>}
            </span>
          }
          note={allNote}
        />
        <Card
          href={`/dashboard/reports/production-report?${rangeQuery}`}
          title="Production-এ ব্যবহৃত কাঁচামাল"
          period={pLabel}
          value={`${fmt(consumedLbs)} Lbs`}
          sub={<span className="text-gray-500">issue মূল্য (খাতা) ৳{fmt(consumedValue)}</span>}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <SalesByCustomer rows={salesRows} periodText={pLabel} reportHref={salesReportHref} ledgerQuery={rangeQuery} />

        <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
          <div className="px-4 py-3 border-b">
            <h2 className="text-sm font-semibold uppercase text-gray-500">Booking Status</h2>
            <p className="text-[11px] text-gray-400">{pLabel}-এ বুক করা{selEntity ? ` · ${custName}` : ""}</p>
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
