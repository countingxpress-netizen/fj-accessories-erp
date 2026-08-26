import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { notFound } from "next/navigation";
import Link from "next/link";
import PrintButton from "@/app/dashboard/PrintButton";
import { amountInWords } from "@/lib/numberToWords";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("sales_invoices")
    .select("*, customers(name, address, phone, opening_balance, opening_balance_date), sales_invoice_items(quantity_pcs, unit_price, amount, bookings(booking_no, style), finished_goods(product_name))")
    .eq("id", id)
    .single();

  const { data: company } = await supabase.from("company_profile").select("*").single();

  if (!invoice) return notFound();

  const total = (invoice.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.amount || 0), 0);

  // --- Previous Bill / This Bill / Running Due হিসাব ---
  const { data: allInvoices } = await supabase
    .from("sales_invoices")
    .select("id, invoice_no, invoice_date, sales_invoice_items(amount)")
    .eq("customer_id", invoice.customer_id);

  const { data: payments } = await supabase
    .from("customer_payments")
    .select("amount, payment_date")
    .eq("customer_id", invoice.customer_id);

  const invoicesWithTotal = (allInvoices ?? [])
    .map((inv: any) => ({
      id: inv.id, invoice_no: inv.invoice_no, invoice_date: inv.invoice_date,
      total: (inv.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.amount || 0), 0),
    }))
    .sort((a: any, b: any) =>
      a.invoice_date === b.invoice_date ? a.invoice_no.localeCompare(b.invoice_no) : a.invoice_date.localeCompare(b.invoice_date)
    );

  const currentIndex = invoicesWithTotal.findIndex((inv: any) => inv.id === invoice.id);
  const previousInvoice = currentIndex > 0 ? invoicesWithTotal[currentIndex - 1] : null;

  const openingBalance = invoice.customers?.opening_balance || 0;
  const openingDate = invoice.customers?.opening_balance_date || "2000-01-01";
  const previousDate = previousInvoice ? previousInvoice.invoice_date : openingDate;

  const invoicesUpToPrevious = currentIndex > 0 ? invoicesWithTotal.slice(0, currentIndex) : [];
  const sumInvoicesUpToPrevious = invoicesUpToPrevious.reduce((s: number, inv: any) => s + inv.total, 0);
  const paymentsUpToPrevious = (payments ?? []).filter((p: any) => p.payment_date <= previousDate).reduce((s: number, p: any) => s + p.amount, 0);

  const previousDue = openingBalance + sumInvoicesUpToPrevious - paymentsUpToPrevious;
  const thisBillAmount = total;
  const totalDue = previousDue + thisBillAmount;
  const paidBetween = (payments ?? [])
    .filter((p: any) => p.payment_date > previousDate && p.payment_date <= invoice.invoice_date)
    .reduce((s: number, p: any) => s + p.amount, 0);
  const runningDue = totalDue - paidBetween;

  const paymentDatesBetween = (payments ?? [])
    .filter((p: any) => p.payment_date > previousDate && p.payment_date <= invoice.invoice_date)
    .map((p: any) => p.payment_date)
    .sort();
  const lastPaymentDate = paymentDatesBetween.length ? paymentDatesBetween[paymentDatesBetween.length - 1] : null;

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white text-gray-900 print:p-0">
      <PrintButton />
      {invoice.customers?.name === "AT Accessories" && (
        <div className="print:hidden mb-4 flex justify-end">
          <Link href={`/dashboard/sales/invoices/${invoice.id}/print-customer`} target="_blank" className="text-sm text-purple-700 hover:underline">
            Submit to Customer ভিউ দেখুন →
          </Link>
        </div>
      )}

      <div className="text-center mb-6 border-b pb-4">
        <h1 className="text-2xl font-bold">{company?.name}</h1>
        <p className="text-sm text-gray-600">{company?.address}</p>
        <p className="text-sm text-gray-600">Phone: {company?.phone} | Email: {company?.email}</p>
      </div>

      <h2 className="text-xl font-semibold text-center mb-4">Sales Invoice</h2>

      <div className="flex justify-between mb-6 text-sm">
        <div>
          <p className="font-medium">Bill To:</p>
          <p>{invoice.customers?.name}</p>
          <p className="text-gray-600">{invoice.customers?.address}</p>
          <p className="text-gray-600">{invoice.customers?.phone}</p>
          {invoice.buyer_name && <p className="text-gray-600">Buyer: {invoice.buyer_name}</p>}
          {invoice.merchant_name && <p className="text-gray-600">Merchant: {invoice.merchant_name}</p>}
          {invoice.customer_booking_ref && <p className="text-gray-600">Customer Booking Ref: {invoice.customer_booking_ref}</p>}
        </div>
        <div className="text-right">
          <p><span className="text-gray-600">Invoice No: </span><strong>{invoice.invoice_no}</strong></p>
          <p><span className="text-gray-600">Date: </span>{formatDate(invoice.invoice_date)}</p>
          {invoice.delivery_point && <p><span className="text-gray-600">Delivery Point: </span>{invoice.delivery_point}</p>}
        </div>
      </div>

      <table className="w-full text-sm border-collapse mb-2">
        <thead>
          <tr className="border-b-2 border-gray-800">
            <th className="text-left py-2">Style</th>
            <th className="text-left py-2">Product</th>
            <th className="text-right py-2">Qty</th>
            <th className="text-right py-2">Unit Price</th>
            <th className="text-right py-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(invoice.sales_invoice_items ?? []).map((item: any, i: number) => (
            <tr key={i} className="border-b">
              <td className="py-2 text-gray-600">{item.bookings?.style || item.bookings?.booking_no || "-"}</td>
              <td className="py-2">{item.finished_goods?.product_name}</td>
              <td className="text-right py-2">{item.quantity_pcs}</td>
              <td className="text-right py-2">{item.unit_price.toFixed(2)}</td>
              <td className="text-right py-2">{fmt(item.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-800 font-semibold">
            <td colSpan={4} className="text-right py-2">Total</td>
            <td className="text-right py-2">{fmt(total)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="mb-4">
        <p className="text-sm font-semibold mb-1">Amount In Word (BDT):</p>
        <div className="border rounded px-3 py-2 text-sm">{amountInWords(total, "BDT")}</div>
      </div>

      <table className="text-xs border-collapse w-full max-w-sm ml-auto mb-8" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "65%" }} />
          <col style={{ width: "35%" }} />
        </colgroup>
        <tbody>
          <tr>
            <td className="py-1 pr-2 whitespace-nowrap overflow-hidden text-ellipsis">
              Previous Bill{previousInvoice ? `-${previousInvoice.invoice_no}` : " (Opening Balance)"} Due =
            </td>
            <td className="py-1 text-right whitespace-nowrap">BDT {fmt(previousDue)}</td>
          </tr>
          <tr>
            <td className="py-1 pr-2 whitespace-nowrap overflow-hidden text-ellipsis">This Bill-{invoice.invoice_no} =</td>
            <td className="py-1 text-right whitespace-nowrap">BDT {fmt(thisBillAmount)}</td>
          </tr>
          <tr className="font-semibold border-t">
            <td className="py-1 pr-2 whitespace-nowrap">Total Due =</td>
            <td className="py-1 text-right whitespace-nowrap">BDT {fmt(totalDue)}</td>
          </tr>
          <tr>
            <td className="py-1 pr-2 whitespace-nowrap overflow-hidden text-ellipsis">
              Paid{lastPaymentDate ? ` on ${formatDate(lastPaymentDate)}` : ""} =
            </td>
            <td className="py-1 text-right whitespace-nowrap">{paidBetween > 0 ? `BDT ${fmt(paidBetween)}` : ""}</td>
          </tr>
          <tr className="font-bold border-t-2">
            <td className="py-1 pr-2 whitespace-nowrap">Running Due =</td>
            <td className="py-1 text-right whitespace-nowrap">BDT {fmt(runningDue)}</td>
          </tr>
        </tbody>
      </table>

      <div className="flex justify-between text-sm pb-4">
        <div className="border-t border-gray-400 pt-2 w-40 text-center">Received By</div>
        <div className="border-t border-gray-400 pt-2 w-40 text-center">Authorised Signature</div>
      </div>
    </div>
  );
}