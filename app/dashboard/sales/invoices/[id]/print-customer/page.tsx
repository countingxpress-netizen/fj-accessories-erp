import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { notFound } from "next/navigation";
import PrintButton from "@/app/dashboard/PrintButton";
import { amountInWords } from "@/lib/numberToWords";
import { AT_DEFAULT_MARKUP_PERCENTAGE, calcAtCustomerLine } from "@/lib/atCommission";
import InvoiceSummary from "../InvoiceSummary";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMeasurement(b: any) {
  if (!b) return "-";
  const unit = b.measurement_unit;
  const L = b.length_val, W = b.width_val, F = b.flap_val, G = b.gusset_val, P = b.pillow_val;
  if (b.measurement_type === "simple") return `L-${L} x W-${W} ${unit}`;
  if (b.measurement_type === "gusset") return `L-${L} x W-${W} + G-${G} ${unit}`;
  if (b.measurement_type === "adhesive") return `L-${L} + F-${F} x W-${W} ${unit}`;
  if (b.measurement_type === "flap_gusset") return `L-${L} + F-${F} + G-${G} x W-${W} ${unit}`;
  if (b.measurement_type === "pillow") return `L-${L} + P-${P} x W-${W} ${unit}`;
  return "-";
}

export default async function InvoicePrintCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("sales_invoices")
    .select(`*, customers(name, address, phone, opening_balance, opening_balance_date),
      creator:app_users!sales_invoices_created_by_fkey(signature_url),
      sales_invoice_items(quantity_pcs, unit_price,
        bookings(booking_no, style, required_lbs, buyer_id, measurement_type, measurement_unit, length_val, width_val, flap_val, gusset_val, pillow_val),
        finished_goods(product_name))`)
    .eq("id", id)
    .single();

  const { data: company } = await supabase.from("company_profile").select("*").single();

  if (!invoice) return notFound();

  const buyerIds = Array.from(
    new Set((invoice.sales_invoice_items ?? []).map((i: any) => i.bookings?.buyer_id).filter(Boolean))
  ) as string[];
  const { data: buyers } = buyerIds.length
    ? await supabase.from("buyers").select("id, markup_percentage").in("id", buyerIds)
    : { data: [] };
  const markupMap: Record<string, number> = {};
  (buyers ?? []).forEach((b: any) => (markupMap[b.id] = b.markup_percentage ?? AT_DEFAULT_MARKUP_PERCENTAGE));

  // Actual Price-এর উপর Buyer-ভিত্তিক Markup % এবং প্রতি পিস Order Lbs-ভিত্তিক অতিরিক্ত চার্জ যোগ করে
  // Customer-কে দেখানোর Unit Price বের করা হচ্ছে (lib/atCommission.ts-এর শেয়ার্ড ফর্মুলা)।
  // এই পেজ শুধুই একটা print variant — হিসাব/Ledger-এর জন্য আসল Unit Price (normal invoice print) ব্যবহার হয়।
  const items = (invoice.sales_invoice_items ?? []).map((item: any) => {
    const actualPrice = item.unit_price || 0;
    const qty = item.quantity_pcs || 0;
    const orderLbs = item.bookings?.required_lbs || 0;
    const markupPct = item.bookings?.buyer_id ? (markupMap[item.bookings.buyer_id] ?? AT_DEFAULT_MARKUP_PERCENTAGE) : AT_DEFAULT_MARKUP_PERCENTAGE;
    const { customerUnitPrice, customerAmount } = calcAtCustomerLine(actualPrice, qty, orderLbs, markupPct);
    return { ...item, customerUnitPrice, customerAmount, orderLbs };
  });

  const total = items.reduce((s: number, i: any) => s + i.customerAmount, 0);
  const totalOrderLbs = items.reduce((s: number, i: any) => s + i.orderLbs, 0);

  // --- নিচের শর্ট সামারির অটো মান (regular print page-এর মতোই — কাস্টমার ledger) ---
  const [{ data: allInvoices }, { data: payments }] = await Promise.all([
    supabase.from("sales_invoices")
      .select("id, invoice_no, invoice_date, sales_invoice_items(amount)")
      .eq("customer_id", invoice.customer_id),
    supabase.from("customer_payments")
      .select("amount, payment_date")
      .eq("customer_id", invoice.customer_id),
  ]);

  const invoicesWithTotal = (allInvoices ?? [])
    .map((inv: any) => ({
      id: inv.id, invoice_no: inv.invoice_no, invoice_date: inv.invoice_date,
      total: (inv.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.amount || 0), 0),
    }))
    .sort((a: any, b: any) =>
      a.invoice_date === b.invoice_date ? a.invoice_no.localeCompare(b.invoice_no) : a.invoice_date.localeCompare(b.invoice_date),
    );
  const currentIndex = invoicesWithTotal.findIndex((inv: any) => inv.id === invoice.id);
  const previousInvoice = currentIndex > 0 ? invoicesWithTotal[currentIndex - 1] : null;
  const openingBalance = invoice.customers?.opening_balance || 0;
  const openingDate = invoice.customers?.opening_balance_date || "2000-01-01";
  const previousDate = previousInvoice ? previousInvoice.invoice_date : openingDate;
  const sumInvoicesUpToPrevious = (currentIndex > 0 ? invoicesWithTotal.slice(0, currentIndex) : [])
    .reduce((s: number, inv: any) => s + inv.total, 0);
  const paymentsUpToPrevious = (payments ?? []).filter((p: any) => p.payment_date <= previousDate)
    .reduce((s: number, p: any) => s + p.amount, 0);
  const previousDue = openingBalance + sumInvoicesUpToPrevious - paymentsUpToPrevious;
  const paidBetween = (payments ?? [])
    .filter((p: any) => p.payment_date > previousDate && p.payment_date <= invoice.invoice_date)
    .reduce((s: number, p: any) => s + p.amount, 0);
  const paymentDatesBetween = (payments ?? [])
    .filter((p: any) => p.payment_date > previousDate && p.payment_date <= invoice.invoice_date)
    .map((p: any) => p.payment_date).sort();
  const lastPaymentDate = paymentDatesBetween.length ? paymentDatesBetween[paymentDatesBetween.length - 1] : null;

  const signatureUrl = invoice.creator?.signature_url || company?.signature_url;

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white text-gray-900 print:p-0">
      <PrintButton />

      <div className="mb-6 border-b pb-4 flex items-center justify-center gap-4">
        {company?.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={company.logo_url} alt="Logo" className="h-16 w-16 object-contain shrink-0" />
        )}
        <div className="text-center">
          <h1 className="text-2xl font-bold">{company?.name}</h1>
          <p className="text-sm text-gray-600">{company?.address}</p>
          <p className="text-sm text-gray-600">Phone: {company?.phone} | Email: {company?.email}</p>
        </div>
      </div>

      <h2 className="text-xl font-semibold text-center mb-4">Invoice</h2>

      <div className="flex justify-between mb-6 text-sm">
        <div>
          <p className="font-medium">Bill To:</p>
          <p>{invoice.customers?.name}</p>
          <p className="text-gray-600">{invoice.customers?.address}</p>
          {invoice.buyer_name && <p className="text-gray-600">Buyer: {invoice.buyer_name}</p>}
          {invoice.merchant_name && <p className="text-gray-600">Merchant: {invoice.merchant_name}</p>}
        </div>
        <div className="text-right">
          <p><span className="text-gray-600">Sl No: </span><strong>{invoice.invoice_no}</strong></p>
          <p><span className="text-gray-600">Date: </span>{formatDate(invoice.invoice_date)}</p>
        </div>
      </div>

      <table className="w-full text-sm border-collapse mb-2">
        <thead>
          <tr className="border-b-2 border-gray-800">
            <th className="text-left py-2">Sl</th>
            <th className="text-left py-2">Style</th>
            <th className="text-left py-2">Item Description</th>
            <th className="text-left py-2">Measurement</th>
            <th className="text-right py-2">Qty (Pcs)</th>
            <th className="text-right py-2">Unit Price</th>
            <th className="text-right py-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, i: number) => (
            <tr key={i} className="border-b">
              <td className="py-2 text-gray-600">{i + 1}</td>
              <td className="py-2 text-gray-600">{item.bookings?.style || item.bookings?.booking_no || "-"}</td>
              <td className="py-2">{item.finished_goods?.product_name}</td>
              <td className="py-2 text-gray-600 text-xs">{formatMeasurement(item.bookings)}</td>
              <td className="text-right py-2">{item.quantity_pcs}</td>
              <td className="text-right py-2">{fmt(item.customerUnitPrice)}</td>
              <td className="text-right py-2">{fmt(item.customerAmount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-800 font-semibold">
            <td colSpan={6} className="text-right py-2">Total</td>
            <td className="text-right py-2">{fmt(total)}</td>
          </tr>
        </tfoot>
      </table>

      <p className="text-sm text-gray-700 mb-3">
        Total Order Lbs = <strong>{fmt(totalOrderLbs)} Lbs</strong>
      </p>

      <div className="mb-6">
        <p className="text-sm font-semibold mb-1">Amount In Word (BDT):</p>
        <div className="border rounded px-3 py-2 text-sm">{amountInWords(total, "BDT")}</div>
      </div>

      <InvoiceSummary
        invoiceId={invoice.id}
        invoiceNo={invoice.invoice_no}
        previousLabel={`Previous Bill${previousInvoice ? `-${previousInvoice.invoice_no}` : " (Opening Balance)"}`}
        lastPaymentDate={lastPaymentDate}
        autoPrevDue={previousDue}
        autoThisBill={total}
        autoPaid={paidBetween}
        savedPrevDue={invoice.summary_prev_due ?? null}
        savedThisBill={invoice.summary_this_bill ?? null}
        savedPaid={invoice.summary_paid ?? null}
        savedNote={invoice.summary_note ?? null}
      />

      <div className="flex justify-between items-end text-sm pb-4">
        <div className="border-t border-gray-400 pt-2 w-40 text-center">Received By</div>
        <div className="w-40 text-center">
          {signatureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signatureUrl} alt="Authorised Signature" className="h-16 mx-auto object-contain" />
          ) : (
            <div className="border-t border-gray-400 pt-2">Authorised Signature</div>
          )}
        </div>
      </div>
    </div>
  );
}
