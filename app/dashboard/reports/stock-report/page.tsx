import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const LBS_PER_BAG = 55;
const money = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function StockReportPage() {
  const supabase = await createClient();

  const { data: materials } = await supabase.from("raw_materials").select("id, material_name, avg_cost_per_lbs").order("material_name");
  const { data: rawStock } = await supabase.from("raw_material_stock").select("material_id, quantity_lbs");
  const { data: products } = await supabase.from("finished_goods").select("id, product_name, avg_cost_per_pc").order("product_name");
  const { data: fgStock } = await supabase.from("finished_goods_stock").select("product_id, quantity_pcs");

  const rawTotals: Record<string, number> = {};
  (rawStock ?? []).forEach((s) => { rawTotals[s.material_id] = (rawTotals[s.material_id] ?? 0) + s.quantity_lbs; });

  const fgTotals: Record<string, number> = {};
  (fgStock ?? []).forEach((s) => { fgTotals[s.product_id] = (fgTotals[s.product_id] ?? 0) + s.quantity_pcs; });

  const totalRawLbs = Object.values(rawTotals).reduce((s, v) => s + v, 0);
  const totalFgPcs = Object.values(fgTotals).reduce((s, v) => s + v, 0);

  const rawValue = (materials ?? []).reduce((s, m: any) => s + (rawTotals[m.id] ?? 0) * (Number(m.avg_cost_per_lbs) || 0), 0);
  const fgValue = (products ?? []).reduce((s, p: any) => s + (fgTotals[p.id] ?? 0) * (Number(p.avg_cost_per_pc) || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Stock Report</h1>
        <Link href="/dashboard/reports" className="text-sm text-gray-500 hover:underline">← Reports-এ ফিরুন</Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Raw Material</p>
          <p className="text-lg font-semibold">{money(totalRawLbs)} Lbs</p>
          <p className="text-xs text-gray-500">মূল্য ৳{money(rawValue)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Finished Goods</p>
          <p className="text-lg font-semibold">{totalFgPcs.toLocaleString("en-IN")} Pcs</p>
          <p className="text-xs text-gray-500">মূল্য ৳{money(fgValue)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">মোট ইনভেন্টরি মূল্য</p>
          <p className="text-lg font-semibold">৳{money(rawValue + fgValue)}</p>
          <p className="text-xs text-gray-400">গড় খরচ অনুযায়ী (WIP বাদে)</p>
        </div>
      </div>

      <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">Raw Material Stock</h2>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm mb-6">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Material</th>
              <th className="px-4 py-2 text-right">Lbs</th>
              <th className="px-4 py-2 text-right">Kg</th>
              <th className="px-4 py-2 text-right">Bags</th>
              <th className="px-4 py-2 text-right">গড় খরচ / Lb</th>
              <th className="px-4 py-2 text-right">মূল্য</th>
            </tr>
          </thead>
          <tbody>
            {(materials ?? []).map((m: any) => {
              const lbs = rawTotals[m.id] ?? 0;
              const cost = Number(m.avg_cost_per_lbs) || 0;
              return (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-2">
                    <Link href={`/dashboard/inventory/raw-material/${m.id}`} className="hover:underline hover:text-blue-700">{m.material_name}</Link>
                  </td>
                  <td className="px-4 py-2 text-right">{money(lbs)}</td>
                  <td className="px-4 py-2 text-right">{money((lbs * 0.453592))}</td>
                  <td className="px-4 py-2 text-right">{money((lbs / LBS_PER_BAG))}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{cost ? cost.toFixed(4) : "—"}</td>
                  <td className="px-4 py-2 text-right">{money(lbs * cost)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 font-semibold">
            <tr><td className="px-4 py-2" colSpan={5}>মোট</td><td className="px-4 py-2 text-right">৳{money(rawValue)}</td></tr>
          </tfoot>
        </table>
      </div>

      <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">Finished Goods Stock</h2>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm min-w-[480px]">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2 text-right">Quantity (Pcs)</th>
              <th className="px-4 py-2 text-right">গড় খরচ / Pc</th>
              <th className="px-4 py-2 text-right">মূল্য</th>
            </tr>
          </thead>
          <tbody>
            {(products ?? []).map((p: any) => {
              const pcs = fgTotals[p.id] ?? 0;
              const cost = Number(p.avg_cost_per_pc) || 0;
              return (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2">{p.product_name}</td>
                  <td className="px-4 py-2 text-right">{pcs.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{cost ? cost.toFixed(4) : "—"}</td>
                  <td className="px-4 py-2 text-right">{money(pcs * cost)}</td>
                </tr>
              );
            })}
            {(!products || products.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-3 text-gray-400 italic">কোনো পণ্য নেই</td></tr>
            )}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 font-semibold">
            <tr><td className="px-4 py-2" colSpan={3}>মোট</td><td className="px-4 py-2 text-right">৳{money(fgValue)}</td></tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
