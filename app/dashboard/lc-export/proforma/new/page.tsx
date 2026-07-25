import { createClient } from "@/lib/supabase/server";
import ProformaForm from "./ProformaForm";

export default async function NewProformaPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name, price_per_lbs").order("name");

  const { data: allBookings } = await supabase
    .from("bookings")
    .select("id, booking_no, quantity_pcs, product_id, customer_id, style, garments_name, buyers(name), merchants(name), measurement_type, measurement_unit, length_val, width_val, flap_val, gusset_val, pi_thickness_mm, finished_goods(product_name, length_cm, width_cm, thickness)")
    .order("booking_date", { ascending: false });

  const { data: usedItems } = await supabase.from("pi_items").select("booking_id").not("booking_id", "is", null);
  const usedIds = new Set((usedItems ?? []).map((pi: any) => pi.booking_id));
  const availableBookings = (allBookings ?? []).filter((b: any) => !usedIds.has(b.id));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">নতুন Proforma Invoice</h1>
      <ProformaForm customers={customers ?? []} bookings={availableBookings as any} />
    </div>
  );
}