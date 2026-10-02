// "Sales by Customer" রিপোর্টের শেয়ার্ড লজিক — Dashboard widget ও Reports পেজ দুটোই ব্যবহার করে।
//
//   Production LBS = ইনভয়েসে খাতার Lbs (sales_invoices.daybook_lbs) থাকলে সেটা, নইলে লাইনের Required Lbs-এর যোগফল
//                    (LBS invoice হলে item.required_lbs, নইলে booking.required_lbs)
//                    + কোনো কাস্টমারের নামে থাকা Raw Material সরাসরি বিক্রির quantity_lbs।
//   Sales Amount   = Σ sales_invoice_items.amount (standard / lbs / other — সব ধরনের invoice)
//                    + কাস্টমারের নামে Raw Material সরাসরি বিক্রি (lib/rawMaterialSale.ts)।
//                    Account-পার্টির (customer না) Raw Material বিক্রি এখানে ধরা হয় না —
//                    এই রিপোর্ট কাস্টমার-ভিত্তিক।
//   গ্রুপভুক্ত কাস্টমার এক পার্টি হিসেবে যোগ হয় (Outstanding / Commission রিপোর্টের মতো)।

import { type GroupMap, displayEntity } from "@/lib/customerGroups";
import { DATE_PRESET_OPTIONS, ALL_TIME_OPTION, resolveDatePreset } from "@/lib/datePresets";

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
  daybook_lbs?: number | null;
  sales_invoice_items?:
    | {
        amount?: number | null;
        required_lbs?: number | null;
        bookings?: { required_lbs?: number | null } | { required_lbs?: number | null }[] | null;
      }[]
    | null;
};

export type RawMaterialSaleRow = {
  customer_id: string | null;
  amount?: number | null;
  quantity_lbs?: number | null;
};

/** ইনভয়েস রো-গুলোকে কাস্টমার/গ্রুপ-ভিত্তিক সারিতে ভাঁজ করে (unsorted)। */
export function aggregateSalesByCustomer(
  invoices: InvoiceRow[],
  customers: { id: string; name: string }[],
  groupMap: GroupMap,
  rawMaterialSales: RawMaterialSaleRow[] = [],
): SalesByCustomerRow[] {
  const perCust: Record<string, { amount: number; lbs: number; count: number }> = {};
  invoices.forEach((inv) => {
    const items = inv.sales_invoice_items ?? [];
    const amount = items.reduce((s, i) => s + (i.amount || 0), 0);
    const lbs = inv.daybook_lbs != null ? Number(inv.daybook_lbs) : items.reduce((s, i) => {
      const bk = Array.isArray(i.bookings) ? i.bookings[0] : i.bookings;
      return s + (i.required_lbs ?? bk?.required_lbs ?? 0);
    }, 0);
    const c = (perCust[inv.customer_id] ??= { amount: 0, lbs: 0, count: 0 });
    c.amount += amount;
    c.lbs += lbs;
    c.count += 1;
  });
  rawMaterialSales.forEach((r) => {
    if (!r.customer_id) return; // শুধু customer-এর নামে বিক্রি — account-পার্টি এখানে না
    const c = (perCust[r.customer_id] ??= { amount: 0, lbs: 0, count: 0 });
    c.amount += r.amount || 0;
    c.lbs += r.quantity_lbs || 0;
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
// সব রিপোর্টের মতো একই তালিকা (lib/datePresets.ts) + All Time।
export const SALES_RANGE_OPTIONS: { value: string; label: string }[] = [...DATE_PRESET_OPTIONS, ALL_TIME_OPTION];

/** Asia/Dhaka টাইমজোনে আজকের তারিখ (YYYY-MM-DD) — Vercel UTC হলেও ঠিক থাকে। */
export function todayDhaka(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

export function resolveSalesRange(
  range: string | undefined,
  customFrom?: string,
  customTo?: string,
): { from?: string; to?: string } {
  // range না থাকলে All Time (আগের আচরণ); কলার-রা সাধারণত "this_month" ডিফল্ট পাঠায়
  const r = resolveDatePreset(range ?? "all", customFrom, customTo);
  return { from: r.from || undefined, to: r.to || undefined };
}
