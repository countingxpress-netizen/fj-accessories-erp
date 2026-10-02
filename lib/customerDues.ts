import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/fetchAll";
import { adjustmentSigned } from "@/lib/customerAdjustment";

// কাস্টমার-ভিত্তিক বাকি (নির্দিষ্ট তারিখ পর্যন্ত) — Outstanding রিপোর্ট ও মাসিক টপশীট দুটোই ব্যবহার করে।
//   + Opening Balance (তারিখ asOf-এর পরে হলে বাদ)
//   + বাকিতে Sales Invoice (নগদ বাদ)
//   + বাকিতে Wastage / Raw Material বিক্রি (payment_received = false)
//   − Payment Received
//   ± কাস্টমার এডজাস্টমেন্ট
// asOf না দিলে আজ পর্যন্ত সব লেনদেন।

export async function computeCustomerDues(
  supabase: SupabaseClient,
  asOf?: string | null,
): Promise<{ customers: { id: string; name: string }[]; due: Record<string, number> }> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const upTo = (col: string) => (q: any) => (asOf ? q.lte(col, asOf) : q);

  const [
    { data: customers },
    invoices,
    customerPayments,
    wastageSales,
    rawMaterialSales,
    customerAdjustments,
  ] = await Promise.all([
    supabase.from("customers").select("id, name, opening_balance, opening_balance_date"),
    fetchAllRows<any>(supabase, "sales_invoices", "customer_id, payment_type, sales_invoice_items(amount)", upTo("invoice_date")),
    fetchAllRows<any>(supabase, "customer_payments", "customer_id, amount", upTo("payment_date")),
    fetchAllRows<any>(supabase, "wastage_sales", "customer_id, amount, payment_received", (q) => upTo("sale_date")(q.not("customer_id", "is", null))),
    fetchAllRows<any>(supabase, "raw_material_sales", "customer_id, amount, payment_received", (q) => upTo("sale_date")(q.not("customer_id", "is", null))),
    fetchAllRows<any>(supabase, "customer_adjustments", "customer_id, direction, amount", upTo("adj_date")),
  ]);

  const due: Record<string, number> = {};
  (customers ?? []).forEach((c: any) => {
    // Opening Balance-এর তারিখ বাছাই করা তারিখের পরে হলে তখনো বাকি ছিল না
    if (asOf && c.opening_balance_date && c.opening_balance_date > asOf) return;
    if (c.opening_balance) due[c.id] = (due[c.id] ?? 0) + c.opening_balance;
  });
  invoices.forEach((inv: any) => {
    if (inv.payment_type === "cash") return; // নগদ বিক্রি বাকি বাড়ায় না
    const amt = (inv.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
    due[inv.customer_id] = (due[inv.customer_id] ?? 0) + amt;
  });
  // বাকিতে (payment_received = false) করা Wastage/Raw Material বিক্রিও কাস্টমারের বাকিতে যোগ —
  // নগদগুলো বাদ (সেগুলো আসলে 1100 AR ছোঁয়ইনি)।
  wastageSales.forEach((w: any) => {
    if (w.payment_received) return;
    due[w.customer_id] = (due[w.customer_id] ?? 0) + Number(w.amount || 0);
  });
  rawMaterialSales.forEach((r: any) => {
    if (r.payment_received) return;
    due[r.customer_id] = (due[r.customer_id] ?? 0) + Number(r.amount || 0);
  });
  customerPayments.forEach((p: any) => {
    due[p.customer_id] = (due[p.customer_id] ?? 0) - p.amount;
  });
  // কাস্টমার এডজাস্টমেন্ট — "বাকিতে যোগ" +, "বাকি কমানো" −
  customerAdjustments.forEach((a: any) => {
    due[a.customer_id] = (due[a.customer_id] ?? 0) + adjustmentSigned(a);
  });

  return {
    customers: (customers ?? []).map((c: any) => ({ id: c.id, name: c.name })),
    due,
  };
}
