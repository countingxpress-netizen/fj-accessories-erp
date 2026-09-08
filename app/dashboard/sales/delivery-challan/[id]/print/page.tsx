import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { formatMeasurement } from "@/lib/formatMeasurement";
import { notFound } from "next/navigation";
import ChallanPrintView from "./ChallanPrintView";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("delivery_challans").select("challan_no").eq("id", id).maybeSingle();
  return { title: data?.challan_no ? `Challan ${data.challan_no}` : "Delivery Challan" };
}

export default async function ChallanPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: challan } = await supabase
    .from("delivery_challans")
    .select(`
      *,
      customers(name, address, phone),
      delivery_challan_items(
        id,
        booking_id,
        print_label,
        quantity_pcs,
        packets,
        finished_goods(product_name, length_cm, width_cm)
      )
    `)
    .eq("id", id)
    .order("id", { referencedTable: "delivery_challan_items", ascending: true })
    .single();

  if (!challan) return notFound();

  const { data: company } = await supabase.from("company_profile").select("*").single();

  // প্রতিটা লাইনের Measurement — item.booking_id → bookings; নাহলে finished_goods fallback
  const items: any[] = challan.delivery_challan_items ?? [];
  const bookingIds = Array.from(new Set(items.map((i) => i.booking_id).filter(Boolean)));
  const { data: bookings } = bookingIds.length
    ? await supabase
        .from("bookings")
        .select("id, measurement_type, measurement_unit, length_val, width_val, flap_val, gusset_val, pillow_val")
        .in("id", bookingIds)
    : { data: [] as any[] };
  const bkById: Record<string, any> = Object.fromEntries((bookings ?? []).map((b: any) => [b.id, b]));

  const measurementByItem: Record<string, string> = {};
  for (const it of items) {
    const b = bkById[it.booking_id];
    if (b) {
      measurementByItem[it.id] = formatMeasurement(b);
    } else {
      const fg = it.finished_goods;
      measurementByItem[it.id] =
        fg?.length_cm || fg?.width_cm ? `L-${fg.length_cm || 0} x W-${fg.width_cm || 0} cm` : "-";
    }
  }

  return (
    <ChallanPrintView
      challan={challan}
      company={company}
      challanDateLabel={formatDate(challan.challan_date)}
      measurementByItem={measurementByItem}
    />
  );
}
