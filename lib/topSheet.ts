import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/fetchAll";
import { computeCustomerDues } from "@/lib/customerDues";
import { loadGroupMap, foldNumbers } from "@/lib/customerGroups";
import { monthRange } from "@/lib/payroll";
import { RAW_COST_RULE_START, getRawCostContext, adhesiveRateOn } from "@/lib/rawCost";
import {
  LBS_PER_BAG, ADHESIVE_CODE, MK_WAREHOUSE_PATTERN, topSheetTotals,
  type TsRow, type TsLbsRow, type TsMaterial, type TopSheetData, type TopSheetTotals,
} from "@/lib/topSheetCalc";

export { LBS_PER_BAG, topSheetTotals };
export type { TsRow, TsLbsRow, TsMaterial, TopSheetData, TopSheetTotals };

const r2 = (n: number) => Math.round(n * 100) / 100;

// মাসিক টপশীট (চূড়ান্ত হিসাব) — হাতে বানানো "09. September-2026-TopSheet.xlsx"-এর ERP রূপ।
//
// পেজ ১:
//   পাওনা + বাঁকি  = পার্টি-ভিত্তিক বাকি (গ্রুপ = এক পার্টি), মাস শেষ তারিখ পর্যন্ত
//   দেনা           = Balance-sheet account-এর credit balance (আবু জাফর, বেতন, এম কে, মুন্না …;
//                    Cash in Hand ঋণাত্মক হলে "ক্যাশ দেনা")
//   অন্যান্য পাওনা = Balance-sheet account-এর debit balance (উত্তরা ব্যাংক, আত্তুশ আলী, এলডি মেশিন,
//                    লিল্লাহ্ ফান্ড, ওমর ফারুক, রিপন থিনার …)
//                    বাদ: 1100 AR (পার্টি তালিকায় আছে), সব inventory account (স্টক অংশে আছে),
//                         3100 Retained Earnings (আগের মাসের বণ্টিত লাভ — এটা রাখলে লাভ "এই মাসের" থাকে না),
//                         3900 Opening Balance Equity (ERP চালুর সময়ের balancing অঙ্ক — হাতের শীটে নেই;
//                         রাখলে লাভ ~9.9 লাখ বেশি দেখায়)
//   মোট পাওনা + স্টক − মোট দেনা = লাভ/লস; লাভ হলে 1% লিল্লাহ্ ফান্ড, বাকি ওমর ফারুক।
//   খরচ            = এই মাসের expense account movement (COGS / Raw Material Purchase / Wastage Loss বাদ —
//                    ওগুলো নিচের স্টক-ভিত্তিক প্রাথমিক লাভে আপনিই ধরা পড়ে)।
// নিচের টেবিল (periodic পদ্ধতি, Excel-এর মতো):
//   প্রতি Lbs ক্রয়মূল্য = (আগের স্টক টাকা + ক্রয় টাকা) ÷ (আগের স্টক Lbs + ক্রয় Lbs)
//   বর্তমান স্টক টাকা   = বর্তমান স্টক Lbs × প্রতি Lbs ক্রয়মূল্য
//   ওয়েস্টেজ Lbs        = মোট Lbs − (বর্তমান স্টক + বিক্রি + কাঁচামাল বিক্রি)   ← balancing figure
//   প্রাথমিক লাভ        = (বর্তমান স্টক + বিক্রি + কাঁচামাল বিক্রি + ওয়েস্টেজ বিক্রি) − (আগের স্টক + ক্রয়)
//   নিট লাভ/লস          = প্রাথমিক লাভ − মোট খরচ   (উপরের পাওনা-দেনা হিসাবের সাথে মিলতে হবে)
// পেজ ২ (স্টক বিবরণ): কাঁচামাল-ভিত্তিক ব্যাগ (1 ব্যাগ = 55 Lbs) — "আছে" (নিজস্ব গুদাম) + "এম কে" গুদাম,
//   বানানো আছে (+) / বানানো বাকি (−) Lbs তালিকা, এডহেসিভ কার্টুন × দর।
//
// সব সংখ্যা ERP থেকে ডিফল্ট আসে, পেজে হাতে বদলানো যায়; "সেভ" করলে পুরো শীট month_topsheets.data-তে
// snapshot হয়। পরের মাসের "আগের মাসের স্টক" ঐ snapshot-এর বর্তমান স্টক থেকে আসে।

