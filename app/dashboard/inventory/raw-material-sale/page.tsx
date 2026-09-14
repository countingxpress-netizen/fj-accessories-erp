import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";
import RawMaterialSaleForm from "./RawMaterialSaleForm";
import RawMaterialSaleRow from "./RawMaterialSaleRow";

export default async function RawMaterialSalePage() {
  const supabase = await createClient();

  const [{ data: materials }, { data: customers }, { data: partyAccounts }, { data: warehouses }, { data: stock }] =
    await Promise.all([
      supabase.from("raw_materials").select("id, material_name, avg_cost_per_lbs").order("material_name"),
      supabase.from("customers").select("id, name").order("name"),
      supabase.from("chart_of_accounts").select("id, account_code, account_name, account_type")
        .in("account_type", ["asset", "liability", "equity", "income"])
        .order("account_code"),
      supabase.from("warehouses").select("id, name").order("name"),
      supabase.from("raw_material_stock").select("material_id, warehouse_id, quantity_lbs"),
    ]);

  // material → warehouse → quantity_lbs
  const stockMap: Record<string, Record<string, number>> = {};
  (stock ?? []).forEach((s: any) => {
    (stockMap[s.material_id] ||= {})[s.warehouse_id] = Number(s.quantity_lbs || 0);
  });
  const totalByMaterial: Record<string, number> = {};
  (stock ?? []).forEach((s: any) => {
    totalByMaterial[s.material_id] = (totalByMaterial[s.material_id] ?? 0) + Number(s.quantity_lbs || 0);
  });

  const { data: sales } = await supabase
    .from("raw_material_sales")
    .select("*, raw_materials(material_name), warehouses(name), customers(name), party:chart_of_accounts!raw_material_sales_party_account_id_fkey(account_code, account_name), creator:app_users!raw_material_sales_created_by_fkey(full_name)")
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false });

  const totalSales = (sales ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
  const totalCogs = (sales ?? []).reduce((s: number, r: any) => s + Number(r.cogs_amount || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Raw Material সরাসরি বিক্রি</h1>
        <Link href="/dashboard/inventory" className="text-sm text-gray-500 hover:underline">← Inventory-এ ফিরুন</Link>
      </div>
      <p className="text-sm text-gray-500 -mt-3 mb-4">
        উৎপাদনে না দিয়ে কাঁচামাল (LLDPE/LDPE/PP/Recycled Chips ইত্যাদি) সরাসরি স্টক থেকে কোনো কাস্টমার/পার্টির কাছে বিক্রি —
        স্টক কমবে ও avg cost অনুযায়ী COGS পোস্ট হবে। শুধু ওয়েস্টেজ/স্ক্র্যাপ মাল বিক্রি হলে{" "}
        <Link href="/dashboard/production/wastage-sale" className="text-blue-600 hover:underline">Wastage / Scrap বিক্রি</Link> ব্যবহার করুন।
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">মোট বিক্রি</p>
          <p className="text-lg font-semibold">{money(totalSales)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">মোট COGS</p>
          <p className="text-lg font-semibold">{money(totalCogs)}</p>
        </div>
        {(materials ?? []).slice(0, 2).map((m: any) => (
          <div key={m.id} className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">{m.material_name} স্টক</p>
            <p className="text-lg font-semibold">{money(totalByMaterial[m.id] ?? 0)} Lbs</p>
            <p className="text-xs text-gray-400">avg {money(Number(m.avg_cost_per_lbs || 0))}/Lbs</p>
          </div>
        ))}
      </div>

      {(materials ?? []).length > 2 && (
        <div className="mb-6 overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-2">Material</th>
                <th className="px-4 py-2 text-right">স্টক (Lbs)</th>
                <th className="px-4 py-2 text-right">Avg Cost / Lbs</th>
              </tr>
            </thead>
            <tbody>
              {(materials ?? []).map((m: any) => (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-2">{m.material_name}</td>
                  <td className="px-4 py-2 text-right">{money(totalByMaterial[m.id] ?? 0)}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{money(Number(m.avg_cost_per_lbs || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RawMaterialSaleForm
        materials={materials ?? []}
        customers={customers ?? []}
        partyAccounts={partyAccounts ?? []}
        warehouses={warehouses ?? []}
        stockMap={stockMap}
      />

      <div className="mt-6 overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Sale No</th>
              <th className="px-4 py-2">Material</th>
              <th className="px-4 py-2">কার কাছে</th>
              <th className="px-4 py-2 text-right">Quantity</th>
              <th className="px-4 py-2 text-right">Rate</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2 text-right">COGS</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(sales ?? []).map((s: any) => (
              <RawMaterialSaleRow key={s.id} sale={s} />
            ))}
            {(!sales || sales.length === 0) && (
              <tr><td colSpan={9} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Raw Material বিক্রি নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
