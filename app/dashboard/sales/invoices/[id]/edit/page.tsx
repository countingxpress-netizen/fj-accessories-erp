import { createClient } from "@/lib/supabase/server";
import EditInvoiceForm from "./EditInvoiceForm";
import EditOtherInvoiceForm from "./EditOtherInvoiceForm";
import { notFound } from "next/navigation";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase.from("sales_invoices").select("*, customers(name)").eq("id", id).single();
  if (!invoice) return notFound();

  // LBS Invoice-এর লাইন booking থেকে অটো হয় — এখানে qty/price এডিট করলে ভেঙে যাবে।
  if (invoice.invoice_type === "lbs") {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold mb-4">Sales Invoice — {invoice.invoice_no}</h1>
        <div className="rounded-xl border bg-amber-50 border-amber-200 p-5 text-sm text-amber-900 space-y-2">
          <p className="font-medium">এটা একটা LBS Invoice ({invoice.customers?.name})।</p>
          <p>এর লাইন ও চার্জ (Powder / Making Cutting / Printing / Adhesive) সংশ্লিষ্ট Booking group থেকে অটো তৈরি হয়। এখান থেকে এডিট করা যায় না।</p>
          <p>পরিবর্তন দরকার হলে Booking group এডিট করুন — Invoice ও Journal Voucher নিজে থেকেই আপডেট হবে। Rate বদলাতে Customer-এর Price/Lbs (History) বা Making-Cutting Rate ঠিক করুন।</p>
          <a href={`/dashboard/sales/invoices/${id}/print-lbs`} target="_blank" className="inline-block mt-1 text-purple-700 underline">Invoice দেখুন →</a>
        </div>
      </div>
    );
  }

  // Other Sales Invoice — booking নেই, লাইন = বিবরণ + পরিমাণ + রেট (সব editable)
  if (invoice.invoice_type === "other") {
    const { data: otherItems } = await supabase
      .from("sales_invoice_items")
      .select("id, line_label, quantity_pcs, unit_price")
      .eq("invoice_id", id);

    const otherLines = (otherItems ?? []).map((it: any) => ({
      id: it.id,
      description: it.line_label ?? "",
      quantity_pcs: Number(it.quantity_pcs) || 0,
      unit_price: Number(it.unit_price) || 0,
    }));

    return (
      <div>
        <h1 className="text-2xl font-semibold mb-4">Other Sales Invoice এডিট করুন — {invoice.invoice_no}</h1>
        <EditOtherInvoiceForm
          invoiceId={id}
          customerName={invoice.customers?.name ?? "-"}
          initialDate={invoice.invoice_date}
          initialPaymentReceived={!!invoice.payment_received}
          voucherId={invoice.voucher_id}
          lines={otherLines}
        />
      </div>
    );
  }

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