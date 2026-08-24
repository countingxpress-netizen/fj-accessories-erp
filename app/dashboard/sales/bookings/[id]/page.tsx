import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { getBookingStatusLabel } from "@/lib/bookingStatus";
import { notFound } from "next/navigation";

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

  const first = bookings[0];

  const statusParts = bookings.map((b: any) => {
    const s = getBookingStatusLabel(b, deliveredMap[b.id] ?? 0, Array.from(challanNosByBooking[b.id] ?? []));
    return bookings.length > 1 ? `${b.style || b.product_details || "-"}: ${s.label}` : s.label;
  });

  return (
    <div>
      <Link href="/dashboard/sales/bookings" className="text-sm text-gray-500 hover:underline">← সব Booking-এর তালিকায় ফিরুন</Link>

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
              <td className="border border-gray-800 px-3 py-2"><strong>Status-</strong> {statusParts.join(" | ")}</td>
            </tr>
            <tr>
              <td className="border border-gray-800 px-3 py-2">
                <strong>Garments-</strong> {first.garments?.name || first.garments_name || "-"}<br />
                <strong>Address -</strong> {first.garments?.address || "-"}
              </td>
              <td className="border border-gray-800 px-3 py-2"><strong>Delivery Point-</strong> {first.delivery_point || "-"}</td>
            </tr>
          </tbody>
        </table>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-800 px-2 py-2">Style</th>
              <th className="border border-gray-800 px-2 py-2">Product Details</th>
              <th className="border border-gray-800 px-2 py-2">Measurement</th>
              <th className="border border-gray-800 px-2 py-2">Order Thickness</th>
              <th className="border border-gray-800 px-2 py-2">Production Thickness</th>
              <th className="border border-gray-800 px-2 py-2">PI Thickness</th>
              <th className="border border-gray-800 px-2 py-2">Quantity</th>
              <th className="border border-gray-800 px-2 py-2">Required LBS</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b: any) => {
              const unit = b.measurement_unit;
              const L = b.length_val, W = b.width_val, F = b.flap_val, G = b.gusset_val;
              const measurement =
                b.measurement_type === "simple" ? `L-${L} x W-${W}${unit}` :
                b.measurement_type === "gusset" ? `L-${L} x W-${W} + G-${G}${unit}` :
                b.measurement_type === "adhesive" ? `L-${L} + F-${F} x W-${W}${unit}` : "-";
              return (
                <tr key={b.id}>
                  <td className="border border-gray-800 px-2 py-2 text-center">{b.style || "-"}</td>
                  <td className="border border-gray-800 px-2 py-2">{b.product_details || b.finished_goods?.product_name || "-"}</td>
                  <td className="border border-gray-800 px-2 py-2">{measurement}</td>
                  <td className="border border-gray-800 px-2 py-2 text-center">{b.thickness_mm}</td>
                  <td className="border border-gray-800 px-2 py-2 text-center">{b.production_thickness_mm}</td>
                  <td className="border border-gray-800 px-2 py-2 text-center">{b.pi_thickness_mm ?? "-"}</td>
                  <td className="border border-gray-800 px-2 py-2 text-right">{b.quantity_pcs}</td>
                  <td className="border border-gray-800 px-2 py-2 text-right">{b.required_lbs}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="px-3 py-3 text-sm">
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

      <div className="flex justify-end gap-2 mt-4">
        <Link href={`/dashboard/sales/bookings/${first.id}/edit`} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">Edit</Link>
      </div>
    </div>
  );
}