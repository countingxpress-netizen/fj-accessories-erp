import { createClient } from "@/lib/supabase/server";
import ProformaForm from "./ProformaForm";

export default async function NewProformaPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name, price_per_lbs").order("name");
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, booking_no, quantity_pcs, product_id, customer_id, style, buyers(name), merchants(name), finished_goods(product_name, length_cm, width_cm, thickness)")
    .order("booking_date", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">নতুন Proforma Invoice</h1>
      <ProformaForm customers={customers ?? []} bookings={(bookings ?? []) as any} />
    </div>
  );
}