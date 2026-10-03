/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import StockAdjustmentForm from "./StockAdjustmentForm";
import AddRawMaterialForm from "./AddRawMaterialForm";
import RawMaterialRow from "./RawMaterialRow";
import { money } from "@/lib/format";
import { fetchAllRows } from "@/lib/fetchAll";
import { resolveDatePreset, periodAsOf, datePresetLabel, formatLongDate } from "@/lib/datePresets";
import DateRangeFields from "@/components/DateRangeFields";
import AutoSubmitForm from "@/components/AutoSubmitForm";

const LBS_PER_BAG = 55;

// স্টক অংশে ফিল্টার (অটো-লোড): Date Range + Material।
//   স্টক = বাছাই করা সময়ের শেষ দিন পর্যন্ত (ডিফল্ট All Time = আজকের স্টক) — আজকের স্টক থেকে পরের
//   stock_ledger চলাচল উল্টে (Stock Report-এর মতো)।
//   সময়ের শুরু থাকলে নিচের মোট টেবিলে ঐ সময়ের Opening / ক্রয় / Production-এ ব্যবহার / অন্যান্য / Closing।
export default async function RawMaterialStockPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; material?: string }>;
}) {
  const sp = await searchParams;
  const period = resolveDatePreset(sp.range, sp.from, sp.to, "all");
  const asOf = periodAsOf(period);
  const from = period.from;
  const materialFilter = sp.material ?? "";
  const supabase = await createClient();

  const { data: materials } = await supabase
    .from("raw_materials")
    .select("id, material_name, unit, reorder_level_lbs, inventory_account_code, avg_cost_per_lbs")
    .order("material_name");
  const { data: warehouses } = await supabase.from("warehouses").select("id, name").order("name");
  const { data: stock } = await supabase
    .from("raw_material_stock")
    .select("*, raw_materials(material_name), warehouses(name)");

  // কাঁচামালের inventory account বাছাইয়ের জন্য — সাধারণত 1200–1203 + 1204 (Adhesive) + 1299
  let { data: invAccounts } = await supabase
    .from("chart_of_accounts")
    .select("account_code, account_name")
    .eq("account_type", "asset")
    .or("account_name.ilike.%raw material inventory%,account_code.eq.1204")
    .order("account_code");
  if (!invAccounts || invAccounts.length === 0) {
    ({ data: invAccounts } = await supabase
      .from("chart_of_accounts")
      .select("account_code, account_name")
      .eq("account_type", "asset")
      .order("account_code"));
  }
  const accounts = invAccounts ?? [];

  // ── সময়ের শুরু থেকে (বা শেষ দিনের পরের) stock_ledger চলাচল ──
  const moves: any[] = from || asOf
    ? await fetchAllRows<any>(
        supabase, "stock_ledger", "item_id, warehouse_id, txn_type, quantity, txn_date, reference_type",
        (q) => (from ? q.eq("item_type", "raw_material").gte("txn_date", from) : q.eq("item_type", "raw_material").gt("txn_date", asOf)),
      )
    : [];
  const signed = (l: any) => (l.txn_type === "in" ? 1 : l.txn_type === "out" ? -1 : 0) * (Number(l.quantity) || 0);
  const isLater = (d: string) => !!asOf && d > asOf;
  const laterByMatWh = new Map<string, number>();
  const mv: Record<string, { purchase: number; production: number; other: number }> = {};
  moves.forEach((l) => {
    const n = signed(l);
    if (isLater(l.txn_date)) {
      const k = `${l.item_id}|${l.warehouse_id}`;
      laterByMatWh.set(k, (laterByMatWh.get(k) ?? 0) + n);
      return;
    }
    const m = (mv[l.item_id] ??= { purchase: 0, production: 0, other: 0 });
    if (l.reference_type === "purchase") m.purchase += n;
    else if (l.reference_type === "production") m.production += n;
    else m.other += n;
  });

  // material অনুযায়ী গ্রুপ, প্রতিটার নিচে warehouse-wise — qty = শেষ দিন পর্যন্ত; curTotal = আজকের (Delete-এর জন্য)
  const grouped: Record<string, { name: string; unit: string; rows: { id: string; warehouse_id: string; whName: string; qty: number }[]; total: number; curTotal: number }> = {};
  (materials ?? []).forEach((m) => {
    grouped[m.id] = { name: m.material_name, unit: m.unit ?? "lbs", rows: [], total: 0, curTotal: 0 };
  });
  (stock ?? []).forEach((s: any) => {
    const g = grouped[s.material_id];
    if (!g) return;
    const cur = Number(s.quantity_lbs) || 0;
    const qty = cur - (laterByMatWh.get(`${s.material_id}|${s.warehouse_id}`) ?? 0);
    g.rows.push({ id: s.id, warehouse_id: s.warehouse_id, whName: s.warehouses?.name ?? "-", qty });
    g.total += qty;
    g.curTotal += cur;
  });

  const shownEntries = Object.entries(grouped).filter(([id]) => !materialFilter || id === materialFilter);

  // সব material-এর মোট (একদম নিচের টেবিল) — Lbs-এর material গুদাম-ভিত্তিক; কার্টনের (Adhesive) Lbs-এ যোগ হয় না
  const hasMove = (id: string) => !!mv[id] && Object.values(mv[id]).some((v) => Math.abs(v) > 0.001);
  const lbsGroups = shownEntries.filter(([id, g]) => g.unit !== "carton" && (Math.abs(g.total) > 0.001 || (from && hasMove(id))));
  const cartonGroups = shownEntries.filter(([, g]) => g.unit === "carton" && Math.abs(g.total) > 0.001).map(([, g]) => g);
  const qtyAt = (g: (typeof grouped)[string], whId: string) =>
    g.rows.filter((r) => r.warehouse_id === whId).reduce((t, r) => t + r.qty, 0);
  const summaryWarehouses = (warehouses ?? []).filter((w) => lbsGroups.some(([, g]) => Math.abs(qtyAt(g, w.id)) > 0.001));
  const grandLbs = lbsGroups.reduce((t, [, g]) => t + g.total, 0);
  const movOf = (id: string) => mv[id] ?? { purchase: 0, production: 0, other: 0 };
  const openingOf = (id: string) => grouped[id].total - movOf(id).purchase - movOf(id).production - movOf(id).other;
  const sumBy = (f: (id: string) => number) => lbsGroups.reduce((t, [id]) => t + f(id), 0);
  const z = (n: number) => (Math.abs(n) < 0.005 ? 0 : n); // "-0.00" না দেখাতে
  const signedMoney = (n: number) => (n > 0.004 ? `+${money(n)}` : money(z(n)));

  const stockLabel = asOf ? `${formatLongDate(asOf)} পর্যন্ত স্টক` : "আজকের স্টক";

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
                  stockLbs={grouped[m.id]?.curTotal ?? 0}
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

      {/* ── স্টক — ফিল্টার (অটো-লোড) ── */}
      <h2 className="mb-1 text-sm font-semibold uppercase text-gray-500">স্টক — {stockLabel}</h2>
      {from && <p className="mb-2 text-xs text-gray-500">{datePresetLabel(period)}</p>}
      <AutoSubmitForm className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-3 shadow-sm">
        <DateRangeFields preset={period.preset} from={period.from} to={period.to} includeAll />
        <div>
          <label className="block text-xs text-gray-500 mb-1">Material</label>
          <select name="material" defaultValue={materialFilter} className="rounded-lg border px-3 py-2 text-sm min-w-[160px]">
            <option value="">সব Material</option>
            {(materials ?? []).map((m) => <option key={m.id} value={m.id}>{m.material_name}</option>)}
          </select>
        </div>
        {(sp.range || materialFilter) && (
          <Link href="/dashboard/inventory/raw-material" className="text-sm text-gray-500 hover:underline">রিসেট</Link>
        )}
      </AutoSubmitForm>

      <div className="space-y-6">
        {shownEntries.map(([id, data]) => {
          const isCarton = data.unit === "carton";
          const totalKg = data.total * 0.453592;
          const totalBags = data.total / LBS_PER_BAG;
          return (
            <div key={id} className="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <div className="flex items-center justify-between bg-gray-50 px-4 py-3">
                <Link href={`/dashboard/inventory/raw-material/${id}`} className="font-semibold text-gray-800 hover:underline hover:text-blue-700">
                  {data.name}
                </Link>
                <div className="text-sm text-gray-600 space-x-4">
                  {isCarton ? (
                    <span className="font-medium">{money(data.total)} Carton</span>
                  ) : (
                    <>
                      <span className="font-medium">{money(data.total)} Lbs</span>
                      <span>≈ {money(totalKg)} Kg</span>
                      <span>≈ {money(totalBags)} Bags</span>
                    </>
                  )}
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500 border-t">
                  <tr>
                    <th className="px-4 py-2">Warehouse</th>
                    {isCarton ? (
                      <th className="px-4 py-2 text-right">Carton</th>
                    ) : (
                      <>
                        <th className="px-4 py-2 text-right">Lbs</th>
                        <th className="px-4 py-2 text-right">Kg</th>
                        <th className="px-4 py-2 text-right">Bags</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-4 py-2">{r.whName}</td>
                      {isCarton ? (
                        <td className="px-4 py-2 text-right">{money(r.qty)}</td>
                      ) : (
                        <>
                          <td className="px-4 py-2 text-right">{money(r.qty)}</td>
                          <td className="px-4 py-2 text-right">{money(r.qty * 0.453592)}</td>
                          <td className="px-4 py-2 text-right">{money(r.qty / LBS_PER_BAG)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={isCarton ? 2 : 4} className="px-4 py-3 text-gray-400 italic">কোনো স্টক নেই</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {lbsGroups.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-xl border bg-white shadow-sm">
          <div className="bg-gray-50 px-4 py-3 font-semibold text-gray-800">
            সব Material — মোট <span className="ml-2 text-xs font-normal text-gray-500">{from ? datePresetLabel(period) : stockLabel}</span>
          </div>
          <table className={`w-full text-sm ${from ? "min-w-[980px]" : "min-w-[640px]"}`}>
            <thead className="border-t text-left text-gray-500">
              <tr>
                <th className="px-4 py-2">Material</th>
                {from && (
                  <>
                    <th className="px-4 py-2 text-right">Opening</th>
                    <th className="px-4 py-2 text-right">ক্রয়</th>
                    <th className="px-4 py-2 text-right">Production-এ ব্যবহার</th>
                    <th className="px-4 py-2 text-right">অন্যান্য (±)</th>
                  </>
                )}
                {summaryWarehouses.map((w) => <th key={w.id} className="px-4 py-2 text-right">{w.name} (Lbs)</th>)}
                <th className="px-4 py-2 text-right">{from ? "Closing Lbs" : "মোট Lbs"}</th>
                <th className="px-4 py-2 text-right">Kg</th>
                <th className="px-4 py-2 text-right">Bags</th>
              </tr>
            </thead>
            <tbody>
              {lbsGroups.map(([id, g]) => (
                <tr key={id} className="border-t">
                  <td className="px-4 py-2">{g.name}</td>
                  {from && (
                    <>
                      <td className="px-4 py-2 text-right">{money(z(openingOf(id)))}</td>
                      <td className="px-4 py-2 text-right">{money(movOf(id).purchase)}</td>
                      <td className="px-4 py-2 text-right">{money(z(-movOf(id).production))}</td>
                      <td className="px-4 py-2 text-right">{signedMoney(movOf(id).other)}</td>
                    </>
                  )}
                  {summaryWarehouses.map((w) => <td key={w.id} className="px-4 py-2 text-right">{money(qtyAt(g, w.id))}</td>)}
                  <td className="px-4 py-2 text-right font-medium">{money(g.total)}</td>
                  <td className="px-4 py-2 text-right">{money(g.total * 0.453592)}</td>
                  <td className="px-4 py-2 text-right">{money(g.total / LBS_PER_BAG)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 bg-gray-50 font-semibold">
              <tr>
                <td className="px-4 py-2">মোট (সব Material)</td>
                {from && (
                  <>
                    <td className="px-4 py-2 text-right">{money(sumBy(openingOf))}</td>
                    <td className="px-4 py-2 text-right">{money(sumBy((id) => movOf(id).purchase))}</td>
                    <td className="px-4 py-2 text-right">{money(z(-sumBy((id) => movOf(id).production)))}</td>
                    <td className="px-4 py-2 text-right">{signedMoney(sumBy((id) => movOf(id).other))}</td>
                  </>
                )}
                {summaryWarehouses.map((w) => (
                  <td key={w.id} className="px-4 py-2 text-right">{money(lbsGroups.reduce((t, [, g]) => t + qtyAt(g, w.id), 0))}</td>
                ))}
                <td className="px-4 py-2 text-right">{money(grandLbs)}</td>
                <td className="px-4 py-2 text-right">{money(grandLbs * 0.453592)}</td>
                <td className="px-4 py-2 text-right">{money(grandLbs / LBS_PER_BAG)}</td>
              </tr>
            </tfoot>
          </table>
          {from && (
            <p className="border-t px-4 py-2 text-xs text-gray-500">
              অন্যান্য = কাঁচামাল বিক্রি, ওয়েস্টেজ, স্টক সমন্বয় ইত্যাদি (+ ঢুকেছে / − বের হয়েছে)। Opening = সময়ের শুরুর আগের দিনের স্টক।
            </p>
          )}
          {cartonGroups.length > 0 && (
            <p className="border-t px-4 py-2 text-xs text-gray-500">
              {cartonGroups.map((g) => `${g.name} ${money(g.total)} Carton`).join(", ")} — কার্টনে গোনা, Lbs-এর মোটে ধরা হয়নি।
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4">
        Conversion: 1 Bag = 25 Kg = 55 Lbs
      </p>
    </div>
  );
}
