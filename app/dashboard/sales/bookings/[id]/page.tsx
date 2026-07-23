import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { formatStyle } from "@/lib/formatStyle";
import { notFound } from "next/navigation";
import StatusTracker from "./StatusTracker";

export default async function BookingViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: currentBooking } = await supabase.from("bookings").select("booking_group_id").eq("id", id).single();
  if (!currentBooking) return notFound();

  const groupId = currentBooking.booking_group_id ?? id;

  const query = supabase
    .from("bookings")
    .select("*, customers(name), buyers(name), merchants(name), finished_goods(product_name, length_cm, width_cm, thickness), warehouses(name)");

  const { data: bookings } = currentBooking.booking_group_id
    ? await query.eq("booking_group_id", groupId)
    : await query.eq("id", id);

  if (!bookings || bookings.length === 0) return notFound();

  return (
    <div>
      <Link href="/dashboard/sales/bookings" className="text-sm text-gray-500 hover:underline">← সব Booking-এর তালিকায় ফিরুন</Link>

      <div className="flex items-center justify-between mt-2 mb-4">
        <h1 className="text-2xl font-semibold">
          {bookings[0].booking_no}
          {bookings.length > 1 && <span className="ml-2 text-sm text-blue-600">({bookings.length}টি প্রোডাক্ট)</span>}
        </h1>
      </div>

      {bookings.map((booking, index) => (
        <BookingItemBlock key={booking.id} booking={booking} index={index + 1} total={bookings.length} />
      ))}
    </div>
  );
}

async function BookingItemBlock({ booking, index, total }: { booking: any; index: number; total: number }) {
  const supabase = await createClient();

  const { data: materials } = await supabase
    .from("booking_materials")
    .select("quantity_lbs, raw_materials(material_name)")
    .eq("booking_id", booking.id);

  const { data: productionOrders } = await supabase
    .from("production_orders")
    .select("*")
    .eq("booking_id", booking.id);

  return (
    <div className="mb-10 border-t-4 border-gray-100 pt-4 first:border-t-0 first:pt-0">
      {total > 1 && (
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-700">আইটেম {index}/{total} — {booking.style || booking.product_details || "-"}</h2>
          <Link href={`/dashboard/sales/bookings/${booking.id}/edit`} className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white">Edit</Link>
        </div>
      )}
      {total === 1 && (
        <div className="flex justify-end mb-3">
          <Link href={`/dashboard/sales/bookings/${booking.id}/edit`} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">Edit</Link>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-1 text-sm">
          <p><span className="text-gray-500">Customer:</span> {booking.customers?.name}</p>
          <p><span className="text-gray-500">Buyer:</span> {booking.buyers?.name ?? "-"}</p>
          <p><span className="text-gray-500">Merchant:</span> {booking.merchants?.name ?? "-"}</p>
          <p><span className="text-gray-500">Garments:</span> {booking.garments_name ?? "-"}</p>
          <p><span className="text-gray-500">Style:</span> {formatStyle(booking.style)}</p>
          <p><span className="text-gray-500">Customer Booking Ref:</span> {booking.customer_booking_ref ?? "-"}</p>
          <p><span className="text-gray-500">Booking Date:</span> {formatDate(booking.booking_date)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-1 text-sm">
          <p><span className="text-gray-500">Product:</span> {booking.finished_goods?.product_name}</p>
          <p><span className="text-gray-500">Size:</span> {booking.finished_goods?.length_cm} × {booking.finished_goods?.width_cm} cm, thickness {booking.finished_goods?.thickness}</p>
          <p><span className="text-gray-500">Measurement Entry:</span> {booking.measurement_type} — L:{booking.length_val} W:{booking.width_val} {booking.flap_val ? `Flap:${booking.flap_val}` : ""} {booking.gusset_val ? `Gusset:${booking.gusset_val}` : ""} ({booking.measurement_unit})</p>
          <p><span className="text-gray-500">Quantity:</span> {booking.quantity_pcs} pcs</p>
          <p><span className="text-gray-500">Order Thickness:</span> {booking.thickness_mm} mm</p>
          <p><span className="text-gray-500">Production Thickness:</span> {booking.production_thickness_mm} mm</p>
          <p><span className="text-gray-500">Print:</span> {booking.has_print ? `হ্যাঁ (${booking.print_colors} color, Rate: ${booking.rate_per_color}/color/pc)` : "না"}</p>
          {booking.has_print && (
            <p className="text-green-700"><span className="text-gray-500">Print Charge:</span> {(booking.print_colors * booking.rate_per_color).toFixed(4)}/pc</p>
          )}
          {booking.measurement_type === "adhesive" && (
            <>
              <p><span className="text-gray-500">Adhesive Rate:</span> {booking.rate_per_inch}/inch</p>
              <p className="text-green-700">
                <span className="text-gray-500">Adhesive Charge:</span>{" "}
                {(((booking.measurement_unit === "cm" ? booking.width_val / 2.54 : booking.width_val)) * booking.rate_per_inch).toFixed(4)}/pc
              </p>
            </>
          )}
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-1 text-sm">
          <p><span className="text-gray-500">Required:</span> {booking.required_lbs?.toFixed(2)} Lbs / {booking.required_kg?.toFixed(2)} Kg / {booking.required_bags?.toFixed(2)} Bags</p>
          <p><span className="text-gray-500">Warehouse:</span> {booking.warehouses?.name ?? "-"}</p>
          <p><span className="text-gray-500">Material Type:</span> {booking.material_type}</p>
          <div className="pt-1">
            {(materials ?? []).map((m: any, i: number) => (
              <p key={i} className="text-gray-600">{m.raw_materials?.material_name}: {m.quantity_lbs?.toFixed(2)} Lbs</p>
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-1 text-sm">
          <p><span className="text-gray-500">Delivery Point:</span> {booking.delivery_point || "-"}</p>
          <p><span className="text-gray-500">Print Layout Note:</span> {booking.print_layout_note || "-"}</p>
          <p><span className="text-gray-500">Status:</span> {booking.status}</p>
        </div>
      </div>

      {productionOrders && productionOrders[0] && (
        <>
          <h3 className="text-sm font-semibold uppercase text-gray-500 mb-2">Status Tracker</h3>
          <div className="mb-4">
            <StatusTracker
              productionOrder={productionOrders[0]}
              hasPrint={booking.has_print}
              bookingCreatedAt={booking.booking_date}
            />
          </div>
        </>
      )}
    </div>
  );
}