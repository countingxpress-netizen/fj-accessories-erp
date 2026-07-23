import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { notFound } from "next/navigation";
import PrintButton from "@/app/dashboard/PrintButton";

function formatMeasurement(b: any) {
  const unit = b.measurement_unit;
  const L = b.length_val, W = b.width_val, F = b.flap_val, G = b.gusset_val;

  if (b.measurement_type === "simple") return `L-${L} x W-${W} ${unit}`;
  if (b.measurement_type === "gusset") return `L-${L} x W-${W} + G-${G} ${unit}`;
  if (b.measurement_type === "adhesive") return `L-${L} + F-${F} x W-${W} ${unit}`;
  return "-";
}

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("sales_invoices")
    .select("*, customers(name, address, phone), sales_invoice_items(quantity_pcs, unit_price, amount, bookings(booking_no, measurement_type, length_val, width_val, flap_val, gusset_val, measurement_unit), finished_goods(product_name))")
    .eq("id", id)
    .single();

  const { data: company } = await supabase.from("company_profile").select("*").single();

  if (!invoice) return notFound();

  const total = Math.round((invoice.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.amount || 0), 0) * 100) / 100;

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white text-gray-900 print:p-0">
      <PrintButton />

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

      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr className="border-b-2 border-gray-800">
            <th className="text-left py-2">Booking</th>
            <th className="text-left py-2">Product</th>
            <th className="text-right py-2">Measurement</th>
            <th className="text-right py-2">Qty</th>
            <th className="text-right py-2">Unit Price</th>
            <th className="text-right py-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(invoice.sales_invoice_items ?? []).map((item: any, i: number) => (
            <tr key={i} className="border-b">
              <td className="py-2 text-gray-600">{item.bookings?.booking_no}</td>
              <td className="py-2">{item.finished_goods?.product_name}</td>
              <td className="text-right py-2">{formatMeasurement(item.bookings)}</td>
              <td className="text-right py-2">{item.quantity_pcs}</td>
              <td className="text-right py-2">{item.unit_price.toFixed(2)}</td>
              <td className="text-right py-2">{(Math.round(item.unit_price * item.quantity_pcs * 100) / 100).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-800 font-semibold">
            <td colSpan={4} className="text-right py-2">Total</td>
            <td className="text-right py-2">{total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-24 flex justify-between text-sm">
        <div className="border-t border-gray-400 pt-2 w-40 text-center">Received By</div>
        <div className="border-t border-gray-400 pt-2 w-40 text-center">Authorized Signature</div>
      </div>
    </div>
  );
}