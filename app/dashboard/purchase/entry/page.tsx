import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PurchaseEntriesTable from "./PurchaseEntriesTable";

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

      <PurchaseEntriesTable entries={entries ?? []} />
    </div>
  );
}
