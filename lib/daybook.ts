import type { SupabaseClient } from "@supabase/supabase-js";

// ── DayBook (দৈনিক জমা খরচের হিসাব) ────────────────────────────────────────────
//
// হাতে-লেখা "দৈনিক জমা খরচের হিসাব" খাতাটার হুবহু রূপ, কিন্তু পুরোটা ERP data থেকে।
//
// মডেল: DayBook আসলে **Cash in Hand (1000)** এর একটা বই। Bank (1010/1011/1012) আর
//       Md Abu Jafor (3000) — এই দুটোকে ব্যবসা "প্রায়-নগদ উৎস" ধরে, তাই এদের দিয়ে
//       করা লেনদেন pass-through দেখানো হয় (জমায় "উত্তরা ব্যাংক"/"আবু জাফর" এক লাইনে,
//       খরচে আসল খাত — বা উল্টো)। সব pass-through কাটাকাটি হয়ে যায়, তাই নিচের
//       "ক্যাশ দেনা" = account 1000-এর ঐ দিন শেষের প্রকৃত ledger balance (GL-এর সাথে মেলে)।
//
//   জমা কলাম  = 1000-এ ঢোকা টাকা + bank/আবু-জাফর pass-through জমা
//   খরচ কলাম  = 1000 থেকে বেরোনো টাকা + pass-through খরচ + বাকিতে-বিক্রির "বিল" লাইন
//   বিক্রি ব্লক = ঐ দিনের বাকিতে বিক্রি (party-wise, Lbs + টাকা)
//   স্টক ব্লক  = ছিলো (ERP opening) + ক্রয় (purchase Lbs) − খরচ (বিক্রি Lbs) = আছে
//   সিলিং ব্লক = ঐ দিনে cutting-সম্পন্ন pcs — simple+gusset → বটম, বাকি → সাইড
//   বাঁকি ব্লক = AR ছিলো + বাকি বিক্রি − পার্টি জমা = আছে

const CASH_CODE = "1000";
const ABU_JAFOR_CODE = "3000";
const AR_CODE = "1100";
const AP_CODE = "2000";

const BOTTOM_SEAL_MTYPES = new Set(["simple", "gusset"]);

export type DbRow = { name: string; note: string; amount: number };
export type BikriRow = { name: string; lbs: number; amount: number };

export type DayBookData = {
  fromDate: string;
  toDate: string;
  singleDay: boolean;

  jama: DbRow[];
  jamaTotal: number;
  khoroch: DbRow[];
  khorochTotal: number;

  bikri: BikriRow[];
  bikriLbs: number;
  bikriAmount: number;

  priorCash: number; // account 1000 ব্যালেন্স, from-তারিখের শুরুতে
  cashPosition: number; // = priorCash + jamaTotal + bikriAmount − khorochTotal  (== 1000 GL balance)

  stockOpening: number;
  stockPurchaseLbs: number;
  stockSoldLbs: number;
  stockClosing: number;

  sideSealPcs: number;
  bottomSealPcs: number;

  arOpening: number;
  arBikri: number;
  arPartyJama: number;
  arClosing: number;
};

type Acct = { id: string; account_code: string; account_name: string; account_type: string };

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const one = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);

/** নামের সাথে "cash"/"bank" মিললে সেটা নগদ-সমতুল্য (1000 + সব ব্যাংক)। */
function isBankName(name: string) {
  const n = name.toLowerCase();
  return n.includes("bank") || n.includes("uttara") || n.includes("brac") || n.includes("ebl");
}

function cleanNarration(nar: string | null | undefined): string {
  if (!nar) return "";
  const m = nar.match(/^Expense\s*[—–-]\s*(.+)$/);
  return (m ? m[1] : nar).trim();
}

