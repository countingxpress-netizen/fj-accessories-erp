import { createClient } from "@/lib/supabase/server";
import BookingForm from "./BookingForm";

export default async function NewBookingPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name").order("name");
  const { data: warehouses } = await supabase.from("warehouses").select("id, name").order("name");
  const { data: materials } = await supabase.from("raw_materials").select("id, material_name").order("material_name");

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">নতুন Booking</h1>
      <BookingForm customers={customers ?? []} warehouses={warehouses ?? []} materials={materials ?? []} />
    </div>
  );
}