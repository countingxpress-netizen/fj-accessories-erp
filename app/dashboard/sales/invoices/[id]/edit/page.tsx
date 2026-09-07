import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SalesInvoiceForm, { type EditInvoiceCtx } from "../../new/SalesInvoiceForm";
import EditOtherInvoiceForm from "./EditOtherInvoiceForm";
import { notFound } from "next/navigation";
import { resolveRate } from "@/lib/rateHistory";
import { calcQuotedUnitPrice } from "@/lib/calcTubeCutting";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("sales_invoices")
    .select("*, customers(name)")
    .eq("id", id)
    .single();
  if (!invoice) return notFound();

  // ── Other Sales Invoice — নিজস্ব লাইন এডিটর ─────────────────────────────
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

  // ── Auto-generated invoice — Booking থেকে অটো, এখানে এডিট হয় না ──────────
  if (invoice.auto_generated) {
    let bookingEditId: string | null = null;
    if (invoice.source_booking_group_id) {
      const { data: gb } = await supabase
        .from("bookings").select("id").eq("booking_group_id", invoice.source_booking_group_id)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      bookingEditId = gb?.id ?? null;
    }
    if (!bookingEditId) {
      const { data: it } = await supabase
        .from("sales_invoice_items").select("booking_id").eq("invoice_id", id).not("booking_id", "is", null).limit(1).maybeSingle();
      bookingEditId = it?.booking_id ?? null;
    }
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold mb-4">Sales Invoice — {invoice.invoice_no}</h1>
        <div className="rounded-xl border bg-amber-50 border-amber-200 p-5 text-sm text-amber-900 space-y-3">
          <p className="font-medium">এটা Booking থেকে অটো তৈরি হওয়া Invoice ({invoice.customers?.name})।</p>
          <p>
            এর লাইন ও দাম সংশ্লিষ্ট Booking Group থেকে আসে — এখান থেকে সরাসরি এডিট করা যায় না।
            দাম/পরিমাণ/মাপ বদলাতে Booking Group এডিট করুন; Invoice ও Journal Voucher নিজে থেকেই
            আপডেট হবে। প্রতি পিসে দাম কমাতে/বাড়াতে Booking-এর Measurement Row-এ Adjust/Pc ফিল্ড ব্যবহার করুন।
          </p>
          <div className="flex gap-3">
            {bookingEditId && (
              <Link href={`/dashboard/sales/bookings/${bookingEditId}/edit`} className="rounded-lg bg-amber-700 px-4 py-2 text-white hover:bg-amber-800">
                Booking Group এডিট করুন →
              </Link>
            )}
            <Link
              href={`/dashboard/sales/invoices/${id}/${invoice.invoice_type === "lbs" ? "print-lbs" : "print"}`}
              target="_blank"
              className="rounded-lg border border-amber-400 px-4 py-2 text-amber-800 hover:bg-amber-100"
            >
              Invoice দেখুন
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Manual Invoice (standard / lbs) — নতুন-Invoice ফর্মে এডিট ────────────
  const [
    { data: customers }, { data: bookings }, { data: priceHistory }, { data: allItems }, { data: myItems },
  ] = await Promise.all([
    supabase.from("customers").select("*").order("name"),
    supabase
      .from("bookings")
      .select("id, booking_no, booking_date, quantity_pcs, product_id, customer_id, style, garments_name, buyers(name), merchants(name), delivery_point, customer_booking_ref, has_print, print_colors, rate_per_color, rate_per_inch, measurement_type, measurement_unit, length_val, width_val, flap_val, gusset_val, pillow_val, thickness_mm, material_type, finished_goods(product_name, length_cm, width_cm, thickness)")
      .order("booking_date", { ascending: false }),
    supabase.from("rate_history").select("customer_id, effective_from, rate").not("customer_id", "is", null),
    supabase.from("sales_invoice_items").select("booking_id, quantity_pcs"),
    supabase.from("sales_invoice_items").select("id, booking_id, quantity_pcs, unit_price, line_type").eq("invoice_id", id),
  ]);

  // invoicedMap — এই invoice-এর নিজের লাইন বাদ দিয়ে (এডিট করার সময় নিজের বুকিং আবার সিলেক্টযোগ্য হবে)
  const myByBooking: Record<string, number> = {};
  (myItems ?? []).forEach((it: any) => {
    if (it.booking_id) myByBooking[it.booking_id] = (myByBooking[it.booking_id] ?? 0) + Number(it.quantity_pcs || 0);
  });
  const invoicedMap: Record<string, number> = {};
  (allItems ?? []).forEach((it: any) => {
    if (!it.booking_id) return;
    invoicedMap[it.booking_id] = (invoicedMap[it.booking_id] ?? 0) + Number(it.quantity_pcs || 0);
  });
  Object.keys(myByBooking).forEach((bid) => {
    invoicedMap[bid] = Math.max(0, (invoicedMap[bid] ?? 0) - myByBooking[bid]);
  });

  const customer = (customers ?? []).find((c: any) => c.id === invoice.customer_id);
  const historyForCustomer = (priceHistory ?? []).filter((h: any) => h.customer_id === invoice.customer_id);

  const productLines = (myItems ?? []).filter((it: any) => it.booking_id);
  const lines = productLines.map((it: any) => ({
    bookingId: it.booking_id as string,
    qty: Number(it.quantity_pcs) || 0,
    unitPrice: Number(it.unit_price) || 0,
  }));

  // standard: প্রতি লাইনের stored Unit Price হুবহু ধরে রাখতে Adjustment seed
  const adjustmentSeed: Record<string, string> = {};
  if (invoice.invoice_type !== "lbs") {
    productLines.forEach((it: any) => {
      const b: any = (bookings ?? []).find((x: any) => x.id === it.booking_id);
      if (!b) return;
      const rate = resolveRate(historyForCustomer, b.booking_date, Number(customer?.price_per_lbs ?? 0));
      const formulaUnit = calcQuotedUnitPrice(b, rate, b.thickness_mm);
      const seed = Math.round((Number(it.unit_price || 0) - formulaUnit) * 100) / 100;
      if (Math.abs(seed) > 0.001) adjustmentSeed[it.booking_id] = String(seed);
    });
  }

  // LBS — Powder / Making rate পুরনো charge লাইন থেকেই ফিরিয়ে আনি (নাহলে Customer master rate)
  const powderLine = (myItems ?? []).find((it: any) => it.line_type === "lbs_powder");
  const makingLine = (myItems ?? []).find((it: any) => it.line_type === "lbs_making");

  const editInvoice: EditInvoiceCtx = {
    id,
    invoiceNo: invoice.invoice_no,
    invoiceType: invoice.invoice_type === "lbs" ? "lbs" : "standard",
    customerId: invoice.customer_id,
    invoiceDate: invoice.invoice_date,
    paymentReceived: !!invoice.payment_received,
    voucherId: invoice.voucher_id,
    lines,
    adjustmentSeed,
    lbsPowderRate: powderLine?.unit_price != null ? String(powderLine.unit_price) : "",
    lbsMakingRate: makingLine?.unit_price != null ? String(makingLine.unit_price) : "",
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Sales Invoice এডিট করুন — {invoice.invoice_no}</h1>
      <SalesInvoiceForm
        customers={(customers ?? []) as any}
        bookings={(bookings ?? []) as any}
        invoicedMap={invoicedMap}
        priceHistory={(priceHistory ?? []) as any}
        editInvoice={editInvoice}
      />
    </div>
  );
}
