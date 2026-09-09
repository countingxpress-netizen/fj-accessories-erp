import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";
import WastageSaleForm from "./WastageSaleForm";
import WastageSaleRow from "./WastageSaleRow";

export default async function WastageSalePage() {
  const supabase = await createClient();

  const [{ data: customers }, { data: cashBankAccounts }, { data: warehouses }, { data: recycled }, { data: wastages }, { data: soldFromWastage }] =
    await Promise.all([
      supabase.from("customers").select("id, name").order("name"),
      supabase.from("chart_of_accounts").select("id, account_code, account_name")
        .eq("account_type", "asset")
        .or("account_name.ilike.%cash%,account_name.ilike.%bank%")
        .order("account_code"),
      supabase.from("warehouses").select("id, name").order("name"),
      supabase.from("raw_materials").select("id, avg_cost_per_lbs").eq("material_name", "Recycled Chips").maybeSingle(),
      supabase.from("wastage").select("quantity_lbs, recycled"),
      supabase.from("wastage_sales").select("quantity_lbs").eq("source", "wastage_stock"),
    ]);

  // "Wastage stock" = রেকর্ড করা non-recycled wastage − এই উৎস থেকে আগের বিক্রি
  const recordedNonRecycled = (wastages ?? [])
    .filter((w: any) => !w.recycled)
    .reduce((s: number, w: any) => s + Number(w.quantity_lbs || 0), 0);
  const soldWastageLbs = (soldFromWastage ?? []).reduce((s: number, r: any) => s + Number(r.quantity_lbs || 0), 0);
  const availableWastageLbs = Math.round((recordedNonRecycled - soldWastageLbs) * 100) / 100;

  let recycledStock: { warehouse_id: string; quantity_lbs: number }[] = [];
  if (recycled?.id) {
    const { data: stock } = await supabase
      .from("raw_material_stock").select("warehouse_id, quantity_lbs").eq("material_id", recycled.id);
    recycledStock = stock ?? [];
  }
  const totalRecycledLbs = recycledStock.reduce((s, r) => s + Number(r.quantity_lbs || 0), 0);

  const { data: sales } = await supabase
    .from("wastage_sales")
    .select("*, warehouses(name), customers(name), deposit:chart_of_accounts!wastage_sales_deposit_account_id_fkey(account_code, account_name), creator:app_users!wastage_sales_created_by_fkey(full_name)")
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false });

  const totalSales = (sales ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
  const totalCogs = (sales ?? []).reduce((s: number, r: any) => s + Number(r.cogs_amount || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Wastage / Scrap বিক্রি</h1>
        <Link href="/dashboard/production" className="text-sm text-gray-500 hover:underline">← Production-এ ফিরুন</Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">মোট বিক্রি</p>
          <p className="text-lg font-semibold">{money(totalSales)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">মোট COGS (Recycled থেকে)</p>
          <p className="text-lg font-semibold">{money(totalCogs)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Wastage stock (non-recycled)</p>
          <p className="text-lg font-semibold">{money(availableWastageLbs)} Lbs</p>
          <p className="text-xs text-gray-400">রেকর্ড {money(recordedNonRecycled)} − বিক্রি {money(soldWastageLbs)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Recycled Chips স্টক</p>
          <p className="text-lg font-semibold">{money(totalRecycledLbs)} Lbs</p>
          <p className="text-xs text-gray-400">avg {money(Number(recycled?.avg_cost_per_lbs || 0))}/Lbs</p>
        </div>
      </div>

      <WastageSaleForm
        customers={customers ?? []}
        cashBankAccounts={cashBankAccounts ?? []}
        warehouses={warehouses ?? []}
        availableWastageLbs={availableWastageLbs}
        recycledStockByWarehouse={Object.fromEntries(recycledStock.map((r) => [r.warehouse_id, Number(r.quantity_lbs || 0)]))}
        recycledAvgCost={Number(recycled?.avg_cost_per_lbs || 0)}
      />

      <div className="mt-6 overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Sale No</th>
              <th className="px-4 py-2">উৎস</th>
              <th className="px-4 py-2">কার কাছে</th>
              <th className="px-4 py-2 text-right">Qty (Lbs)</th>
              <th className="px-4 py-2 text-right">Rate</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2 text-right">COGS</th>
              <th className="px-4 py-2">পেমেন্ট</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(sales ?? []).map((s: any) => (
              <WastageSaleRow key={s.id} sale={s} />
            ))}
            {(!sales || sales.length === 0) && (
              <tr><td colSpan={10} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Wastage বিক্রি নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
