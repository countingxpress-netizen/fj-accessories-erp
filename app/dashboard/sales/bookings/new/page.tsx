import { createClient } from "@/lib/supabase/server";
import BookingForm from "./BookingForm";

export default async function NewBookingPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("*").order("name");
  const { data: warehouses } = await supabase.from("warehouses").select("id, name").order("name");
  const { data: materials } = await supabase.from("raw_materials").select("id, material_name").order("material_name");
  const { data: buyersMaster } = await supabase
    .from("buyers")
    .select("id, customer_id, name, booking_thickness_mm, production_thickness_mm, pi_thickness_mm, print_colors_default, adhesive_rate_per_inch")
    .order("name");
  const { data: garmentsMaster } = await supabase.from("garments").select("id, customer_id, name, address").order("name");
  const { data: merchantsMaster } = await supabase.from("merchants").select("id, name").order("name");
  const { data: priceHistory } = await supabase
    .from("rate_history")
    .select("customer_id, effective_from, rate")
    .not("customer_id", "is", null);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">নতুন Booking</h1>
      <BookingForm
        customers={customers ?? []} warehouses={warehouses ?? []} materials={materials ?? []}
        buyersMaster={buyersMaster ?? []} garmentsMaster={garmentsMaster ?? []} merchantsMaster={merchantsMaster ?? []}
        priceHistory={(priceHistory ?? []) as any}
      />
    </div>
  );
}