import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { money } from "@/lib/format";

const LBS_PER_BAG = 55;

export default async function MaterialStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: material } = await supabase
    .from("raw_materials")
    .select("*")
    .eq("id", id)
    .single();

  if (!material) return notFound();

  const { data: entries } = await supabase
    .from("stock_ledger")
    .select("*, warehouses(name)")
    .eq("item_type", "raw_material")
    .eq("item_id", id);

  const sorted = (entries ?? []).sort((a: any, b: any) => {
    if (a.txn_date !== b.txn_date) return a.txn_date.localeCompare(b.txn_date);
    return a.created_at.localeCompare(b.created_at);
  });

  let runningBalance = 0;
  const rows = sorted.map((e: any) => {
    runningBalance += e.txn_type === "in" ? e.quantity : -e.quantity;
    return { ...e, runningBalance };
  });

  const totalIn = sorted.reduce((sum: number, e: any) => sum + (e.txn_type === "in" ? e.quantity : 0), 0);
  const totalOut = sorted.reduce((sum: number, e: any) => sum + (e.txn_type === "out" ? e.quantity : 0), 0);

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
        বর্তমান ব্যালেন্স: {money(runningBalance)} Lbs
        {" "}≈ {money((runningBalance * 0.453592))} Kg
        {" "}≈ {money((runningBalance / LBS_PER_BAG))} Bags
      </p>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Warehouse</th>
              <th className="px-4 py-2">Reference</th>
              <th className="px-4 py-2 text-right">In (Lbs)</th>
              <th className="px-4 py-2 text-right">Out (Lbs)</th>
              <th className="px-4 py-2 text-right">Balance (Lbs)</th>
            </tr>
          </thead>
          <tbody>
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
                  এই material-এ এখনো কোনো এন্ট্রি নেই
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