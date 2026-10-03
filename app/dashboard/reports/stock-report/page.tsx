import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/app/dashboard/PrintButton";
import { fetchAllRows } from "@/lib/fetchAll";
import { resolveDatePreset, periodAsOf, formatLongDate } from "@/lib/datePresets";
import DateRangeFields from "@/components/DateRangeFields";
import AutoSubmitForm from "@/components/AutoSubmitForm";

const LBS_PER_BAG = 55;
const money = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function StockReportPage({
  searchParams,
}: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  // নির্দিষ্ট তারিখ পর্যন্ত স্টক — বাছাই করা সময়ের শেষ দিন (ডিফল্ট All Time = আজকের স্টক)।
  // পরিমাণ: আজকের স্টক থেকে ওই তারিখের পরের stock_ledger লেনদেন উল্টো হিসাব (আজকের সংখ্যা হুবহু ঠিক থাকে);
  // মোট মূল্য: ওই তারিখ পর্যন্ত inventory account-এর খাতা (GL) ব্যালেন্স।
  const sp = await searchParams;
  const period = resolveDatePreset(sp.range, sp.from, sp.to, "all");
  const asOf = periodAsOf(period);
  const supabase = await createClient();

  const [
    { data: materials },
    { data: rawStock },
    { data: products },
    { data: fgStock },
    { data: accounts },
    { data: lines },
  ] = await Promise.all([
    supabase.from("raw_materials").select("id, material_name, unit, avg_cost_per_lbs, inventory_account_code").order("material_name"),
    supabase.from("raw_material_stock").select("material_id, quantity_lbs"),
    fetchAllRows<any>(supabase, "finished_goods", "id, product_name, avg_cost_per_pc", (q) => q.order("product_name")).then((data) => ({ data })),
    supabase.from("finished_goods_stock").select("product_id, quantity_pcs"),
    supabase.from("chart_of_accounts").select("id, account_code"),
    fetchAllRows<any>(supabase, "journal_entry_lines", "account_id, debit, credit, journal_vouchers(voucher_date)").then((data) => ({
      data: asOf ? data.filter((l: any) => (l.journal_vouchers?.voucher_date ?? "") <= asOf) : data,
    })),
  ]);

  // asOf-এর পরের স্টক লেনদেন (in +, out −) — আজকের স্টক থেকে বাদ দিলে asOf দিনের স্টক
  const laterMoves = asOf
    ? await fetchAllRows<any>(supabase, "stock_ledger", "item_type, item_id, txn_type, quantity", (q) => q.gt("txn_date", asOf))
    : [];
  const laterNet = (itemType: string) => {
    const m: Record<string, number> = {};
    laterMoves.filter((l: any) => l.item_type === itemType).forEach((l: any) => {
      const sign = l.txn_type === "in" ? 1 : l.txn_type === "out" ? -1 : 0;
      m[l.item_id] = (m[l.item_id] ?? 0) + sign * (Number(l.quantity) || 0);
    });
    return m;
  };
  const rawLater = laterNet("raw_material");
  const fgLater = laterNet("finished_goods");

  const rawTotals: Record<string, number> = {};
  (rawStock ?? []).forEach((s) => { rawTotals[s.material_id] = (rawTotals[s.material_id] ?? 0) + s.quantity_lbs; });
  Object.entries(rawLater).forEach(([id, q]) => { rawTotals[id] = (rawTotals[id] ?? 0) - q; });

  const fgTotals: Record<string, number> = {};
  (fgStock ?? []).forEach((s) => { fgTotals[s.product_id] = (fgTotals[s.product_id] ?? 0) + s.quantity_pcs; });
  Object.entries(fgLater).forEach(([id, q]) => { fgTotals[id] = (fgTotals[id] ?? 0) - q; });

  const totalRawLbs = Object.values(rawTotals).reduce((s, v) => s + v, 0);
  const totalFgPcs = Object.values(fgTotals).reduce((s, v) => s + v, 0);

  // প্রতিটা material-এর নিজস্ব সারি এখনো qty × avg cost (costing অনুমান)।
  // কিন্তু "মোট" — Rounding-adjustment JV-সহ আসল খাতার (ledger) সাথে হুবহু মেলাতে —
  // সরাসরি inventory account-গুলোর journal balance থেকে টানা হয়, qty × rate যোগ করে না।
  const accountIdByCode: Record<string, string> = {};
  (accounts ?? []).forEach((a: any) => { accountIdByCode[a.account_code] = a.id; });
  const balanceByAccountId: Record<string, number> = {};
  (lines ?? []).forEach((l: any) => {
    balanceByAccountId[l.account_id] = (balanceByAccountId[l.account_id] ?? 0) + (l.debit || 0) - (l.credit || 0);
  });
  const rawInventoryCodes = new Set(
    (materials ?? []).map((m: any) => m.inventory_account_code).filter(Boolean)
  );
  const rawValue = Array.from(rawInventoryCodes).reduce(
    (s, code) => s + (balanceByAccountId[accountIdByCode[code as string]] ?? 0),
    0
  );
  const rawValueByCosting = (materials ?? []).reduce(
    (s, m: any) => s + (rawTotals[m.id] ?? 0) * (Number(m.avg_cost_per_lbs) || 0),
    0
  );
  const roundingDiff = Math.round((rawValue - rawValueByCosting) * 100) / 100;
  const fgValue = (products ?? []).reduce((s, p: any) => s + (fgTotals[p.id] ?? 0) * (Number(p.avg_cost_per_pc) || 0), 0);

  const asOfText = asOf ? `${formatLongDate(asOf)} তারিখ পর্যন্ত` : "আজকের স্টক";
  const excelRows: (string | number)[][] = [
    ["Stock Report"],
    [asOfText],
    [],
    ["Raw Material Stock"],
    ["Material", "Lbs", "Kg", "Bags", "গড় খরচ", "মূল্য"],
    ...(materials ?? []).map((m: any) => {
      const lbs = rawTotals[m.id] ?? 0;
      const cost = Number(m.avg_cost_per_lbs) || 0;
      const isCarton = m.unit === "carton";
      return [m.material_name, lbs, isCarton ? "" : Number((lbs * 0.453592).toFixed(2)), isCarton ? "" : Number((lbs / LBS_PER_BAG).toFixed(2)), cost, Number((lbs * cost).toFixed(2))];
    }),
    ["মোট (খাতা অনুযায়ী)", "", "", "", "", Number(rawValue.toFixed(2))],
    [],
    ["Finished Goods Stock"],
    ["Product", "Quantity (Pcs)", "গড় খরচ / Pc", "মূল্য"],
    ...(products ?? []).map((p: any) => {
      const pcs = fgTotals[p.id] ?? 0;
      const cost = Number(p.avg_cost_per_pc) || 0;
      return [p.product_name, pcs, cost, Number((pcs * cost).toFixed(2))];
    }),
    ["মোট", "", "", Number(fgValue.toFixed(2))],
  ];

  return (
    <div>
      <div className="print:hidden flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Stock Report</h1>
        <Link href="/dashboard/reports" className="text-sm text-gray-500 hover:underline">← Reports-এ ফিরুন</Link>
      </div>
      <p className="print:hidden text-sm text-gray-500 -mt-2 mb-3">
        {asOfText}{asOf && " — পরিমাণ Stock Ledger অনুযায়ী, প্রতি একক খরচ বর্তমান গড় খরচ"}
      </p>
      <AutoSubmitForm className="print:hidden mb-4 flex flex-wrap items-end gap-3">
        <DateRangeFields preset={period.preset} from={period.from} to={period.to} includeAll hideFrom toLabel="As of Date" />
      </AutoSubmitForm>
      <PrintButton excelFilename={`Stock-Report${asOf ? `-${asOf}` : ""}`} excelSheets={[{ name: "Stock", rows: excelRows }]} />

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
              <th className="px-4 py-2 text-right">গড় খরচ</th>
              <th className="px-4 py-2 text-right">মূল্য</th>
            </tr>
          </thead>
          <tbody>
            {(materials ?? []).map((m: any) => {
              const lbs = rawTotals[m.id] ?? 0;
              const cost = Number(m.avg_cost_per_lbs) || 0;
              const isCarton = m.unit === "carton";
              return (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-2">
                    <Link href={`/dashboard/inventory/raw-material/${m.id}`} className="hover:underline hover:text-blue-700">{m.material_name}</Link>
                  </td>
                  {isCarton ? (
                    <>
                      <td className="px-4 py-2 text-right">{money(lbs)} Carton</td>
                      <td className="px-4 py-2 text-right">—</td>
                      <td className="px-4 py-2 text-right">—</td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2 text-right">{money(lbs)}</td>
                      <td className="px-4 py-2 text-right">{money((lbs * 0.453592))}</td>
                      <td className="px-4 py-2 text-right">{money((lbs / LBS_PER_BAG))}</td>
                    </>
                  )}
                  <td className="px-4 py-2 text-right text-gray-500">{cost ? cost.toFixed(4) : "—"}</td>
                  <td className="px-4 py-2 text-right">{money(lbs * cost)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 font-semibold">
            <tr><td className="px-4 py-2" colSpan={5}>মোট (খাতা অনুযায়ী)</td><td className="px-4 py-2 text-right">৳{money(rawValue)}</td></tr>
          </tfoot>
        </table>
      </div>
      {Math.abs(roundingDiff) >= 0.005 && (
        <p className="text-xs text-gray-400 -mt-4 mb-6">
          উপরের সারিগুলো qty × গড় খরচ অনুযায়ী আনুমানিক (যোগফল ৳{money(rawValueByCosting)}) — মোট ঘরে আসল Journal Voucher খাতার ব্যালেন্স
          দেখানো হয়েছে, একটা rounding-adjustment JV-এর কারণে পার্থক্য ৳{money(Math.abs(roundingDiff))}।
        </p>
      )}

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
