import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const LBS_PER_BAG = 55;

export default async function StockReportPage() {
  const supabase = await createClient();

  const { data: materials } = await supabase.from("raw_materials").select("id, material_name").order("material_name");
  const { data: rawStock } = await supabase.from("raw_material_stock").select("material_id, quantity_lbs");
  const { data: products } = await supabase.from("finished_goods").select("id, product_name").order("product_name");
  const { data: fgStock } = await supabase.from("finished_goods_stock").select("product_id, quantity_pcs");

  const rawTotals: Record<string, number> = {};
  (rawStock ?? []).forEach((s) => { rawTotals[s.material_id] = (rawTotals[s.material_id] ?? 0) + s.quantity_lbs; });

  const fgTotals: Record<string, number> = {};
  (fgStock ?? []).forEach((s) => { fgTotals[s.product_id] = (fgTotals[s.product_id] ?? 0) + s.quantity_pcs; });

  const totalRawLbs = Object.values(rawTotals).reduce((s, v) => s + v, 0);
  const totalFgPcs = Object.values(fgTotals).reduce((s, v) => s + v, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Stock Report</h1>
        <Link href="/dashboard/reports" className="text-sm text-gray-500 hover:underline">← Reports-এ ফিরুন</Link>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Raw Material</p>
          <p className="text-lg font-semibold">{totalRawLbs.toFixed(2)} Lbs</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Finished Goods</p>
          <p className="text-lg font-semibold">{totalFgPcs.toLocaleString()} Pcs</p>
        </div>
      </div>

      <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">Raw Material Stock</h2>
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Material</th>
              <th className="px-4 py-2 text-right">Lbs</th>
              <th className="px-4 py-2 text-right">Kg</th>
              <th className="px-4 py-2 text-right">Bags</th>
            </tr>
          </thead>
          <tbody>
            {(materials ?? []).map((m) => {
              const lbs = rawTotals[m.id] ?? 0;
              return (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-2">
                    <Link href={`/dashboard/inventory/raw-material/${m.id}`} className="hover:underline hover:text-blue-700">{m.material_name}</Link>
                  </td>
                  <td className="px-4 py-2 text-right">{lbs.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">{(lbs * 0.453592).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">{(lbs / LBS_PER_BAG).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">Finished Goods Stock</h2>
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2 text-right">Quantity (Pcs)</th>
            </tr>
          </thead>
          <tbody>
            {(products ?? []).map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-2">{p.product_name}</td>
                <td className="px-4 py-2 text-right">{(fgTotals[p.id] ?? 0).toLocaleString()}</td>
              </tr>
            ))}
            {(!products || products.length === 0) && (
              <tr><td colSpan={2} className="px-4 py-3 text-gray-400 italic">কোনো পণ্য নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}