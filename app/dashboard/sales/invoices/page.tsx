import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import InvoicesTable from "./InvoicesTable";
import { AT_DEFAULT_MARKUP_PERCENTAGE, calcAtCustomerLine } from "@/lib/atCommission";

export default async function SalesInvoiceListPage() {
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("sales_invoices")
    .select(`*, customers(name, code), creator:app_users!sales_invoices_created_by_fkey(full_name),
      sales_invoice_items(quantity_pcs, unit_price, amount,
        bookings(booking_no, required_lbs, buyer_id))`)
    .order("invoice_date", { ascending: false });

  // AT Accessories (customer code "AT") — নাম বদলালেও যেন feature কাজ করে তাই code-এ ম্যাচ করা হয়।
  // "Submit to Customer" টোটাল − আসল টোটাল = Commission; Proforma Invoice-এর সাথে মেলানোর জন্য লিস্টেই দেখাই।
  const buyerIds = Array.from(
    new Set(
      (invoices ?? [])
        .flatMap((inv: any) => inv.sales_invoice_items ?? [])
        .map((i: any) => i.bookings?.buyer_id)
        .filter(Boolean)
    )
  ) as string[];
  const { data: buyers } = buyerIds.length
    ? await supabase.from("buyers").select("id, markup_percentage").in("id", buyerIds)
    : { data: [] };
  const markupMap: Record<string, number> = {};
  (buyers ?? []).forEach((b: any) => (markupMap[b.id] = b.markup_percentage ?? AT_DEFAULT_MARKUP_PERCENTAGE));

  const invoicesWithCommission = (invoices ?? []).map((inv: any) => {
    if (inv.customers?.code !== "AT") return { ...inv, commission: null };

    let realTotal = 0;
    let customerTotal = 0;
    for (const item of inv.sales_invoice_items ?? []) {
      const actualPrice = item.unit_price || 0;
      const qty = item.quantity_pcs || 0;
      realTotal += item.amount || 0;
      const orderLbs = item.bookings?.required_lbs || 0;
      const markupPct = item.bookings?.buyer_id ? (markupMap[item.bookings.buyer_id] ?? AT_DEFAULT_MARKUP_PERCENTAGE) : AT_DEFAULT_MARKUP_PERCENTAGE;
      const { customerAmount } = calcAtCustomerLine(actualPrice, qty, orderLbs, markupPct);
      customerTotal += customerAmount;
    }
    return { ...inv, commission: customerTotal - realTotal };
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Sales Invoices</h1>
        <Link href="/dashboard/sales/invoices/new" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">+ নতুন Sales Invoice</Link>
      </div>

      <InvoicesTable invoices={invoicesWithCommission} />
    </div>
  );
}
