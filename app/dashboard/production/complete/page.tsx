import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProductionStageRow from "../orders/ProductionStageRow";
import { getCurrentAppUser } from "@/lib/supabase/getCurrentAppUser";
import { buildStageRows, PRODUCTION_ORDER_SELECT, type StageRow } from "@/lib/productionStageRows";

export default async function CompleteProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "printing" || tab === "cutting" ? tab : "blowing";

  const supabase = await createClient();
  const appUser = await getCurrentAppUser();
  const isAdmin = appUser?.role === "admin";

  const { data: orders } = await supabase
    .from("production_orders")
    .select(PRODUCTION_ORDER_SELECT)
    .eq("stage", "finished")
    .order("order_date", { ascending: false });

  const { blowingRows, printingRows, cuttingRows } = buildStageRows(orders ?? []);

  const tabData: Record<string, { label: string; rows: StageRow[] }> = {
    blowing: { label: "Blowing", rows: blowingRows },
    printing: { label: "Printing", rows: printingRows },
    cutting: { label: "Cutting", rows: cuttingRows },
  };

  const currentRows = tabData[activeTab].rows;
  const tabKeys = Object.keys(tabData);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Complete Production</h1>
        <Link href="/dashboard/production/orders" className="text-sm text-gray-500 hover:underline">
          ← চলমান Production Orders-এ ফিরুন
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        যেসব Production Order পুরোপুরি শেষ হয়ে গেছে (Cutting-এ Target পূরণ হয়েছে) সেগুলো এখানে দেখাবে।
        {isAdmin && " ভুল কিছু চোখে পড়লে \"✎ ভুল হলে সংশোধন করুন (Admin)\" দিয়ে ঠিক করতে পারবেন।"}
      </p>

      <div className="flex gap-2 mb-4">
        {tabKeys.map((key) => {
          const info = tabData[key];
          return (
            <a
              key={key}
              href={`/dashboard/production/complete?tab=${key}`}
              className={
                activeTab === key
                  ? "rounded-lg px-4 py-2 text-sm bg-gray-900 text-white"
                  : "rounded-lg px-4 py-2 text-sm border text-gray-600 hover:bg-gray-50"
              }
            >
              {info.label} ({info.rows.length})
            </a>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Booking No</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Measurement</th>
              <th className="px-4 py-2 text-right">Target</th>
              <th className="px-4 py-2 text-right">Remaining</th>
              <th className="px-4 py-2 w-40">Produced</th>
              <th className="px-4 py-2">Stage</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentRows.map((r) => (
              <ProductionStageRow key={r.key} row={r} isAdmin={isAdmin} />
            ))}
            {currentRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-3 text-gray-400 italic">
                  এখনো কোনো Production Order সম্পন্ন হয়নি
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
