import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";

export default async function SupplierLedgerListPage() {
  const supabase = await createClient();
  const { data: suppliers } = await supabase.from("suppliers").select("*").order("name");

  // প্রতিটা supplier-এর মোট purchase amount বের করুন (দ্রুত ওভারভিউ দেখানোর জন্য)
  const { data: entries } = await supabase
    .from("purchase_entries")
    .select("supplier_id, purchase_entry_items(quantity_lbs, rate_per_lbs)");

  const totals: Record<string, number> = {};
  (entries ?? []).forEach((e: any) => {
    const amount = (e.purchase_entry_items ?? []).reduce(
      (sum: number, i: any) => sum + i.quantity_lbs * i.rate_per_lbs, 0
    );
    totals[e.supplier_id] = (totals[e.supplier_id] ?? 0) + amount;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Supplier Ledger</h1>
        <Link href="/dashboard/purchase" className="text-sm text-gray-500 hover:underline">
          ← Purchase-এ ফিরুন
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        যেকোনো সাপ্লায়ারে ক্লিক করে তার সম্পূর্ণ ক্রয় ও পাওনার হিসাব দেখুন।
      </p>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm divide-y">
        {(suppliers ?? []).map((s) => (
          <Link
            key={s.id}
            href={`/dashboard/purchase/supplier-ledger/${s.id}`}
            className="flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-50"
          >
            <span className="font-medium text-gray-800">{s.name}</span>
            <span className="text-gray-500">
              মোট ক্রয়: {money((totals[s.id] ?? 0))} →
            </span>
          </Link>
        ))}
        {(!suppliers || suppliers.length === 0) && (
          <p className="px-4 py-3 text-gray-400 italic text-sm">কোনো Supplier যোগ করা হয়নি</p>
        )}
      </div>
    </div>
  );
}