export async function buildDayBook(
  supabase: SupabaseClient,
  fromDate: string,
  toDate: string,
): Promise<DayBookData> {
  const from = fromDate;
  const to = toDate;

  // ── Chart of accounts ──
  const { data: accountsRaw } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type");
  const accounts = (accountsRaw ?? []) as Acct[];
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const cashId = accounts.find((a) => a.account_code === CASH_CODE)?.id ?? "";
  const abuJaforId = accounts.find((a) => a.account_code === ABU_JAFOR_CODE)?.id ?? "";
  const bankIds = new Set(
    accounts.filter((a) => a.account_type === "asset" && a.account_code !== CASH_CODE && isBankName(a.account_name)).map((a) => a.id),
  );
  // "প্রায়-নগদ উৎস" = ব্যাংক + আবু জাফর
  const sourceIds = new Set<string>([...bankIds, abuJaforId].filter(Boolean));
  const poolIds = new Set<string>([cashId, ...sourceIds].filter(Boolean));

  // ── Journal lines (pool অ্যাকাউন্টে) — prior balance + in-range ──
  const { data: poolLinesRaw } = await supabase
    .from("journal_entry_lines")
    .select("voucher_id, account_id, debit, credit, memo, journal_vouchers(voucher_no, voucher_date, narration)")
    .in("account_id", poolIds.size ? [...poolIds] : ["00000000-0000-0000-0000-000000000000"]);

  const poolLines = (poolLinesRaw ?? []) as any[];

  const isSystemVoucher = (nar: string) => nar.startsWith("Opening") || nar.startsWith("Rounding");

  // prior cash (1000) balance — from-তারিখের আগের সব 1000 লাইন + যেকোনো তারিখের
  // opening/rounding ভাউচার (opening balance সবসময় "শুরুর" অংশ, তারিখ যা-ই হোক)।
  let priorCash = 0;
  for (const l of poolLines) {
    if (l.account_id !== cashId) continue;
    const nar = (one<any>(l.journal_vouchers)?.narration ?? "").trim();
    const d = one<any>(l.journal_vouchers)?.voucher_date ?? "";
    if (isSystemVoucher(nar)) {
      if (d && d <= to) priorCash += num(l.debit) - num(l.credit);
    } else if (d && d < from) {
      priorCash += num(l.debit) - num(l.credit);
    }
  }

  // in-range vouchers যেগুলো pool ছুঁয়েছে (opening/rounding বাদ)
  const voucherIds = new Set<string>();
  for (const l of poolLines) {
    const v = one<any>(l.journal_vouchers);
    const d = v?.voucher_date ?? "";
    if (!d || d < from || d > to) continue;
    if (isSystemVoucher((v?.narration ?? "").trim())) continue;
    voucherIds.add(l.voucher_id);
  }

  // ঐ vouchers-এর সব লাইন (contra খুঁজতে)
  const { data: allLinesRaw } = voucherIds.size
    ? await supabase
        .from("journal_entry_lines")
        .select("voucher_id, account_id, debit, credit, memo, journal_vouchers(voucher_no, voucher_date, narration)")
        .in("voucher_id", [...voucherIds])
    : { data: [] };
  const linesByVoucher = new Map<string, any[]>();
  for (const l of (allLinesRaw ?? []) as any[]) {
    if (!linesByVoucher.has(l.voucher_id)) linesByVoucher.set(l.voucher_id, []);
    linesByVoucher.get(l.voucher_id)!.push(l);
  }

  // voucher → customer/supplier নাম (payment লেবেলের জন্য)
  const { data: custPaysRaw } = await supabase
    .from("customer_payments")
    .select("voucher_id, amount, payment_date, customers(name)");
  const { data: supPaysRaw } = await supabase
    .from("supplier_payments")
    .select("voucher_id, payment_date, suppliers(name)");
  const custNameByVoucher = new Map<string, string>();
  for (const p of (custPaysRaw ?? []) as any[]) {
    if (p.voucher_id) custNameByVoucher.set(p.voucher_id, one<any>(p.customers)?.name ?? "কাস্টমার");
  }
  const supNameByVoucher = new Map<string, string>();
  for (const p of (supPaysRaw ?? []) as any[]) {
    if (p.voucher_id) supNameByVoucher.set(p.voucher_id, one<any>(p.suppliers)?.name ?? "সাপ্লায়ার");
  }

  // অ্যাকাউন্ট নামকে খাতার (PDF) ভাষায় সংক্ষিপ্ত করা
  const NAME_BY_CODE: Record<string, string> = {
    "3000": "আবু জাফর",
    "2200": "বেতন",
    "5100": "বেতন",
    "5500": "যাতায়াত",
    "5007": "ওভার টাইম",
    "5110": "ওভার টাইম",
    "2800": "লিল্লাহ্",
    "1010": "উত্তরা ব্যাংক",
    "1011": "ব্রাক ব্যাংক",
    "1012": "ইবিএল",
    "2700": "মুন্না",
    "2710": "মুন্না-৩",
    "2600": "এম কে এক্সেসোরিজ",
  };
  function displayAccountName(acc: Acct): string {
    if (NAME_BY_CODE[acc.account_code]) return NAME_BY_CODE[acc.account_code];
    if (acc.account_code?.startsWith("120") || acc.account_code === "1204" || acc.account_code === "1299") {
      const short = acc.account_name.replace(/^Raw Material Inventory\s*-\s*/i, "").trim();
      return `কাঁচামাল ক্রয়${short ? ` — ${short}` : ""}`;
    }
    return acc.account_name;
  }

  const dollarNote = (nar: string | null | undefined): string => {
    const m = (nar ?? "").match(/\$\s*([\d,]+(?:\.\d+)?)/);
    return m ? `${m[1]} ডলার` : "";
  };

  function contraLabel(acc: Acct, voucherId: string, narration: string | null): string {
    if (acc.account_code === AR_CODE) {
      return (
        custNameByVoucher.get(voucherId) ||
        cleanNarration(narration).replace(/^Payment received from\s*/i, "").replace(/\s*[—–-]\s*\$.*$/, "").trim() ||
        "কাস্টমার"
      );
    }
    if (acc.account_code === AP_CODE) {
      return supNameByVoucher.get(voucherId) || cleanNarration(narration) || "সাপ্লায়ার";
    }
    return displayAccountName(acc);
  }

  // ── জমা / খরচ কলাম বানানো ──
  // জমা receipts = per-line (একই পার্টি দিনে দুবার দিলে আলাদা সারি)
  // খরচ = খাত (contra account) অনুযায়ী গ্রুপ, sub-note "+"-জোড়া
  // bank/আবু-জাফর = এক সারি aggregate (parts "+"-জোড়া)
  const jama: DbRow[] = [];
  const jamaAgg = new Map<string, { name: string; amount: number; parts: number[] }>();
  const khorochAgg = new Map<string, { name: string; amount: number; parts: number[] }>();
  const khorochByHead = new Map<string, { name: string; amount: number; notes: string[]; parts: number[] }>();
  const addAgg = (map: Map<string, { name: string; amount: number; parts: number[] }>, acc: Acct, amt: number) => {
    const cur = map.get(acc.id) ?? { name: displayAccountName(acc), amount: 0, parts: [] as number[] };
    cur.amount += amt;
    cur.parts.push(Math.round(amt));
    map.set(acc.id, cur);
  };

  for (const vid of voucherIds) {
    const lines = linesByVoucher.get(vid) ?? [];
    const narration = one<any>(lines[0]?.journal_vouchers)?.narration ?? "";

    const cashLines = lines.filter((l) => l.account_id === cashId);
    const srcLines = lines.filter((l) => sourceIds.has(l.account_id));
    const otherLines = lines.filter((l) => !poolIds.has(l.account_id));

    const srcCredit = srcLines.find((l) => num(l.credit) > 0); // ব্যাংক/জাফর টাকা দিয়েছে
    const srcDebit = srcLines.find((l) => num(l.debit) > 0); // ব্যাংক/জাফর টাকা পেয়েছে
    const cashDebit = cashLines.find((l) => num(l.debit) > 0);
    const cashCredit = cashLines.find((l) => num(l.credit) > 0);

    if (otherLines.length === 0) {
      // শুধু pool↔source ট্রান্সফার (যেমন "Debt From MD": Dr 1000 / Cr 3000)
      if (cashDebit && srcCredit) addAgg(jamaAgg, byId.get(srcCredit.account_id)!, num(cashDebit.debit));
      else if (cashCredit && srcDebit) addAgg(khorochAgg, byId.get(srcDebit.account_id)!, num(cashCredit.credit));
      continue;
    }

    for (const o of otherLines) {
      const acc = byId.get(o.account_id)!;
      const dr = num(o.debit);
      const cr = num(o.credit);
      const subNote = (o.memo ?? "").trim();
      if (dr > 0) {
        // টাকা `other`-এ খরচ হয়েছে → খরচ কলাম (খাত অনুযায়ী গ্রুপ)
        const head = khorochByHead.get(o.account_id) ?? { name: displayAccountName(acc), amount: 0, notes: [], parts: [] };
        head.amount += dr;
        head.parts.push(Math.round(dr));
        if (subNote && subNote !== head.name && !head.notes.includes(subNote)) head.notes.push(subNote);
        khorochByHead.set(o.account_id, head);
        if (srcCredit) addAgg(jamaAgg, byId.get(srcCredit.account_id)!, dr);
      } else if (cr > 0) {
        // `other` কমেছে / income → টাকা এসেছে → জমা কলাম (per-line)
        jama.push({ name: contraLabel(acc, vid, narration), note: dollarNote(narration), amount: cr });
        if (srcDebit) addAgg(khorochAgg, byId.get(srcDebit.account_id)!, cr);
      }
    }
  }

  // খাতার মতো: গ্রুপিং ছাড়া, "+"-জোড়া (যেমন 155000+200000+45000)
  const partsNote = (parts: number[]) => (parts.length > 1 ? parts.map((p) => String(p)).join("+") : "");
  const khoroch: DbRow[] = [];
  for (const h of khorochByHead.values()) {
    const note = h.notes.length ? h.notes.join(" + ") : partsNote(h.parts);
    khoroch.push({ name: h.name, note, amount: h.amount });
  }
  for (const a of jamaAgg.values()) jama.push({ name: a.name, note: partsNote(a.parts), amount: a.amount });
  for (const a of khorochAgg.values()) khoroch.push({ name: a.name, note: partsNote(a.parts), amount: a.amount });

  // ── Sales invoices (বিক্রি ব্লক + "বিল" + AR + sold Lbs) ──
  const { data: invoicesRaw } = await supabase
    .from("sales_invoices")
    .select("customer_id, invoice_date, payment_type, customers(name), sales_invoice_items(amount, required_lbs, bookings(required_lbs))")
    .lte("invoice_date", to);
  const invoices = (invoicesRaw ?? []) as any[];

  const invAmt = (inv: any) => (inv.sales_invoice_items ?? []).reduce((s: number, i: any) => s + num(i.amount), 0);
  const invLbs = (inv: any) =>
    (inv.sales_invoice_items ?? []).reduce((s: number, i: any) => {
      const bk = one<any>(i.bookings);
      return s + num(i.required_lbs ?? bk?.required_lbs ?? 0);
    }, 0);

  const bikriByCust = new Map<string, { name: string; lbs: number; amount: number }>();
  let bikriLbs = 0;
  let bikriAmount = 0;
  let soldLbsBefore = 0;
  let arInvBefore = 0;
  let arInvRange = 0;
  for (const inv of invoices) {
    const d = inv.invoice_date ?? "";
    const amt = invAmt(inv);
    const lbs = invLbs(inv);
    const isCredit = inv.payment_type !== "cash";
    if (d < from) {
      soldLbsBefore += lbs;
      if (isCredit) arInvBefore += amt;
    } else if (d <= to) {
      if (isCredit) arInvRange += amt;
      const name = one<any>(inv.customers)?.name ?? "কাস্টমার";
      const cur = bikriByCust.get(inv.customer_id) ?? { name, lbs: 0, amount: 0 };
      cur.lbs += lbs;
      cur.amount += amt;
      bikriByCust.set(inv.customer_id, cur);
      bikriLbs += lbs;
      bikriAmount += amt;
    }
  }
  const bikri = [...bikriByCust.values()].sort((a, b) => b.amount - a.amount);
  // "বিল" লাইন — খরচ কলামে (বিক্রির সমান, reconcile-এ কাটাকাটি হয়)
  for (const b of bikri) khoroch.push({ name: b.name, note: "বিল", amount: b.amount });

  // ── Customer payments (পার্টি জমা + AR) ──
  const custPays = (custPaysRaw ?? []) as any[];
  let partyJamaBefore = 0;
  let arPartyJama = 0;
  for (const p of custPays) {
    const d = p.payment_date ?? "";
    if (d < from) partyJamaBefore += num(p.amount);
    else if (d <= to) arPartyJama += num(p.amount);
  }

  const { data: customersRaw } = await supabase.from("customers").select("opening_balance");
  const arOpeningBase = (customersRaw ?? []).reduce((s: number, c: any) => s + num(c.opening_balance), 0);
  const arOpening = arOpeningBase + arInvBefore - partyJamaBefore;
  const arBikri = arInvRange;
  const arClosing = arOpening + arBikri - arPartyJama;

  // ── Raw material stock ব্লক ──
  const { data: purchRaw } = await supabase
    .from("purchase_entries")
    .select("entry_date, purchase_entry_items(quantity_lbs)")
    .lte("entry_date", to);
  let purchBefore = 0;
  let stockPurchaseLbs = 0;
  for (const pe of (purchRaw ?? []) as any[]) {
    const lbs = (pe.purchase_entry_items ?? []).reduce((s: number, i: any) => s + num(i.quantity_lbs), 0);
    if ((pe.entry_date ?? "") < from) purchBefore += lbs;
    else if ((pe.entry_date ?? "") <= to) stockPurchaseLbs += lbs;
  }

  // opening anchor = ERP opening-inventory (stock_ledger manual_adjustment net)
  const { data: ledgerRaw } = await supabase
    .from("stock_ledger")
    .select("txn_type, quantity, reference_type")
    .eq("item_type", "raw_material")
    .eq("reference_type", "manual_adjustment");
  const stockAnchor = (ledgerRaw ?? []).reduce(
    (s: number, e: any) => s + (e.txn_type === "in" ? num(e.quantity) : -num(e.quantity)),
    0,
  );

  const stockOpening = stockAnchor + purchBefore - soldLbsBefore;
  const stockSoldLbs = bikriLbs;
  const stockClosing = stockOpening + stockPurchaseLbs - stockSoldLbs;

  // ── সাইড / বটম সিলিং (ঐ দিনে cutting-সম্পন্ন pcs) ──
  const { data: prodRaw } = await supabase
    .from("production_orders")
    .select("cutting_completed_at, cutting_produced_pcs, quantity_pcs, bookings(measurement_type)")
    .not("cutting_completed_at", "is", null)
    .gte("cutting_completed_at", from)
    .lt("cutting_completed_at", to + "T23:59:59.999");
  let sideSealPcs = 0;
  let bottomSealPcs = 0;
  for (const o of (prodRaw ?? []) as any[]) {
    const mtype = one<any>(o.bookings)?.measurement_type ?? "";
    const pcs = num(o.cutting_produced_pcs) || num(o.quantity_pcs);
    if (BOTTOM_SEAL_MTYPES.has(mtype)) bottomSealPcs += pcs;
    else sideSealPcs += pcs;
  }

  // ── Totals ──
  const jamaTotal = jama.reduce((s, r) => s + r.amount, 0);
  const khorochTotal = khoroch.reduce((s, r) => s + r.amount, 0);
  const cashPosition = priorCash + jamaTotal + bikriAmount - khorochTotal;

  return {
    fromDate: from,
    toDate: to,
    singleDay: from === to,
    jama: jama.sort((a, b) => b.amount - a.amount),
    jamaTotal,
    khoroch: khoroch.sort((a, b) => b.amount - a.amount),
    khorochTotal,
    bikri,
    bikriLbs,
    bikriAmount,
    priorCash,
    cashPosition,
    stockOpening,
    stockPurchaseLbs,
    stockSoldLbs,
    stockClosing,
    sideSealPcs,
    bottomSealPcs,
    arOpening,
    arBikri,
    arPartyJama,
    arClosing,
  };
}
