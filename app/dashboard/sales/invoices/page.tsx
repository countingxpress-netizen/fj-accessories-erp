import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import InvoicesTable from "./InvoicesTable";
import { AT_DEFAULT_MARKUP_PERCENTAGE } from "@/lib/atCommission";
import { calcInvoiceCommission } from "@/lib/commission";

export default async function SalesInvoiceListPage() {
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("sales_invoices")
    .select(`*, customers(name, code, commission_enabled, commission_percentage), creator:app_users!sales_invoices_created_by_fkey(full_name),
      sales_invoice_items(quantity_pcs, unit_price, amount,
        bookings(booking_no, required_lbs, buyer_id))`)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });

  // Commission — শুধু রিপোর্টিং। AT (code "AT") → markup+freight; বাকি commission_enabled → Total × %।
  // Final = হিসাবি + commission_adjustment (Commission Report পেজ থেকে হাতে দেওয়া)।
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
    // Other Sales Invoice (scrap/charge বিক্রি) commission হিসাবের বাইরে
    if (inv.invoice_type === "other") return { ...inv, commission: null };
    const items = (inv.sales_invoice_items ?? []).map((item: any) => ({
      unit_price: item.unit_price || 0,
      quantity_pcs: item.quantity_pcs || 0,
      amount: item.amount || 0,
      order_lbs: item.bookings?.required_lbs || 0,
      markup_pct: item.bookings?.buyer_id ? (markupMap[item.bookings.buyer_id] ?? AT_DEFAULT_MARKUP_PERCENTAGE) : AT_DEFAULT_MARKUP_PERCENTAGE,
    }));
    const calc = calcInvoiceCommission(
      inv.customers?.code ?? null,
      !!inv.customers?.commission_enabled,
      Number(inv.customers?.commission_percentage ?? 1),
      items,
    );
    const commission = calc == null ? null : calc + Number(inv.commission_adjustment || 0);
    return { ...inv, commission };
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Sales Invoices</h1>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/sales/invoices/new" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">+ নতুন Sales Invoice</Link>
          <Link href="/dashboard/sales/invoices/new-other" className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">+ Other Invoice</Link>
        </div>
      </div>

      <InvoicesTable invoices={invoicesWithCommission} />
    </div>
  );
}
