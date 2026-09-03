import { createClient } from "@/lib/supabase/server";
import AddWarehouseForm from "./AddWarehouseForm";
import WarehouseRow from "./WarehouseRow";
import Link from "next/link";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function WarehousesPage() {
  const supabase = await createClient();
  const { data: warehouses } = await supabase.from("warehouses").select("*").order("name");

  // প্রতি গুদামে কাঁচামালের LBS + গড় খরচে মূল্য
  const { data: rmMaterials } = await supabase.from("raw_materials").select("id, avg_cost_per_lbs");
  const rmCostById = new Map<string, number>((rmMaterials ?? []).map((m: any) => [m.id, Number(m.avg_cost_per_lbs) || 0]));
  const { data: rmStock } = await supabase.from("raw_material_stock").select("material_id, warehouse_id, quantity_lbs");

  const byWarehouse = new Map<string, { lbs: number; value: number }>();
  (rmStock ?? []).forEach((s: any) => {
    if (!s.warehouse_id) return;
    const q = Number(s.quantity_lbs) || 0;
    const cur = byWarehouse.get(s.warehouse_id) ?? { lbs: 0, value: 0 };
    cur.lbs += q;
    cur.value += q * (rmCostById.get(s.material_id) ?? 0);
    byWarehouse.set(s.warehouse_id, cur);
  });

  const totalLbs = [...byWarehouse.values()].reduce((s, v) => s + v.lbs, 0);
  const totalValue = [...byWarehouse.values()].reduce((s, v) => s + v.value, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Warehouses</h1>
        <Link href="/dashboard/inventory" className="text-sm text-gray-500 hover:underline">
          ← Inventory-এ ফিরুন
        </Link>
      </div>

      <AddWarehouseForm />

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Location</th>
              <th className="px-4 py-2 text-right">কাঁচামাল (Lbs)</th>
              <th className="px-4 py-2 text-right">মূল্য (৳)</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(warehouses ?? []).map((w) => {
              const st = byWarehouse.get(w.id) ?? { lbs: 0, value: 0 };
              return <WarehouseRow key={w.id} warehouse={w} stockLbs={st.lbs} stockValue={st.value} />;
            })}
            {(!warehouses || warehouses.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-3 text-gray-400 italic">
                  কোনো গুদাম যোগ করা হয়নি
                </td>
              </tr>
            )}
          </tbody>
          {(warehouses ?? []).length > 0 && (
            <tfoot className="bg-gray-50 border-t-2 font-semibold">
              <tr>
                <td className="px-4 py-2" colSpan={2}>মোট</td>
                <td className="px-4 py-2 text-right">{fmt(totalLbs)}</td>
                <td className="px-4 py-2 text-right">৳{fmt(totalValue)}</td>
                <td className="px-4 py-2" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-400">
        মূল্য = প্রতিটি কাঁচামালের গড় খরচ (avg cost / lb) অনুযায়ী। Finished Goods (pcs) এখানে ধরা হয়নি।
      </p>
    </div>
  );
}
