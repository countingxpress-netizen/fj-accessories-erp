import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/fetchAll";

// Customer Payment Received — কাস্টমারের "বকেয়া" তালিকা (যার বিপরীতে টাকা allocate করা যায়):
//   Opening Balance + Sales Invoice + Raw Material সরাসরি বিক্রি (বাকি) + Wastage বিক্রি (বাকি)
//   + কাস্টমার এডজাস্টমেন্ট ("বাকিতে যোগ" ধরনের)।
// নগদে বিক্রি (payment_received=true) বকেয়া নয়, তাই আসে না। New ও Edit দুই ফর্মই এটা ব্যবহার করে।
//
// allocation key (ফর্মের state-এ, payment_allocations-এর কোন column-এ যাবে):
//   "opening"      → সব target NULL (Opening Balance)
//   "<invoice id>" → invoice_id            (পুরনো ফরম্যাট — প্লেইন uuid)
//   "rms:<id>"     → raw_material_sale_id
//   "ws:<id>"      → wastage_sale_id
//   "adj:<id>"     → customer_adjustment_id

export type DueItem = {
  id: string;            // allocation key
  invoice_no: string;    // দেখানোর লেবেল
  invoice_date: string;
  total: number;
  due: number;
  isOpening?: boolean;
};

type AllocRow = {
  invoice_id: string | null;
  raw_material_sale_id: string | null;
  wastage_sale_id: string | null;
  customer_adjustment_id: string | null;
  amount: number;
  payment_id: string;
  customer_payments: { customer_id: string } | { customer_id: string }[] | null;
};

type AllocTargetCols = {
  invoice_id: string | null;
  raw_material_sale_id: string | null;
  wastage_sale_id: string | null;
  customer_adjustment_id: string | null;
};

export function allocationKey(a: Partial<AllocTargetCols>): string {
  if (a.invoice_id) return a.invoice_id;
  if (a.raw_material_sale_id) return `rms:${a.raw_material_sale_id}`;
  if (a.wastage_sale_id) return `ws:${a.wastage_sale_id}`;
  if (a.customer_adjustment_id) return `adj:${a.customer_adjustment_id}`;
  return "opening";
}

export function allocationTarget(key: string): AllocTargetCols {
  const none: AllocTargetCols = { invoice_id: null, raw_material_sale_id: null, wastage_sale_id: null, customer_adjustment_id: null };
  if (key === "opening") return none;
  if (key.startsWith("rms:")) return { ...none, raw_material_sale_id: key.slice(4) };
  if (key.startsWith("ws:")) return { ...none, wastage_sale_id: key.slice(3) };
  if (key.startsWith("adj:")) return { ...none, customer_adjustment_id: key.slice(4) };
  return { ...none, invoice_id: key };
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/**
 * customerId দিলে শুধু সেই কাস্টমার; excludePaymentId দিলে সেই payment-এর allocation বাদ দিয়ে due
 * (Edit-এ — নিজের allocation ফিরিয়ে দিলে কত বাকি); keepKeys-এর item due 0 হলেও তালিকায় থাকে
 * (Edit-এ আগে allocate করা লাইন যেন হারিয়ে না যায়)।
 */
export async function loadCustomerDues(
  supabase: SupabaseClient,
  opts: { customerId?: string; excludePaymentId?: string; keepKeys?: Set<string> } = {},
): Promise<Record<string, DueItem[]>> {
  const { customerId, excludePaymentId, keepKeys } = opts;
  const byCustomer = (q: any) => (customerId ? q.eq("customer_id", customerId) : q);

  const [customers, invoices, rmSales, wSales, adjs, allocs] = await Promise.all([
    fetchAllRows<any>(supabase, "customers", "id, opening_balance, opening_balance_date", (q) => (customerId ? q.eq("id", customerId) : q)),
    fetchAllRows<any>(supabase, "sales_invoices", "id, invoice_no, invoice_date, customer_id, sales_invoice_items(amount)", byCustomer),
    fetchAllRows<any>(supabase, "raw_material_sales", "id, sale_no, sale_date, customer_id, amount",
      (q) => byCustomer(q.not("customer_id", "is", null).eq("payment_received", false))),
    fetchAllRows<any>(supabase, "wastage_sales", "id, sale_no, sale_date, customer_id, amount",
      (q) => byCustomer(q.not("customer_id", "is", null).eq("payment_received", false))),
    fetchAllRows<any>(supabase, "customer_adjustments", "id, adj_no, adj_date, customer_id, amount, note",
      (q) => byCustomer(q.eq("direction", "debit"))),
    fetchAllRows<AllocRow>(supabase, "payment_allocations",
      "invoice_id, raw_material_sale_id, wastage_sale_id, customer_adjustment_id, amount, payment_id, customer_payments(customer_id)",
      (q) => (excludePaymentId ? q.neq("payment_id", excludePaymentId) : q)),
  ]);

  const allocatedByKey: Record<string, number> = {};
  const openingPaidByCustomer: Record<string, number> = {};
  for (const a of allocs) {
    const key = allocationKey(a);
    if (key === "opening") {
      const cid = one(a.customer_payments)?.customer_id;
      if (cid) openingPaidByCustomer[cid] = (openingPaidByCustomer[cid] ?? 0) + Number(a.amount || 0);
    } else {
      allocatedByKey[key] = (allocatedByKey[key] ?? 0) + Number(a.amount || 0);
    }
  }

  const out: Record<string, DueItem[]> = {};
  const push = (cid: string, item: DueItem) => {
    if (item.due > 0.01 || keepKeys?.has(item.id)) (out[cid] ??= []).push(item);
  };

  for (const c of customers) {
    const total = Number(c.opening_balance || 0);
    if (total === 0 && !keepKeys?.has("opening")) continue;
    push(c.id, {
      id: "opening", invoice_no: "Opening Balance (পূর্বের বাকি)",
      invoice_date: c.opening_balance_date ?? "2000-01-01",
      total, due: total - (openingPaidByCustomer[c.id] ?? 0), isOpening: true,
    });
  }
  for (const inv of invoices) {
    const total = (inv.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
    push(inv.customer_id, { id: inv.id, invoice_no: inv.invoice_no, invoice_date: inv.invoice_date, total, due: total - (allocatedByKey[inv.id] ?? 0) });
  }
  for (const s of rmSales) {
    const key = `rms:${s.id}`;
    const total = Number(s.amount || 0);
    push(s.customer_id, { id: key, invoice_no: `${s.sale_no} (কাঁচামাল বিক্রি)`, invoice_date: s.sale_date, total, due: total - (allocatedByKey[key] ?? 0) });
  }
  for (const s of wSales) {
    const key = `ws:${s.id}`;
    const total = Number(s.amount || 0);
    push(s.customer_id, { id: key, invoice_no: `${s.sale_no} (ওয়েস্টেজ বিক্রি)`, invoice_date: s.sale_date, total, due: total - (allocatedByKey[key] ?? 0) });
  }

  for (const a of adjs) {
    const key = `adj:${a.id}`;
    const total = Number(a.amount || 0);
    push(a.customer_id, { id: key, invoice_no: `${a.adj_no} (এডজাস্টমেন্ট${a.note ? ` — ${a.note}` : ""})`, invoice_date: a.adj_date, total, due: total - (allocatedByKey[key] ?? 0) });
  }

  for (const cid of Object.keys(out)) {
    out[cid].sort((a, b) => {
      if (a.isOpening) return -1;
      if (b.isOpening) return 1;
      return a.invoice_date.localeCompare(b.invoice_date);
    });
  }
  return out;
}
