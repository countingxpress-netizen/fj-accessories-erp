import { createClient } from "@/lib/supabase/server";
import AddWarehouseForm from "./AddWarehouseForm";
import WarehouseRow from "./WarehouseRow";
import Link from "next/link";

export default async function WarehousesPage() {
  const supabase = await createClient();
  const { data: warehouses } = await supabase.from("warehouses").select("*").order("name");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Warehouses</h1>
        <Link href="/dashboard/inventory" className="text-sm text-gray-500 hover:underline">
          ← Inventory-এ ফিরুন
        </Link>
      </div>

      <AddWarehouseForm />

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Location</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(warehouses ?? []).map((w) => (
              <WarehouseRow key={w.id} warehouse={w} />
            ))}
            {(!warehouses || warehouses.length === 0) && (
              <tr>
                <td colSpan={3} className="px-4 py-3 text-gray-400 italic">
                  কোনো গুদাম যোগ করা হয়নি
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}