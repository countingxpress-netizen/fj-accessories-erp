import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PurchaseEntriesTable from "./PurchaseEntriesTable";

export default async function PurchaseEntryListPage() {
  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("purchase_entries")
    .select("*, suppliers(name), purchase_entry_items(quantity_lbs, rate_per_lbs), creator:app_users!purchase_entries_created_by_fkey(full_name)")
    .order("entry_date", { ascending: false });

  // প্রতিটা entry-র Journal Voucher থেকে payment (credit) লাইনটা বের করে লেবেল বসানো —
  // পেমেন্ট সোর্স হার্ডকোড না করে সরাসরি অ্যাকাউন্টের নাম দেখানো হয় (Cash / Accounts Payable / Md Abu Jafor / ...)
  const voucherIds = (entries ?? []).map((e: any) => e.voucher_id).filter(Boolean);
  const paymentByVoucher: Record<string, string> = {};
  if (voucherIds.length > 0) {
    const { data: creditLines } = await supabase
      .from("journal_entry_lines")
      .select("voucher_id, credit, chart_of_accounts(account_name)")
      .in("voucher_id", voucherIds)
      .gt("credit", 0);
    (creditLines ?? []).forEach((l: any) => {
      paymentByVoucher[l.voucher_id] = l.chart_of_accounts?.account_name ?? "-";
    });
  }
  const entriesWithPayment = (entries ?? []).map((e: any) => ({
    ...e,
    paymentLabel: e.voucher_id ? (paymentByVoucher[e.voucher_id] ?? "-") : "-",
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Purchase Entries</h1>
        <Link href="/dashboard/purchase/entry/new" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
          + নতুন Purchase Entry
        </Link>
      </div>

      <PurchaseEntriesTable entries={entriesWithPayment} />
    </div>
  );
}
