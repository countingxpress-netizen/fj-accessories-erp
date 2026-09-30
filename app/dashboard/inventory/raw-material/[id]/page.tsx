import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { money } from "@/lib/format";
import { fetchAllRows } from "@/lib/fetchAll";
import { resolveDatePreset, datePresetLabel } from "@/lib/datePresets";
import DateRangeFields from "@/components/DateRangeFields";

const LBS_PER_BAG = 55;

export default async function MaterialStatementPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { id } = await params;
  // তারিখ-ফিল্টার preset — ডিফল্ট All Time (আগের মতো); সময়ের আগের স্টক "Opening Balance" সারিতে
  const sp = await searchParams;
  const period = resolveDatePreset(sp.range, sp.from, sp.to, "all");
  const from = period.from || undefined;
  const to = period.to || undefined;
  const supabase = await createClient();

  const { data: material } = await supabase
    .from("raw_materials")
    .select("*")
    .eq("id", id)
    .single();

  if (!material) return notFound();

  const isCarton = material.unit === "carton";
  const unitLabel = isCarton ? "Carton" : "Lbs";

  const entries = await fetchAllRows<any>(
    supabase, "stock_ledger", "*, warehouses(name)",
    (q) => q.eq("item_type", "raw_material").eq("item_id", id)
  );

  const sorted = (entries ?? []).sort((a: any, b: any) => {
    if (a.txn_date !== b.txn_date) return a.txn_date.localeCompare(b.txn_date);
    return a.created_at.localeCompare(b.created_at);
  });

  const signed = (e: any) => (e.txn_type === "in" ? Number(e.quantity) : -Number(e.quantity));
  const openingBalance = from ? sorted.filter((e: any) => e.txn_date < from).reduce((s: number, e: any) => s + signed(e), 0) : 0;
  const inRange = sorted.filter((e: any) => (!from || e.txn_date >= from) && (!to || e.txn_date <= to));

  let runningBalance = openingBalance;
  const rows = inRange.map((e: any) => {
    runningBalance += signed(e);
    return { ...e, runningBalance };
  });

  const totalIn = inRange.reduce((sum: number, e: any) => sum + (e.txn_type === "in" ? Number(e.quantity) : 0), 0);
  const totalOut = inRange.reduce((sum: number, e: any) => sum + (e.txn_type === "out" ? Number(e.quantity) : 0), 0);
  const balanceLabel = to ? "সময়ের শেষে ব্যালেন্স" : "বর্তমান ব্যালেন্স";

  const referenceLabels: Record<string, string> = {
    manual_adjustment: "Manual Adjustment",
    purchase: "Purchase Entry",
    production: "Production",
    delivery: "Delivery",
    wastage: "Wastage",
  };

  return (
    <div>
      <Link href="/dashboard/inventory/raw-material" className="text-sm text-gray-500 hover:underline">
        ← সব Material-এর তালিকায় ফিরুন
      </Link>

      <h1 className="text-2xl font-semibold mt-2 mb-1">{material.material_name} — Stock Statement</h1>
      <p className="text-sm text-gray-500 mb-4">
        {isCarton ? (
          <>{balanceLabel}: {money(runningBalance)} Carton</>
        ) : (
          <>
            {balanceLabel}: {money(runningBalance)} Lbs
            {" "}≈ {money((runningBalance * 0.453592))} Kg
            {" "}≈ {money((runningBalance / LBS_PER_BAG))} Bags
          </>
        )}
        {" "}· {datePresetLabel(period)}
      </p>

      <form className="mb-4 flex flex-wrap items-end gap-3">
        <DateRangeFields preset={period.preset} from={period.from} to={period.to} includeAll />
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">দেখুন</button>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Warehouse</th>
              <th className="px-4 py-2">Reference</th>
              <th className="px-4 py-2 text-right">In ({unitLabel})</th>
              <th className="px-4 py-2 text-right">Out ({unitLabel})</th>
              <th className="px-4 py-2 text-right">Balance ({unitLabel})</th>
            </tr>
          </thead>
          <tbody>
            {from && (
              <tr className="border-t bg-gray-50/60">
                <td colSpan={5} className="px-4 py-2 font-medium text-gray-600">Opening Balance (এই সময়ের আগ পর্যন্ত)</td>
                <td className="px-4 py-2 text-right font-medium">{money(openingBalance)}</td>
              </tr>
            )}
            {rows.map((e: any) => (
              <tr key={e.id} className="border-t">
                <td className="px-4 py-2 text-gray-500">{e.txn_date}</td>
                <td className="px-4 py-2">{e.warehouses?.name ?? "-"}</td>
                <td className="px-4 py-2 text-gray-600">
                  {referenceLabels[e.reference_type] ?? e.reference_type ?? "-"}
                </td>
                <td className="px-4 py-2 text-right">
                  {e.txn_type === "in" ? money(e.quantity) : ""}
                </td>
                <td className="px-4 py-2 text-right">
                  {e.txn_type === "out" ? money(e.quantity) : ""}
                </td>
                <td className="px-4 py-2 text-right font-medium">{money(e.runningBalance)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-3 text-gray-400 italic">
                  {from || to ? "এই সময়ে কোনো এন্ট্রি নেই" : "এই material-এ এখনো কোনো এন্ট্রি নেই"}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t-2 font-semibold bg-gray-50">
            <tr>
              <td colSpan={3} className="px-4 py-3 text-right">Total</td>
              <td className="px-4 py-3 text-right">{money(totalIn)}</td>
              <td className="px-4 py-3 text-right">{money(totalOut)}</td>
              <td className="px-4 py-3 text-right">{money(runningBalance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}