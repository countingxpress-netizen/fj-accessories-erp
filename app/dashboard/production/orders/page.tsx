import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProductionStageRow from "./ProductionStageRow";
import { getCurrentAppUser } from "@/lib/supabase/getCurrentAppUser";
import { buildStageRows, PRODUCTION_ORDER_SELECT, type StageRow } from "@/lib/productionStageRows";
import { fetchAllRows } from "@/lib/fetchAll";

export type { StageRow };

export default async function ProductionOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "printing" || tab === "cutting" ? tab : "blowing";

  const supabase = await createClient();
  const appUser = await getCurrentAppUser();
  const isAdmin = appUser?.role === "admin";

  // সম্পূর্ণ শেষ হওয়া অর্ডার (stage="finished") এই active পেজ থেকে বাদ —
  // ওগুলো Complete Production পেজে থাকবে
  const orders = await fetchAllRows<any>(
    supabase, "production_orders", PRODUCTION_ORDER_SELECT,
    (q) => q.neq("stage", "finished").order("order_date", { ascending: false })
  );

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
        <h1 className="text-2xl font-semibold">Production Orders</h1>
        <Link href="/dashboard/production/complete" className="text-sm text-gray-500 hover:underline">
          সম্পন্ন হওয়া Orders দেখুন →
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        প্রতিটা স্টেজে কত উৎপাদন হয়েছে তা লিখে সেভ করুন — Target-এ পৌঁছালে স্বয়ংক্রিয়ভাবে &quot;OK&quot; হয়ে যাবে। পুরো অর্ডার শেষ হয়ে গেলে সেটা এখান থেকে সরে &quot;Complete Production&quot; পেজে চলে যাবে।
      </p>

      <div className="flex gap-2 mb-4">
        {tabKeys.map((key) => {
          const info = tabData[key];
          return (
            <a
              key={key}
              href={`/dashboard/production/orders?tab=${key}`}
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
                  এই তালিকায় এখনো কিছু নেই
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