const RETAINED_CODE = "3100";
const OPENING_EQUITY_CODE = "3900";
const AR_CODE = "1100";
const CASH_CODE = "1000";
// FG / WIP — টাকার হিসাব স্টক অংশে "বানানো আছে" দিয়ে ধরা হয়, তাই দেনা/পাওনা তালিকায় নয়
const OTHER_INVENTORY_CODES = ["1210", "1220"];
// নিচের প্রাথমিক লাভে (স্টক-পার্থক্যে) আপনিই ধরা পড়ে — খরচ তালিকায় দেখালে দুবার গোনা হবে
const EXCLUDED_EXPENSE_CODES = ["5000", "5050", "5600"];


function prevYearMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

// ── হাতের টপশীটের সাজানো (নাম + ক্রম + একসাথে করা লাইন) ─────────────────────────────
// "09. September-2026-TopSheet" অনুযায়ী। তালিকায় না থাকা লাইন শেষে ERP-র নামে আসে।
// এখানে নাম বদলালে পরের নতুন শীটে নতুন নাম; সেভ করা শীটে হাতে বদলানো নাম (key ধরে) আগের মতোই বহাল থাকে।
type LayoutLine = { codes: string[]; label: string };
const LIABILITY_LAYOUT: LayoutLine[] = [
  { codes: ["3000"], label: "মোঃ আবু জাফর" },
  { codes: ["2200"], label: "বেতন" },
  { codes: ["2600"], label: "এম কে এক্সেসোরিজ" },
  { codes: ["2700"], label: "মুন্না" },
  { codes: ["2710"], label: "মুন্না-৩" },
  { codes: ["1000"], label: "ক্যাশ দেনা" },
];
const OTHER_ASSET_LAYOUT: LayoutLine[] = [
  { codes: ["1010"], label: "উত্তরা ব্যাংক" },
  { codes: ["1305"], label: "আত্তুশ আলী" },
  { codes: ["1405"], label: "এলডি মেশিন (নতুন)" },
  { codes: ["2800"], label: "লিল্লাহ ফান্ড" },
  { codes: ["3300"], label: "ওমর ফারুক" },
  { codes: ["1500"], label: "রিপন থিনার" },
];
const EXPENSE_LAYOUT: LayoutLine[] = [
  { codes: ["5100"], label: "বেতন" },
  { codes: ["5005", "5007", "5500"], label: "ফ্যাক্টরি খরচ" }, // ফ্যাক্টরী খরচ + OT + যাতায়াত — খাতায় এক লাইনে
  { codes: ["5200"], label: "ফ্যাক্টরি ভাড়া" },
  { codes: ["5300"], label: "বিদ্যুৎ বিল" },
  { codes: ["5011"], label: "এডহিসিভ" },
  { codes: ["5121"], label: "থিনার" },
  { codes: ["5001"], label: "ব্রাক ব্যাংক খরচ" },
  { codes: ["5003"], label: "মাইক্রো খরচ" },
  { codes: ["5002"], label: "এলডি মেশিন খরচ" },
  { codes: ["5009"], label: "প্রিন্টিং মেশিন" },
  { codes: ["5004", "5006"], label: "যাকাত" },
  { codes: ["5410"], label: "এল সি খরচ" },
  { codes: ["5010"], label: "এম কে মেকিং কাটিং" },
  { codes: ["5015"], label: "ব্লক মেকিং" },
  { codes: ["5310"], label: "জেনারেটর খরচ" },
  { codes: ["5008"], label: "বটম মেশিন খরচ" },
];
// পার্টি: [ERP-র নাম (গ্রুপ/কাস্টমার), খাতার নাম] — খাতার ক্রমে
const PARTY_LAYOUT: [string, string][] = [
  ["এটি এক্সেসোরিজ", "এ টি এক্সেসোরিজ"], ["মুন্না-2", "মুন্না-২"], ["হানিফ", "হানিফ"],
  ["দ্বিপায়ন এক্সেসোরিজ", "দ্বিপায়ন এক্সেসোরিজ"], ["সামস গার্মেন্টস", "সামস গার্মেন্টস"],
  ["র‌্যাপিড ডিজাইন", "র‌্যাপিড ডিজাইন"], ["ফাহিম এক্সেসোরিজ", "ফাহিম এক্সেসোরিজ"],
  ["ড্রেসডেন টেক্সটাইল", "ড্রেসডেন টেক্সটাইল"], ["মামুন", "মামুন"], ["বাবু/রামপুরা", "বাবু/ রামপুরা"],
  ["হিটেজ জহির", "জহির খান/হিটেজ"], ["নতুন পার্টি", "নতুন পার্টি"], ["আকরাম ইন্টারন্যাশনাল", "আকরাম/জামাই"],
  ["ডেবনিয়ার গার্মেন্টস", "ডেবনএয়ার গার্মেন্টস"], ["ফ্লোরেন্স", "ফ্লোরেন্স"], ["এ এন আর ফ্যাশন", "এএনআর ফ্যাশন"],
  ["ডায়নামিক জহির", "ডাইনামিক জহির"], ["আইরিশ গার্মেন্টস", "আইরিশ গার্মেন্টস"], ["রুবেল-হ্যামস", "রুবেল-হ্যামস"],
  ["দ্বিয়া এক্সেসোরিজ", "দ্বিয়া এক্সেসোরিজ"], ["মুন লাইট গার্মেন্টস", "মুন লাইট গার্মেন্টস"], ["ডলার", "ডলার"],
  ["ভিশন গার্মেন্টস", "ভিশন গার্মেন্টস"], ["নেটওয়ার্ক", "নেটওয়ার্ক"], ["মাহমুদ-আকরাম", "মাহমুদ-আকরাম"],
  ["জিম টেক্স - মুন্না", "জিম-টেক্স-মুন্না"], ["ভালমন্ট", "ভালমন্ট"],
];
// নাম মেলাতে: য়/ড়-এর দুই রকম ইউনিকোড, স্পেস, হাইফেন, ZWJ/ZWNJ উপেক্ষা
const IGNORE_IN_NAME = /[\s\-\u200c\u200d]/g;
const normName = (s: string) => (s ?? "").normalize("NFD").replace(IGNORE_IN_NAME, "");

