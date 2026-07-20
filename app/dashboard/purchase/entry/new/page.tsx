import { createClient } from "@/lib/supabase/server";
import PurchaseEntryForm from "./PurchaseEntryForm";

export default async function NewPurchaseEntryPage() {
  const supabase = await createClient();
  const { data: suppliers } = await supabase.from("suppliers").select("id, name").order("name");
  const { data: warehouses } = await supabase.from("warehouses").select("id, name").order("name");
  const { data: materials } = await supabase.from("raw_materials").select("id, material_name").order("material_name");

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">নতুন Purchase Entry</h1>
      <PurchaseEntryForm
        suppliers={suppliers ?? []}
        warehouses={warehouses ?? []}
        materials={materials ?? []}
      />
    </div>
  );
}