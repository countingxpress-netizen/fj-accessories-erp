import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { notFound } from "next/navigation";
import PrintButton from "@/app/dashboard/PrintButton";

function formatMeasurement(booking: any, finishedGood: any) {
  // ১. বুকিং ডাটা থাকলে সেটা দেখাবে
  if (booking) {
    const unit = booking.measurement_unit || "cm";
    const L = booking.length_val, W = booking.width_val, F = booking.flap_val, G = booking.gusset_val;

    if (booking.measurement_type === "simple") return `L-${L} x W-${W} ${unit}`;
    if (booking.measurement_type === "gusset") return `L-${L} x W-${W} + G-${G} ${unit}`;
    if (booking.measurement_type === "adhesive") return `L-${L} + F-${F} x W-${W} ${unit}`;
  }

  // ২. বুকিং ডাটা না থাকলে finished_goods টেবিলের ডাটা (Fallback) দেখাবে
  if (finishedGood?.length_cm || finishedGood?.width_cm) {
    const L = finishedGood.length_cm || 0;
    const W = finishedGood.width_cm || 0;
    return `L-${L} x W-${W} cm`;
  }

  return "-";
}

export default async function ChallanPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // ১. Challan-এর সাথে items এবং item-এর product_id সহ ফেচ করা হলো
  const { data: challan } = await supabase
    .from("delivery_challans")
    .select(`
      *, 
      customers(name, address, phone), 
      delivery_challan_items(
        product_id, 
        quantity_pcs, 
        finished_goods(product_name, length_cm, width_cm, thickness)
      )
    `)
    .eq("id", id)
    .single();

  if (!challan) return notFound();

  // ২. Related Bookings লোড করা
  let bookingByProduct: Record<string, any> = {};
  
  if (challan.booking_id) {
    const { data: relatedBookings } = await supabase
      .from("bookings")
      .select("product_id, measurement_type, length_val, width_val, flap_val, gusset_val, measurement_unit")
      .eq("id", challan.booking_id);

    (relatedBookings ?? []).forEach((b: any) => { 
      if (b.product_id) {
        bookingByProduct[b.product_id] = b; 
      }
    });
  }

  const { data: company } = await supabase.from("company_profile").select("*").single();

  return (
    <div className="min-h-[297mm] flex flex-col max-w-3xl mx-auto p-8 bg-white text-gray-900 print:p-0">
      <PrintButton />

      <div className="flex-1">
        <div className="text-center mb-6 border-b pb-4">
          <h1 className="text-2xl font-bold">{company?.name}</h1>
          <p className="text-sm text-gray-600">{company?.address}</p>
          <p className="text-sm text-gray-600">Phone: {company?.phone} | Email: {company?.email}</p>
        </div>

        <h2 className="text-xl font-semibold text-center mb-4">Delivery Challan</h2>

        <div className="flex justify-between mb-6 text-sm">
          <div>
            <p className="font-medium">Deliver To:</p>
            <p className="text-gray-700">{challan.delivery_point || "-"}</p>
            {challan.buyer_name && <p className="text-gray-600">Buyer: {challan.buyer_name}</p>}
            {challan.merchant_name && <p className="text-gray-600">Merchant: {challan.merchant_name}</p>}
            {challan.style && <p className="text-gray-600">Style: {challan.style}</p>}
            {challan.customer_booking_ref && <p className="text-gray-600">Customer Booking Ref: {challan.customer_booking_ref}</p>}
          </div>
          <div className="text-right">
            <p><span className="text-gray-600">Challan No: </span><strong>{challan.challan_no}</strong></p>
            <p><span className="text-gray-600">Date: </span>{formatDate(challan.challan_date)}</p>
          </div>
        </div>

        <table className="w-full text-sm border-collapse mb-6">
          <thead>
            <tr className="border-b-2 border-gray-800">
              <th className="text-left py-2">Product</th>
              <th className="text-left py-2">Measurement</th>
              <th className="text-right py-2">Quantity (Pcs)</th>
            </tr>
          </thead>
          <tbody>
            {(challan.delivery_challan_items ?? []).map((item: any, i: number) => {
              const bookingData = bookingByProduct[item.product_id];
              return (
                <tr key={i} className="border-b">
                  <td className="py-2">{item.finished_goods?.product_name || "-"}</td>
                  <td className="py-2">{formatMeasurement(bookingData, item.finished_goods)}</td>
                  <td className="text-right py-2">{item.quantity_pcs}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between text-sm pb-4">
        <div className="border-t border-gray-400 pt-2 w-40 text-center">Received By</div>
        <div className="border-t border-gray-400 pt-2 w-40 text-center">Authorised Signature</div>
      </div>
    </div>
  );
}