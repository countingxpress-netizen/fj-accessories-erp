import { createClient } from "@/lib/supabase/server";
import ProductionOrderForm from "./ProductionOrderForm";
import { fetchAllRows } from "@/lib/fetchAll";

export default async function NewProductionOrderPage() {
  const supabase = await createClient();

  const bookings = await fetchAllRows<any>(
    supabase, "bookings", "id, booking_no, quantity_pcs, required_lbs, customers(name), finished_goods(product_name)",
    (q) => q.eq("status", "open").order("booking_date", { ascending: false })
  );

  const { data: materials } = await supabase.from("raw_materials").select("id, material_name").order("material_name");
  const { data: warehouses } = await supabase.from("warehouses").select("id, name").order("name");

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">নতুন Production Order</h1>
      <ProductionOrderForm
        bookings={(bookings ?? []) as any}
        materials={materials ?? []}
        warehouses={warehouses ?? []}
      />
    </div>
  );
}