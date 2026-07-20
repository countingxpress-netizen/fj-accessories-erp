import { createClient } from "@/lib/supabase/server";
import EditInvoiceForm from "./EditInvoiceForm";
import { notFound } from "next/navigation";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase.from("sales_invoices").select("*, customers(name)").eq("id", id).single();
  if (!invoice) return notFound();

  const { data: items } = await supabase
    .from("sales_invoice_items")
    .select("*, bookings(booking_no, quantity_pcs), finished_goods(product_name)")
    .eq("invoice_id", id);

  // প্রতিটা booking-এর জন্য এই invoice ছাড়া বাকি ইনভয়েসে কত হয়েছে বের করুন
  const bookingIds = (items ?? []).map((it: any) => it.booking_id).filter(Boolean);
  const { data: otherItems } = bookingIds.length
    ? await supabase.from("sales_invoice_items").select("booking_id, quantity_pcs, invoice_id").in("booking_id", bookingIds)
    : { data: [] };

  const otherInvoicedMap: Record<string, number> = {};
  (otherItems ?? []).forEach((oi: any) => {
    if (oi.invoice_id === id) return; // এই ইনভয়েসের নিজের এন্ট্রি বাদ
    otherInvoicedMap[oi.booking_id] = (otherInvoicedMap[oi.booking_id] ?? 0) + oi.quantity_pcs;
  });

  const lines = (items ?? []).map((it: any) => ({
    id: it.id, booking_id: it.booking_id, product_id: it.product_id,
    quantity_pcs: it.quantity_pcs, unit_price: it.unit_price,
    booking_no: it.bookings?.booking_no ?? "-", product_name: it.finished_goods?.product_name ?? "-",
    maxQty: (it.bookings?.quantity_pcs ?? 0) - (otherInvoicedMap[it.booking_id] ?? 0),
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Sales Invoice এডিট করুন — {invoice.invoice_no}</h1>
      <EditInvoiceForm
        invoiceId={id} customerId={invoice.customer_id} customerName={invoice.customers?.name ?? "-"}
        initialDate={invoice.invoice_date} voucherId={invoice.voucher_id} lines={lines}
      />
    </div>
  );
}