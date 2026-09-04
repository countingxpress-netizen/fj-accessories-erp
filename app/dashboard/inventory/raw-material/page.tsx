import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import StockAdjustmentForm from "./StockAdjustmentForm";
import AddRawMaterialForm from "./AddRawMaterialForm";
import RawMaterialRow from "./RawMaterialRow";
import { money } from "@/lib/format";

const LBS_PER_BAG = 55;

export default async function RawMaterialStockPage() {
  const supabase = await createClient();

  const { data: materials } = await supabase
    .from("raw_materials")
    .select("id, material_name, unit, reorder_level_lbs, inventory_account_code, avg_cost_per_lbs")
    .order("material_name");
  const { data: warehouses } = await supabase.from("warehouses").select("id, name").order("name");
  const { data: stock } = await supabase
    .from("raw_material_stock")
    .select("*, raw_materials(material_name), warehouses(name)");

  // কাঁচামালের inventory account বাছাইয়ের জন্য — সাধারণত 1200–1203 + 1299
  let { data: invAccounts } = await supabase
    .from("chart_of_accounts")
    .select("account_code, account_name")
    .eq("account_type", "asset")
    .ilike("account_name", "%raw material inventory%")
    .order("account_code");
  if (!invAccounts || invAccounts.length === 0) {
    ({ data: invAccounts } = await supabase
      .from("chart_of_accounts")
      .select("account_code, account_name")
      .eq("account_type", "asset")
      .order("account_code"));
  }
  const accounts = invAccounts ?? [];

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

      <AddRawMaterialForm accounts={accounts} />

      <div className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">Materials</h2>
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Unit</th>
                <th className="px-4 py-2 text-right">Reorder (Lbs)</th>
                <th className="px-4 py-2">Inventory Account</th>
                <th className="px-4 py-2 text-right">Avg Cost / Lb</th>
                <th className="px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {(materials ?? []).map((m) => (
                <RawMaterialRow
                  key={m.id}
                  material={m}
                  accounts={accounts}
                  stockLbs={grouped[m.id]?.total ?? 0}
                />
              ))}
              {(!materials || materials.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-gray-400 italic">
                    কোনো Raw Material নেই — উপরের ফর্ম থেকে যোগ করুন
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
                  <span className="font-medium">{money(data.total)} Lbs</span>
                  <span>≈ {money(totalKg)} Kg</span>
                  <span>≈ {money(totalBags)} Bags</span>
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
                      <td className="px-4 py-2 text-right">{money(r.quantity_lbs)}</td>
                      <td className="px-4 py-2 text-right">{money((r.quantity_lbs * 0.453592))}</td>
                      <td className="px-4 py-2 text-right">{money((r.quantity_lbs / LBS_PER_BAG))}</td>
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
