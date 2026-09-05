import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { notFound } from "next/navigation";
import PrintButton from "@/app/dashboard/PrintButton";
import { money } from "@/lib/format";

const titles: Record<string, string> = {
  blowing: "Blowing Production Schedule",
  printing: "Printing Schedule (with Layout)",
  cutting: "Cutting Schedule",
};

export default async function SchedulePrintPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string }> }) {
  const { id } = await params;
  const { type } = await searchParams;
  const scheduleType = type ?? "blowing";
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("production_orders")
    .select("*, bookings(*, customers(name), buyers(name), merchants(name), finished_goods(product_name, length_cm, width_cm, thickness))")
    .eq("id", id)
    .single();

  if (!order) return notFound();

  const { data: materials } = await supabase
    .from("material_consumption")
    .select("quantity_lbs, raw_materials(material_name)")
    .eq("production_id", id);

  const { data: company } = await supabase.from("company_profile").select("*").single();
  const booking = order.bookings;

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white text-gray-900 print:p-0">
      <PrintButton />
      <div className="text-center mb-6 border-b pb-4">
        <h1 className="text-2xl font-bold">{company?.name}</h1>
        <p className="text-sm text-gray-600">{company?.address}</p>
      </div>
      <h2 className="text-xl font-semibold text-center mb-4">{titles[scheduleType]}</h2>

      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <p><span className="text-gray-500">Production No: </span><strong>{order.production_no}</strong></p>
        <p><span className="text-gray-500">Date: </span>{formatDate(order.order_date)}</p>
        <p><span className="text-gray-500">Booking No: </span>{booking?.booking_no}</p>
        <p><span className="text-gray-500">Customer: </span>{booking?.customers?.name}</p>
        <p><span className="text-gray-500">Buyer: </span>{booking?.buyers?.name ?? "-"}</p>
        <p><span className="text-gray-500">Merchant: </span>{booking?.merchants?.name ?? "-"}</p>
        <p><span className="text-gray-500">Style: </span>{booking?.style ?? "-"}</p>
        <p><span className="text-gray-500">Product: </span>{booking?.finished_goods?.product_name}</p>
        <p><span className="text-gray-500">Size: </span>{booking?.finished_goods?.length_cm} × {booking?.finished_goods?.width_cm} cm, thickness {booking?.finished_goods?.thickness}</p>
        <p><span className="text-gray-500">Quantity: </span>{order.quantity_pcs} pcs</p>
      </div>

      {scheduleType === "blowing" && (
        <>
          <h3 className="font-semibold text-sm mb-2">Material Requirement</h3>
          <table className="w-full text-sm border-collapse mb-4">
            <thead><tr className="border-b-2 border-gray-800"><th className="text-left py-2">Material</th><th className="text-right py-2">Quantity (Lbs)</th></tr></thead>
            <tbody>
              {(materials ?? []).map((m: any, i: number) => (
                <tr key={i} className="border-b"><td className="py-2">{m.raw_materials?.material_name}</td><td className="text-right py-2">{money(m.quantity_lbs)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm">Total Required: <strong>{money(order.required_lbs)} Lbs</strong></p>
        </>
      )}

      {scheduleType === "printing" && (
        <>
          <p className="text-sm mb-2">Print Colors: <strong>{booking?.print_colors ?? 0}</strong></p>
          <p className="text-sm mb-4">Print Layout Note: {booking?.print_layout_note || "কোনো লেআউট নোট নেই"}</p>
          {booking?.print_layout_file_url && (
            /\.(jpe?g|png|webp)$/i.test(booking.print_layout_file_url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={booking.print_layout_file_url} alt="Print Layout" className="max-w-full border mb-4" />
            ) : (
              <p className="text-sm mb-4 print:hidden">
                Print Layout ফাইল (PDF): <a href={booking.print_layout_file_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">আলাদাভাবে দেখুন/প্রিন্ট করুন</a>
              </p>
            )
          )}
        </>
      )}

      {scheduleType === "cutting" && (
        <>
          <p className="text-sm">Measurement Type: {booking?.measurement_type}</p>
          <p className="text-sm">L: {booking?.length_val} | W: {booking?.width_val} {booking?.flap_val ? `| Flap: ${booking.flap_val}` : ""} {booking?.gusset_val ? `| Gusset: ${booking.gusset_val}` : ""} {booking?.pillow_val ? `| Pillow: ${booking.pillow_val}` : ""} ({booking?.measurement_unit})</p>
        </>
      )}

      <div className="mt-16 flex justify-between text-sm">
        <div className="border-t border-gray-400 pt-2 w-40 text-center">Prepared By</div>
        <div className="border-t border-gray-400 pt-2 w-40 text-center">Received By ({scheduleType === "blowing" ? "Production" : scheduleType === "printing" ? "Printing Machine" : "Cutting Section"})</div>
      </div>
    </div>
  );
}