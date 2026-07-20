import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import StockAdjustmentForm from "./StockAdjustmentForm";

const LBS_PER_BAG = 55;
const KG_PER_BAG = 25;

export default async function RawMaterialStockPage() {
  const supabase = await createClient();

  const { data: materials } = await supabase.from("raw_materials").select("id, material_name").order("material_name");
  const { data: warehouses } = await supabase.from("warehouses").select("id, name").order("name");
  const { data: stock } = await supabase
    .from("raw_material_stock")
    .select("*, raw_materials(material_name), warehouses(name)");

  // material অনুযায়ী গ্রুপ করুন, প্রতিটার নিচে warehouse-wise breakdown
  const grouped: Record<string, { name: string; rows: any[]; total: number }> = {};
  (materials ?? []).forEach((m) => {
    grouped[m.id] = { name: m.material_name, rows: [], total: 0 };
  });
  (stock ?? []).forEach((s: any) => {
    if (!grouped[s.material_id]) return;
    grouped[s.material_id].rows.push(s);
    grouped[s.material_id].total += s.quantity_lbs || 0;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Raw Material Stock</h1>
        <Link href="/dashboard/inventory" className="text-sm text-gray-500 hover:underline">
          ← Inventory-এ ফিরুন
        </Link>
      </div>

      <StockAdjustmentForm materials={materials ?? []} warehouses={warehouses ?? []} />

      <div className="space-y-6">
        {Object.entries(grouped).map(([id, data]) => {
          const totalKg = data.total * 0.453592;
          const totalBags = data.total / LBS_PER_BAG;
          return (
            <div key={id} className="overflow-hidden rounded-xl border bg-white shadow-sm">
              <div className="flex items-center justify-between bg-gray-50 px-4 py-3">
                <Link href={`/dashboard/inventory/raw-material/${id}`} className="font-semibold text-gray-800 hover:underline hover:text-blue-700">
                  {data.name}
                </Link>
                <div className="text-sm text-gray-600 space-x-4">
                  <span className="font-medium">{data.total.toFixed(2)} Lbs</span>
                  <span>≈ {totalKg.toFixed(2)} Kg</span>
                  <span>≈ {totalBags.toFixed(2)} Bags</span>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500 border-t">
                  <tr>
                    <th className="px-4 py-2">Warehouse</th>
                    <th className="px-4 py-2 text-right">Lbs</th>
                    <th className="px-4 py-2 text-right">Kg</th>
                    <th className="px-4 py-2 text-right">Bags</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-4 py-2">{r.warehouses?.name ?? "-"}</td>
                      <td className="px-4 py-2 text-right">{r.quantity_lbs.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{(r.quantity_lbs * 0.453592).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{(r.quantity_lbs / LBS_PER_BAG).toFixed(2)}</td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-gray-400 italic">কোনো স্টক নেই</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Conversion: 1 Bag = 25 Kg = 55 Lbs
      </p>
    </div>
  );
}