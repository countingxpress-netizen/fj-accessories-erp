import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";

const referenceLabels: Record<string, string> = {
  manual_adjustment: "Manual Adjustment",
  purchase: "Purchase Entry",
  production: "Production",
  delivery: "Delivery",
  wastage: "Wastage",
};

export default async function StockLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ itemType?: string; from?: string; to?: string }>;
}) {
  const { itemType, from, to } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("stock_ledger")
    .select("*, warehouses(name)")
    .order("txn_date", { ascending: false });

  if (itemType) query = query.eq("item_type", itemType);
  if (from) query = query.gte("txn_date", from);
  if (to) query = query.lte("txn_date", to);

  const { data: entries } = await query;

  // item_id দিয়ে raw_materials বা finished_goods থেকে নাম বের করতে হবে
  const rawMaterialIds = (entries ?? [])
    .filter((e) => e.item_type === "raw_material")
    .map((e) => e.item_id);
  const finishedGoodsIds = (entries ?? [])
    .filter((e) => e.item_type === "finished_goods")
    .map((e) => e.item_id);

  const { data: materials } = rawMaterialIds.length
    ? await supabase.from("raw_materials").select("id, material_name").in("id", rawMaterialIds)
    : { data: [] };
  const { data: products } = finishedGoodsIds.length
    ? await supabase.from("finished_goods").select("id, product_name").in("id", finishedGoodsIds)
    : { data: [] };

  const nameMap: Record<string, string> = {};
  (materials ?? []).forEach((m) => (nameMap[m.id] = m.material_name));
  (products ?? []).forEach((p) => (nameMap[p.id] = p.product_name));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Stock Ledger</h1>
        <Link href="/dashboard/inventory" className="text-sm text-gray-500 hover:underline">
          ← Inventory-এ ফিরুন
        </Link>
      </div>

      <form className="mb-4 flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Item Type</label>
          <select name="itemType" defaultValue={itemType} className="rounded-lg border px-3 py-2 text-sm">
            <option value="">সব</option>
            <option value="raw_material">Raw Material</option>
            <option value="finished_goods">Finished Goods</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" name="from" defaultValue={from} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" name="to" defaultValue={to} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
          ফিল্টার করুন
        </button>
        {(itemType || from || to) && (
          <Link href="/dashboard/inventory/stock-ledger" className="text-sm text-gray-500 hover:underline">
            রিসেট করুন
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Item</th>
              <th className="px-4 py-2">Warehouse</th>
              <th className="px-4 py-2">In/Out</th>
              <th className="px-4 py-2 text-right">Quantity</th>
              <th className="px-4 py-2">Reference</th>
            </tr>
          </thead>
          <tbody>
            {(entries ?? []).map((e: any) => (
              <tr key={e.id} className="border-t">
                <td className="px-4 py-2 text-gray-500">{e.txn_date}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    e.item_type === "raw_material" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
                  }`}>
                    {e.item_type === "raw_material" ? "Raw Material" : "Finished Goods"}
                  </span>
                </td>
                <td className="px-4 py-2">{nameMap[e.item_id] ?? "-"}</td>
                <td className="px-4 py-2 text-gray-500">{e.warehouses?.name ?? "-"}</td>
                <td className="px-4 py-2">
                  <span className={e.txn_type === "in" ? "text-green-700" : "text-red-700"}>
                    {e.txn_type === "in" ? "In ↑" : "Out ↓"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">{e.quantity.toFixed(2)}</td>
                <td className="px-4 py-2 text-gray-500">
                  {referenceLabels[e.reference_type] ?? e.reference_type ?? "-"}
                </td>
              </tr>
            ))}
            {(!entries || entries.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-3 text-gray-400 italic">
                  এই ফিল্টারে কোনো স্টক লেনদেন নেই
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}