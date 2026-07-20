import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";

export default async function PurchaseEntryListPage() {
  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("purchase_entries")
    .select("*, suppliers(name), purchase_entry_items(quantity_lbs, rate_per_lbs)")
    .order("entry_date", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Purchase Entries</h1>
        <Link href="/dashboard/purchase/entry/new" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
          + নতুন Purchase Entry
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Supplier</th>
              <th className="px-4 py-2">Invoice No</th>
              <th className="px-4 py-2 text-right">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            {(entries ?? []).map((e: any) => {
              const total = (e.purchase_entry_items ?? []).reduce(
                (sum: number, i: any) => sum + i.quantity_lbs * i.rate_per_lbs, 0
              );
              return (
                <tr key={e.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{e.entry_no ?? "-"}</td>
                  <td className="px-4 py-2 text-gray-500">{e.entry_date}</td>
                  <td className="px-4 py-2">{e.suppliers?.name ?? "-"}</td>
                  <td className="px-4 py-2">{e.invoice_no || "-"}</td>
                  <td className="px-4 py-2 text-right">{total.toFixed(2)}</td>
                </tr>
              );
            })}
            {(!entries || entries.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Purchase Entry নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}