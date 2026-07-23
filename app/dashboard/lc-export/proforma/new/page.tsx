import { createClient } from "@/lib/supabase/server";
import ProformaForm from "./ProformaForm";

export default async function NewProformaPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name, price_per_lbs").order("name");

  const { data: allBookings } = await supabase
    .from("bookings")
    .select("id, booking_no, quantity_pcs, product_id, customer_id, style, buyers(name), merchants(name), finished_goods(product_name, length_cm, width_cm, thickness)")
    .order("booking_date", { ascending: false });

  const { data: usedBookings } = await supabase.from("pi_bookings").select("booking_id");
  const usedIds = new Set((usedBookings ?? []).map((pb: any) => pb.booking_id));
  const availableBookings = (allBookings ?? []).filter((b: any) => !usedIds.has(b.id));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">নতুন Proforma Invoice</h1>
      <ProformaForm customers={customers ?? []} bookings={availableBookings as any} />
    </div>
  );
}