/** account-ভিত্তিক সারি (key = acct:<code>) খাতার ক্রম/নামে সাজায়; একাধিক code এক লাইনে যোগ হয়। */
function applyAccountLayout(rows: TsRow[], layout: LayoutLine[]): TsRow[] {
  const byCode = new Map(rows.filter((r) => r.key?.startsWith("acct:")).map((r) => [r.key!.slice(5), r]));
  const used = new Set<string>();
  const out: TsRow[] = [];
  for (const line of layout) {
    const hits = line.codes.map((c) => byCode.get(c)).filter(Boolean) as TsRow[];
    if (!hits.length) continue;
    hits.forEach((h) => used.add(h.key!));
    out.push({ key: `acct:${line.codes.join("+")}`, label: line.label, amount: r2(hits.reduce((s, h) => s + h.amount, 0)) });
  }
  return [...out, ...rows.filter((r) => !r.key || !used.has(r.key))];
}

function applyPartyLayout(rows: TsRow[]): TsRow[] {
  const used = new Set<TsRow>();
  const out: TsRow[] = [];
  for (const [erpName, label] of PARTY_LAYOUT) {
    const hit = rows.find((r) => !used.has(r) && normName(r.label) === normName(erpName));
    if (!hit) continue;
    used.add(hit);
    out.push({ ...hit, label });
  }
  return [...out, ...rows.filter((r) => !used.has(r))];
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** ERP ডাটা থেকে নতুন টপশীট (এডিট/সেভের আগে)। */
export async function buildTopSheetFromErp(
  supabase: SupabaseClient,
  year: number,
  month: number,
): Promise<TopSheetData> {
  const { start, end } = monthRange(year, month);
  const prev = prevYearMonth(year, month);
  const prevEnd = monthRange(prev.year, prev.month).end;

  const [
    { customers, due },
    gm,
    { data: accounts },
    lines,
    { data: materials },
    { data: stockRows },
    { data: warehouses },
    ledgerMoves,
    purchases,
    freight,
    invoices,
    rmSales,
    wastageSales,
    { data: prevSnap },
  ] = await Promise.all([
    computeCustomerDues(supabase, end),
    loadGroupMap(supabase),
    supabase.from("chart_of_accounts").select("id, account_code, account_name, account_type"),
    fetchAllRows<any>(
      supabase, "journal_entry_lines", "account_id, debit, credit, journal_vouchers!inner(voucher_date)",
      (q) => q.lte("journal_vouchers.voucher_date", end),
    ),
    supabase.from("raw_materials").select("id, material_name, unit, avg_cost_per_lbs, inventory_account_code").order("material_name"),
    supabase.from("raw_material_stock").select("material_id, warehouse_id, quantity_lbs"),
    supabase.from("warehouses").select("id, name"),
    // সব raw-material চলাচল — মাস-শেষ: আজকের স্টক থেকে পরের চলাচল উল্টে; আগের মাস-শেষ: লেজারের যোগফল
    fetchAllRows<any>(
      supabase, "stock_ledger", "item_id, warehouse_id, txn_type, quantity, txn_date",
      (q) => q.eq("item_type", "raw_material"),
    ),
    fetchAllRows<any>(
      supabase, "purchase_entries", "id, purchase_entry_items(material_id, quantity_lbs, rate_per_lbs)",
      (q) => q.gte("entry_date", start).lte("entry_date", end),
    ),
    fetchAllRows<any>(
      supabase, "purchase_freight_charges", "amount",
      (q) => q.gte("charge_date", start).lte("charge_date", end),
    ),
    fetchAllRows<any>(
      supabase, "sales_invoices", "daybook_lbs, sales_invoice_items(amount, required_lbs, bookings(required_lbs))",
      (q) => q.gte("invoice_date", start).lte("invoice_date", end),
    ),
    fetchAllRows<any>(
      supabase, "raw_material_sales", "quantity_lbs, amount",
      (q) => q.gte("sale_date", start).lte("sale_date", end),
    ),
    fetchAllRows<any>(
      supabase, "wastage_sales", "amount",
      (q) => q.gte("sale_date", start).lte("sale_date", end),
    ),
    supabase.from("month_topsheets").select("data, confirmed_at").eq("year", prev.year).eq("month", prev.month).maybeSingle(),
  ]);

  const acctById = new Map<string, any>((accounts ?? []).map((a: any) => [a.id, a]));
  const idByCode = new Map<string, string>((accounts ?? []).map((a: any) => [a.account_code, a.id]));

  // ── Balance-sheet balances (মাস শেষ পর্যন্ত) + এই মাসের expense movement ──
  const bal: Record<string, number> = {};
  const balPrev: Record<string, number> = {};
  const monthMove: Record<string, number> = {};
  lines.forEach((l: any) => {
    const d = l.journal_vouchers?.voucher_date ?? "";
    const v = (Number(l.debit) || 0) - (Number(l.credit) || 0);
    bal[l.account_id] = (bal[l.account_id] ?? 0) + v;
    if (d <= prevEnd) balPrev[l.account_id] = (balPrev[l.account_id] ?? 0) + v;
    if (d >= start) monthMove[l.account_id] = (monthMove[l.account_id] ?? 0) + v;
  });

  const inventoryCodes = new Set<string>([
    ...OTHER_INVENTORY_CODES,
    ADHESIVE_CODE,
    ...(materials ?? []).map((m: any) => m.inventory_account_code).filter(Boolean),
  ]);
  const skipCodes = new Set<string>([AR_CODE, RETAINED_CODE, OPENING_EQUITY_CODE, ...inventoryCodes]);

  const liabilities: TsRow[] = [];
  const otherAssets: TsRow[] = [];
  const bsAccounts = (accounts ?? [])
    .filter((a: any) => ["asset", "liability", "equity"].includes(a.account_type) && !skipCodes.has(a.account_code))
    .sort((a: any, b: any) => a.account_code.localeCompare(b.account_code));
  bsAccounts.forEach((a: any) => {
    const b = r2(bal[a.id] ?? 0);
    if (Math.abs(b) < 1) return;
    const key = `acct:${a.account_code}`;
    if (b > 0) otherAssets.push({ key, label: a.account_name, amount: b });
    else liabilities.push({ key, label: a.account_code === CASH_CODE ? "ক্যাশ দেনা" : a.account_name, amount: -b });
  });
  // বড় দেনা আগে (Excel-এর মতো আবু জাফর উপরে)
  liabilities.sort((a, b) => b.amount - a.amount);

  // ── খরচ: এই মাসের expense movement (+ অন্যান্য আয় ঋণাত্মক খরচ হিসেবে) ──
  const expenses: TsRow[] = [];
  (accounts ?? [])
    .filter((a: any) => a.account_type === "expense" && !EXCLUDED_EXPENSE_CODES.includes(a.account_code))
    .sort((a: any, b: any) => a.account_code.localeCompare(b.account_code))
    .forEach((a: any) => {
      const v = r2(monthMove[a.id] ?? 0);
      if (Math.abs(v) >= 1) expenses.push({ key: `acct:${a.account_code}`, label: a.account_name, amount: v });
    });
  const otherIncomeId = idByCode.get("4100");
  if (otherIncomeId && Math.abs(monthMove[otherIncomeId] ?? 0) >= 1) {
    expenses.push({ key: "acct:4100", label: "(−) অন্যান্য আয়", amount: r2(monthMove[otherIncomeId]) });
  }

  // ERP-এর নিজস্ব মাসিক লাভ (তুলনার জন্য)
  let erpNetProfit = 0;
  Object.entries(monthMove).forEach(([id, v]) => {
    const t = acctById.get(id)?.account_type;
    if (t === "income" || t === "expense") erpNetProfit -= v;
  });
  erpNetProfit = r2(erpNetProfit);

  // ── পার্টি বাকি (গ্রুপ = এক পার্টি) ──
  const parties: TsRow[] = foldNumbers(gm, customers, due)
    .filter((r) => Math.abs(r.value) >= 1)
    .sort((a, b) => b.value - a.value)
    .map((r) => ({ key: `party:${r.key}`, label: r.name, amount: r2(r.value) }));

  // ── স্টক (মাস শেষ ও আগের মাস শেষ) ──
  const mkIds = new Set((warehouses ?? []).filter((w: any) => MK_WAREHOUSE_PATTERN.test(w.name ?? "")).map((w: any) => w.id));
  const isAdhesive = (m: any) => m.inventory_account_code === ADHESIVE_CODE;
  const qty: Record<string, { own: number; mk: number }> = {};
  const prevQty: Record<string, number> = {};
  (stockRows ?? []).forEach((s: any) => {
    const q = (qty[s.material_id] ??= { own: 0, mk: 0 });
    if (mkIds.has(s.warehouse_id)) q.mk += Number(s.quantity_lbs) || 0;
    else q.own += Number(s.quantity_lbs) || 0;
  });
  // আগের মাস-শেষ = লেজারের যোগফল (prevEnd পর্যন্ত)। আজকের স্টক থেকে উল্টো হিসাব করলে স্টক-টেবিল আর
  // লেজারের গরমিল (লেজার ছাড়া স্টক বদল) আগের মাসে ঢুকে যায় — opening স্টকের সাথে আর মেলে না।
  ledgerMoves.forEach((l: any) => {
    const sign = l.txn_type === "in" ? 1 : l.txn_type === "out" ? -1 : 0;
    const n = sign * (Number(l.quantity) || 0);
    if (l.txn_date <= prevEnd) prevQty[l.item_id] = (prevQty[l.item_id] ?? 0) + n;
    if (l.txn_date > end) {
      const q = (qty[l.item_id] ??= { own: 0, mk: 0 });
      if (mkIds.has(l.warehouse_id)) q.mk -= n;
      else q.own -= n;
    }
  });

  const polyMaterials = (materials ?? []).filter((m: any) => !isAdhesive(m));
  const polyIds = new Set(polyMaterials.map((m: any) => m.id));
  const tsMaterials: TsMaterial[] = polyMaterials
    .map((m: any) => ({
      name: m.material_name,
      ownBags: r2((qty[m.id]?.own ?? 0) / LBS_PER_BAG),
      mkBags: r2((qty[m.id]?.mk ?? 0) / LBS_PER_BAG),
    }))
    .filter((m: TsMaterial) => Math.abs(m.ownBags) >= 0.01 || Math.abs(m.mkBags) >= 0.01);

  const adhesive = (materials ?? []).find(isAdhesive);
  const adhesiveCartons = adhesive ? r2((qty[adhesive.id]?.own ?? 0) + (qty[adhesive.id]?.mk ?? 0)) : 0;
  // Adhesive দর — মাসিক নিয়মে মাস-শেষের দর (lib/rawCost.ts); নিয়মের আগের মাসে avg cost
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const adhRuleRate = ym >= RAW_COST_RULE_START ? adhesiveRateOn(await getRawCostContext(supabase, ym), end) : 0;
  const adhesiveRate = adhesive ? r2(adhRuleRate || Number(adhesive.avg_cost_per_lbs) || 0) : 0;

  // ── আগের মাসের স্টক: আগের মাসের **confirmed** টপশীট থাকলে তার বর্তমান স্টক, নইলে ERP (মাস-শেষ Lbs + GL মূল্য)
  //    — কাঁচামালের মাসিক দরও ঠিক এই Opening ধরে (lib/rawCost.ts) ──
  let opening: TopSheetData["opening"];
  const prevData = prevSnap?.data as TopSheetData | undefined;
  if (prevData?.version === 1 && prevSnap?.confirmed_at) {
    const pt = topSheetTotals(prevData);
    opening = { lbs: pt.closingLbs, amount: pt.closingValue, source: "snapshot" };
  } else {
    const polyCodes = new Set(polyMaterials.map((m: any) => m.inventory_account_code).filter(Boolean));
    let amt = 0;
    polyCodes.forEach((c) => { const id = idByCode.get(c as string); if (id) amt += balPrev[id] ?? 0; });
    const lbs = polyMaterials.reduce((s: number, m: any) => s + (prevQty[m.id] ?? 0), 0);
    // ERP চালুর প্রথম মাসে opening stock মাসের ভেতরে manual adjustment হিসেবে ঢোকানো — তাই আগের মাস-শেষের
    // ERP অঙ্ক ঋণাত্মক/ভুল আসতে পারে। ঋণাত্মক হলে 0; পেজে "হাতে দিন" সতর্কতা দেখায়।
    opening = { lbs: Math.max(0, Math.round(lbs)), amount: Math.max(0, Math.round(amt)), source: "erp" };
  }

  // ── ক্রয় (কাঁচামাল, এডহেসিভ বাদ) + এই মাসের freight (inventory cost-এ capitalise হয়) ──
  let pLbs = 0;
  let pAmt = 0;
  purchases.forEach((p: any) =>
    (p.purchase_entry_items ?? []).forEach((i: any) => {
      if (!polyIds.has(i.material_id)) return;
      pLbs += Number(i.quantity_lbs) || 0;
      pAmt += (Number(i.quantity_lbs) || 0) * (Number(i.rate_per_lbs) || 0);
    }),
  );
  pAmt += freight.reduce((s: number, f: any) => s + (Number(f.amount) || 0), 0);

  // ── বিক্রি: সব ইনভয়েস (নগদ + বাকি); Lbs = খাতার Lbs (daybook_lbs), নইলে booking-এর Production Lbs
  //    (স্টক থেকে যা কমে), booking না থাকলে item.required_lbs (LBS invoice-এর বিল করা অর্ডার Lbs আগে নয়) ──
  let sLbs = 0;
  let sAmt = 0;
  invoices.forEach((inv: any) => {
    let lineLbs = 0;
    (inv.sales_invoice_items ?? []).forEach((i: any) => {
      const bk = Array.isArray(i.bookings) ? i.bookings[0] : i.bookings;
      sAmt += Number(i.amount) || 0;
      lineLbs += Number(bk?.required_lbs ?? i.required_lbs ?? 0) || 0;
    });
    sLbs += inv.daybook_lbs != null ? Number(inv.daybook_lbs) || 0 : lineLbs;
  });

  // খাতার টপশীটের নাম/ক্রমে সাজানো (তারপর আগের সেভ করা শীটের হাতে বদলানো নাম বহাল)
  const sheetLiabilities = applyAccountLayout(liabilities, LIABILITY_LAYOUT);
  const sheetOtherAssets = applyAccountLayout(otherAssets, OTHER_ASSET_LAYOUT);
  const sheetExpenses = applyAccountLayout(expenses, EXPENSE_LAYOUT);
  const sheetParties = applyPartyLayout(parties);

  // আগের সেভ করা শীটে হাতে বদলানো নাম (একই ERP উৎস) এ মাসেও বহাল
  if (prevData?.version === 1) {
    const prevLabels = new Map<string, string>();
    [prevData.parties, prevData.liabilities, prevData.otherAssets, prevData.expenses].forEach((rows) =>
      rows.forEach((r) => { if (r.key) prevLabels.set(r.key, r.label); }),
    );
    [sheetParties, sheetLiabilities, sheetOtherAssets, sheetExpenses].forEach((rows) =>
      rows.forEach((r) => { if (r.key && prevLabels.has(r.key)) r.label = prevLabels.get(r.key)!; }),
    );
  }

  return {
    version: 1,
    year,
    month,
    parties: sheetParties,
    liabilities: sheetLiabilities,
    otherAssets: sheetOtherAssets,
    expenses: sheetExpenses,
    materials: tsMaterials,
    made: [],
    unmade: [],
    adhesiveCartons,
    adhesiveRate,
    opening,
    purchase: { lbs: Math.round(pLbs), amount: Math.round(pAmt) },
    sales: { lbs: Math.round(sLbs), amount: r2(sAmt) },
    rmSale: {
      lbs: Math.round(rmSales.reduce((s: number, r: any) => s + (Number(r.quantity_lbs) || 0), 0)),
      amount: r2(rmSales.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0)),
    },
    wastageSaleAmount: r2(wastageSales.reduce((s: number, w: any) => s + (Number(w.amount) || 0), 0)),
    lillahPct: 1,
    erpNetProfit,
  };
}
