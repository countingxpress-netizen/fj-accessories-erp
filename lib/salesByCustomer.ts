// "Sales by Customer" রিপোর্টের শেয়ার্ড লজিক — Dashboard widget ও Reports পেজ দুটোই ব্যবহার করে।
//
//   Production LBS = ইনভয়েস লাইনের Required Lbs-এর যোগফল
//                    (LBS invoice হলে item.required_lbs, নইলে booking.required_lbs)।
//   Sales Amount   = Σ sales_invoice_items.amount (standard / lbs / other — সব ধরনের invoice)।
//   গ্রুপভুক্ত কাস্টমার এক পার্টি হিসেবে যোগ হয় (Outstanding / Commission রিপোর্টের মতো)।

import { type GroupMap, displayEntity } from "@/lib/customerGroups";

export type SalesByCustomerRow = {
  key: string;
  id: string;
  name: string;
  isGroup: boolean;
  amount: number;
  lbs: number;
  count: number;
};

// Supabase-এর জেনারেটেড টাইপে নেস্টেড embed কখনো array, কখনো object আসে —
// তাই ইনপুট আলগা (any) রেখে ভেতরে normalize করা হয় (কোডবেসের বাকি রিপোর্টের মতো)।
type InvoiceRow = {
  customer_id: string;
  sales_invoice_items?:
    | {
        amount?: number | null;
        required_lbs?: number | null;
        bookings?: { required_lbs?: number | null } | { required_lbs?: number | null }[] | null;
      }[]
    | null;
};

/** ইনভয়েস রো-গুলোকে কাস্টমার/গ্রুপ-ভিত্তিক সারিতে ভাঁজ করে (unsorted)। */
export function aggregateSalesByCustomer(
  invoices: InvoiceRow[],
  customers: { id: string; name: string }[],
  groupMap: GroupMap,
): SalesByCustomerRow[] {
  const perCust: Record<string, { amount: number; lbs: number; count: number }> = {};
  invoices.forEach((inv) => {
    const items = inv.sales_invoice_items ?? [];
    const amount = items.reduce((s, i) => s + (i.amount || 0), 0);
    const lbs = items.reduce((s, i) => {
      const bk = Array.isArray(i.bookings) ? i.bookings[0] : i.bookings;
      return s + (i.required_lbs ?? bk?.required_lbs ?? 0);
    }, 0);
    const c = (perCust[inv.customer_id] ??= { amount: 0, lbs: 0, count: 0 });
    c.amount += amount;
    c.lbs += lbs;
    c.count += 1;
  });

  const byKey: Record<string, SalesByCustomerRow> = {};
  customers.forEach((cust) => {
    const src = perCust[cust.id];
    if (!src) return;
    const e = displayEntity(groupMap, cust.id, cust.name);
    const a = (byKey[e.key] ??= { key: e.key, id: e.id, name: e.name, isGroup: e.isGroup, amount: 0, lbs: 0, count: 0 });
    a.amount += src.amount;
    a.lbs += src.lbs;
    a.count += src.count;
  });

  return Object.values(byKey);
}

/** কাস্টমার তালিকা থেকে ফিল্টার ড্রপডাউনের অপশন (গ্রুপ = এক এন্ট্রি), নাম অনুসারে সাজানো। */
export function salesEntityOptions(
  customers: { id: string; name: string }[],
  groupMap: GroupMap,
): { key: string; name: string }[] {
  const seen = new Set<string>();
  const opts: { key: string; name: string }[] = [];
  customers.forEach((c) => {
    const e = displayEntity(groupMap, c.id, c.name);
    if (seen.has(e.key)) return;
    seen.add(e.key);
    opts.push({ key: e.key, name: e.name });
  });
  return opts.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Date range presets ─────────────────────────────────────────────────────
export const SALES_RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: "today", label: "আজ (Today)" },
  { value: "this_month", label: "চলতি মাস (This Month)" },
  { value: "previous_month", label: "গত মাস (Previous Month)" },
  { value: "this_year", label: "চলতি বছর (This Year)" },
  { value: "previous_year", label: "গত বছর (Previous Year)" },
  { value: "all", label: "সব সময় (All Time)" },
  { value: "custom", label: "নির্দিষ্ট তারিখ (Custom)" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();

/** Asia/Dhaka টাইমজোনে আজকের তারিখ (YYYY-MM-DD) — Vercel UTC হলেও ঠিক থাকে। */
export function todayDhaka(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

export function resolveSalesRange(
  range: string | undefined,
  customFrom?: string,
  customTo?: string,
): { from?: string; to?: string } {
  const [y, m] = todayDhaka().split("-").map(Number);
  const today = todayDhaka();
  switch (range) {
    case "today":
      return { from: today, to: today };
    case "this_month":
      return { from: iso(y, m, 1), to: iso(y, m, daysInMonth(y, m)) };
    case "previous_month": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: iso(py, pm, 1), to: iso(py, pm, daysInMonth(py, pm)) };
    }
    case "this_year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "previous_year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case "custom":
      return { from: customFrom || undefined, to: customTo || undefined };
    default:
      return {};
  }
}
