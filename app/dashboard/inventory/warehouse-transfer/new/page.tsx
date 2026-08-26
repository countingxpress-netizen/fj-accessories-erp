import { createClient } from "@/lib/supabase/server";
import TransferForm from "../TransferForm";
import Link from "next/link";

export default async function NewWarehouseTransferPage() {
  const supabase = await createClient();
  const [{ data: warehouses }, { data: materials }] = await Promise.all([
    supabase.from("warehouses").select("id, name").order("name"),
    supabase.from("raw_materials").select("id, material_name").order("material_name"),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">নতুন Warehouse Transfer</h1>
        <Link href="/dashboard/inventory/warehouse-transfer" className="text-sm text-gray-500 hover:underline">
          ← তালিকায় ফিরুন
        </Link>
      </div>
      <TransferForm warehouses={warehouses ?? []} materials={materials ?? []} />
    </div>
  );
}
