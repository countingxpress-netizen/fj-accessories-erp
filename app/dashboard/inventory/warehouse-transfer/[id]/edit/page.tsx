import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import EditTransferForm from "./EditTransferForm";

export default async function EditWarehouseTransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: transfer }, { data: warehouses }, { data: materials }] = await Promise.all([
    supabase.from("warehouse_transfers").select("*").eq("id", id).single(),
    supabase.from("warehouses").select("id, name").order("name"),
    supabase.from("raw_materials").select("id, material_name").order("material_name"),
  ]);

  if (!transfer) return notFound();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Transfer এডিট করুন — {transfer.transfer_no}</h1>
        <Link href="/dashboard/inventory/warehouse-transfer" className="text-sm text-gray-500 hover:underline">
          ← তালিকায় ফিরুন
        </Link>
      </div>
      <EditTransferForm transfer={transfer} warehouses={warehouses ?? []} materials={materials ?? []} />
    </div>
  );
}
