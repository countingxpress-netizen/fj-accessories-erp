import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { getBookingStatusLabel } from "@/lib/bookingStatus";
import { calcTubeCutting, calcRequiredLbs } from "@/lib/calcTubeCutting";
import { notFound } from "next/navigation";
import PrintButton from "@/app/dashboard/PrintButton";
import GuardedAction from "@/app/dashboard/GuardedAction";

export default async function BookingViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: currentBooking } = await supabase.from("bookings").select("booking_group_id").eq("id", id).single();
  if (!currentBooking) return notFound();

  const groupId = currentBooking.booking_group_id ?? id;

  const query = supabase
    .from("bookings")
    .select("*, customers(name, address), buyers(name), merchants(name), garments:garments_id(name, address), finished_goods(product_name), production_orders(id, blowing_completed_at, printing_completed_at, cutting_completed_at)");

  const { data: bookings } = currentBooking.booking_group_id
    ? await query.eq("booking_group_id", groupId)
    : await query.eq("id", id);

  if (!bookings || bookings.length === 0) return notFound();

  const { data: company } = await supabase.from("company_profile").select("*").single();

    const bookingIds = bookings.map((b: any) => b.id);

  const { data: allChallanItems } = await supabase
    .from("delivery_challan_items")
    .select("quantity_pcs, delivery_challans(booking_id, challan_no, challan_date)");

  const deliveredMap: Record<string, number> = {};
  const challanNosByBooking: Record<string, Set<string>> = {};
  const challanListForGroup: { challan_no: string; challan_date: string }[] = [];

  (allChallanItems ?? []).forEach((item: any) => {
    const dc = item.delivery_challans;
    if (!dc || !bookingIds.includes(dc.booking_id)) return;
    deliveredMap[dc.booking_id] = (deliveredMap[dc.booking_id] ?? 0) + item.quantity_pcs;
    if (!challanNosByBooking[dc.booking_id]) challanNosByBooking[dc.booking_id] = new Set();
    if (!challanNosByBooking[dc.booking_id].has(dc.challan_no)) {
      challanNosByBooking[dc.booking_id].add(dc.challan_no);
      challanListForGroup.push({ challan_no: dc.challan_no, challan_date: dc.challan_date });
    }
  });

  const uniqueChallans = Array.from(new Map(challanListForGroup.map((c) => [c.challan_no, c])).values())
    .sort((a, b) => a.challan_date.localeCompare(b.challan_date));

  // Sales Invoice থেকে Price/Pcs, Total Amount ও Invoice No টেনে আনা
  const { data: invoiceItems } = await supabase
    .from("sales_invoice_items")
    .select("booking_id, unit_price, quantity_pcs, sales_invoices(invoice_no, invoice_date)")
    .in("booking_id", bookingIds);

  const priceByBooking: Record<string, { unitPrice: number; totalAmount: number; latestDate: string }> = {};
  const salesInvoiceNoSet = new Set<string>();
  (invoiceItems ?? []).forEach((item: any) => {
    if (!item.booking_id) return;
    const amount = Math.floor((item.quantity_pcs || 0) * (item.unit_price || 0));
    const thisDate = item.sales_invoices?.invoice_date ?? "";
    if (item.sales_invoices?.invoice_no) salesInvoiceNoSet.add(item.sales_invoices.invoice_no);
    const existing = priceByBooking[item.booking_id];
    if (!existing) {
      priceByBooking[item.booking_id] = { unitPrice: item.unit_price, totalAmount: amount, latestDate: thisDate };
    } else {
      existing.totalAmount += amount;
      if (thisDate >= existing.latestDate) {
        existing.unitPrice = item.unit_price;
        existing.latestDate = thisDate;
      }
    }
  });
  const salesInvoiceNos = Array.from(salesInvoiceNoSet).sort();

  // Proforma Invoice নম্বর টেনে আনা
  const { data: piItemRows } = await supabase
    .from("pi_items")
    .select("booking_id, proforma_invoices(pi_no)")
    .in("booking_id", bookingIds);

  const piNoSet = new Set<string>();
  (piItemRows ?? []).forEach((item: any) => {
    if (item.proforma_invoices?.pi_no) piNoSet.add(item.proforma_invoices.pi_no);
  });
  const piNos = Array.from(piNoSet).sort();

  const first = bookings[0];

  // পরবর্তী Schedule ধাপ নির্ণয়
  const anyHasPrint = bookings.some((b: any) => b.has_print);
  const allBlowingDone = bookings.every((b: any) => b.production_orders?.[0]?.blowing_completed_at);
  const allPrintingDone = bookings.every((b: any) => b.production_orders?.[0]?.printing_completed_at);
  const allCuttingDone = bookings.every((b: any) => b.production_orders?.[0]?.cutting_completed_at);

  let nextScheduleType: "blowing" | "printing" | "cutting" | null = null;
  let nextScheduleLabel = "";
  if (!allBlowingDone) {
    nextScheduleType = "blowing";
    nextScheduleLabel = "Create Blowing Schedule";
  } else if (anyHasPrint && !allPrintingDone) {
    nextScheduleType = "printing";
    nextScheduleLabel = "Create Printing Schedule";
  } else if (!allCuttingDone) {
    nextScheduleType = "cutting";
    nextScheduleLabel = "Create Cutting Schedule";
  }

  // টেবিলের Total row-এর জন্য যোগফল
  let totalQuantity = 0;
  let totalAmountSum = 0;
  let totalOrderLbs = 0;
  let totalProductionLbs = 0;

  return (
    <div>
      <div className="flex items-center justify-between print:hidden">
        <Link href="/dashboard/sales/bookings" className="text-sm text-gray-500 hover:underline">← সব Booking-এর তালিকায় ফিরুন</Link>
        <div className="flex items-center gap-2">
          <PrintButton />
          {nextScheduleType && (
            <Link
              href={`/dashboard/production/schedule-group/${groupId}?type=${nextScheduleType}`}
              target="_blank"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              {nextScheduleLabel}
            </Link>
          )}
        </div>
      </div>

      <div className="rounded-xl border-2 border-gray-800 bg-white mt-2 overflow-hidden">
        <div className="text-center border-b-2 border-gray-800 py-3">
          <h1 className="text-2xl font-bold">{company?.name}</h1>
          <p className="text-sm text-gray-600">{company?.address}</p>
          <p className="text-sm text-gray-600">Contact No- {company?.phone}  E-Mail- {company?.email}</p>
        </div>

        <table className="w-full text-sm border-collapse">
          <tbody>
            <tr>
              <td className="border border-gray-800 px-3 py-2 w-1/2"><strong>Booking No-</strong> {first.booking_no}</td>
              <td className="border border-gray-800 px-3 py-2"><strong>Booking Date-</strong> {formatDate(first.booking_date)}</td>
            </tr>
            <tr>
              <td className="border border-gray-800 px-3 py-2"><strong>Customer Name-</strong> {first.customers?.name}</td>
              <td className="border border-gray-800 px-3 py-2"><strong>Address-</strong> {first.customers?.address || "-"}</td>
            </tr>
            <tr>
              <td className="border border-gray-800 px-3 py-2"><strong>Buyer-</strong> {first.buyers?.name || "-"}</td>
              <td className="border border-gray-800 px-3 py-2"></td>
            </tr>
            <tr>
              <td className="border border-gray-800 px-3 py-2">
                <strong>Garments-</strong> {first.garments?.name || first.garments_name || "-"}<br />
                <strong>Address -</strong> {first.garments?.address || "-"}
              </td>
              <td className="border border-gray-800 px-3 py-2"><strong>Delivery Point-</strong> {first.garments?.name || first.garments_name || "-"}</td>
            </tr>
          </tbody>
        </table>

        <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-800 px-2 py-2">Sl No</th>
              <th className="border border-gray-800 px-2 py-2">Style No</th>
              <th className="border border-gray-800 px-2 py-2">Product Details</th>
              <th className="border border-gray-800 px-2 py-2">Measurement</th>
              <th className="border border-gray-800 px-2 py-2">Quantity</th>
              <th className="border border-gray-800 px-2 py-2">Price/Pcs</th>
              <th className="border border-gray-800 px-2 py-2">Total Amount</th>
              <th className="border border-gray-800 px-2 py-2 print:hidden">Tube</th>
              <th className="border border-gray-800 px-2 py-2 print:hidden">Cutting</th>
              <th className="border border-gray-800 px-2 py-2">Order Thickness</th>
              <th className="border border-gray-800 px-2 py-2 print:hidden">Production Thickness</th>
              <th className="border border-gray-800 px-2 py-2 print:hidden">PI Thickness</th>
              <th className="border border-gray-800 px-2 py-2">Order LBS</th>
              <th className="border border-gray-800 px-2 py-2 print:hidden">Production LBS</th>
              <th className="border border-gray-800 px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b: any, i: number) => {
              const unit = b.measurement_unit;
              const L = b.length_val, W = b.width_val, F = b.flap_val, G = b.gusset_val;
              const measurement =
                b.measurement_type === "simple" ? `L-${L} x W-${W}${unit}` :
                b.measurement_type === "gusset" ? `L-${L} x W-${W} + G-${G}${unit}` :
                b.measurement_type === "adhesive" ? `L-${L} + F-${F} x W-${W}${unit}` : "-";
              const { tube, cutting } = calcTubeCutting(b);
              const orderLbs = calcRequiredLbs(b, b.thickness_mm);
              const price = priceByBooking[b.id];
              const statusLabel = getBookingStatusLabel(b, deliveredMap[b.id] ?? 0, Array.from(challanNosByBooking[b.id] ?? [])).label;

              totalQuantity += b.quantity_pcs || 0;
              totalAmountSum += price?.totalAmount || 0;
              totalOrderLbs += orderLbs || 0;
              totalProductionLbs += b.required_lbs || 0;

              return (
                <tr key={b.id}>
                  <td className="border border-gray-800 px-2 py-2 text-center">{i + 1}</td>
                  <td className="border border-gray-800 px-2 py-2 text-center">{b.style || "-"}</td>
                  <td className="border border-gray-800 px-2 py-2">{b.product_details || b.finished_goods?.product_name || "-"}</td>
                  <td className="border border-gray-800 px-2 py-2">{measurement}</td>
                  <td className="border border-gray-800 px-2 py-2 text-right">{b.quantity_pcs}</td>
                  <td className="border border-gray-800 px-2 py-2 text-right">{price ? price.unitPrice.toFixed(2) : "-"}</td>
                  <td className="border border-gray-800 px-2 py-2 text-right">{price ? price.totalAmount.toFixed(2) : "-"}</td>
                  <td className="border border-gray-800 px-2 py-2 text-center print:hidden">{tube.toFixed(2)} {unit}</td>
                  <td className="border border-gray-800 px-2 py-2 text-center print:hidden">{cutting.toFixed(2)} {unit}</td>
                  <td className="border border-gray-800 px-2 py-2 text-center">{b.thickness_mm}</td>
                  <td className="border border-gray-800 px-2 py-2 text-center print:hidden">{b.production_thickness_mm}</td>
                  <td className="border border-gray-800 px-2 py-2 text-center print:hidden">{b.pi_thickness_mm ?? "-"}</td>
                  <td className="border border-gray-800 px-2 py-2 text-right">{orderLbs.toFixed(2)}</td>
                  <td className="border border-gray-800 px-2 py-2 text-right print:hidden">{b.required_lbs}</td>
                  <td className="border border-gray-800 px-2 py-2 text-center">{statusLabel}</td>
                </tr>
              );
            })}
            <tr className="font-semibold bg-gray-50">
              <td className="border border-gray-800 px-2 py-2 text-right" colSpan={4}>Total</td>
              <td className="border border-gray-800 px-2 py-2 text-right">{totalQuantity.toLocaleString()}</td>
              <td className="border border-gray-800 px-2 py-2"></td>
              <td className="border border-gray-800 px-2 py-2 text-right">{totalAmountSum.toFixed(2)}</td>
              <td className="border border-gray-800 px-2 py-2 print:hidden"></td>
              <td className="border border-gray-800 px-2 py-2 print:hidden"></td>
              <td className="border border-gray-800 px-2 py-2"></td>
              <td className="border border-gray-800 px-2 py-2 print:hidden"></td>
              <td className="border border-gray-800 px-2 py-2 print:hidden"></td>
              <td className="border border-gray-800 px-2 py-2 text-right">{totalOrderLbs.toFixed(2)}</td>
              <td className="border border-gray-800 px-2 py-2 text-right print:hidden">{totalProductionLbs.toFixed(2)}</td>
              <td className="border border-gray-800 px-2 py-2"></td>
            </tr>
          </tbody>
        </table>
        </div>

        <div className="px-3 py-3 text-sm space-y-3">
          <div>
            <p className="font-semibold mb-1">Sales Invoice No/Nos: -</p>
            {salesInvoiceNos.length > 0 ? (
              <ol className="list-decimal list-inside">
                {salesInvoiceNos.map((no) => (
                  <li key={no}>
                    <Link href="/dashboard/sales/invoices" className="text-blue-700 hover:underline">{no}</Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-gray-400 italic">এখনো কোনো Sales Invoice তৈরি হয়নি</p>
            )}
          </div>
          <div>
            <p className="font-semibold mb-1">Proforma Invoice No/Nos: -</p>
            {piNos.length > 0 ? (
              <ol className="list-decimal list-inside">
                {piNos.map((no) => (
                  <li key={no}>
                    <Link href="/dashboard/lc-export/proforma" className="text-blue-700 hover:underline">{no}</Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-gray-400 italic">এখনো কোনো Proforma Invoice তৈরি হয়নি</p>
            )}
          </div>
          <div>
            <p className="font-semibold mb-1">Delivery Challan No/Nos: -</p>
            {uniqueChallans.length > 0 ? (
              <ol className="list-decimal list-inside">
                {uniqueChallans.map((c) => (
                  <li key={c.challan_no}>
                    <Link href="/dashboard/sales/delivery-challan" className="text-blue-700 hover:underline">{c.challan_no}</Link> – DT-{formatDate(c.challan_date)}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-gray-400 italic">এখনো কোনো Delivery Challan তৈরি হয়নি</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4 print:hidden">
        <GuardedAction table="bookings" recordId={first.id} recordLabel={first.booking_no} action="edit"
          onAllowed={() => { window.location.href = `/dashboard/sales/bookings/${first.id}/edit`; }}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">Edit</GuardedAction>
      </div>
    </div>
  );
}
