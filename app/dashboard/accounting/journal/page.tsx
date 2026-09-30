import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetchAll";
import VouchersTable from "./VouchersTable";

export default async function JournalListPage() {
  const supabase = await createClient();
  // 1000+ voucher হয়ে গেছে — Supabase-এর 1000-রো ক্যাপে যেন পুরনোগুলো বাদ না পড়ে, পেজ করে সব আনা।
  // লাইনের account নামসহ আনা হয় যাতে রো-তে ক্লিক করলে ডিটেলস দেখানো ও account দিয়ে সার্চ করা যায়।
  const vouchers = (await fetchAllRows<any>(
    supabase,
    "journal_vouchers",
    "*, journal_entry_lines(id, debit, credit, memo, chart_of_accounts(account_code, account_name)), creator:app_users!journal_vouchers_created_by_fkey(full_name)",
  )).sort((a, b) =>
    (b.voucher_date ?? "").localeCompare(a.voucher_date ?? "") || (b.created_at ?? "").localeCompare(a.created_at ?? "")
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Journal Vouchers</h1>
        <Link
          href="/dashboard/accounting/journal/new"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white"
        >
          + নতুন Voucher
        </Link>
      </div>

      <VouchersTable vouchers={vouchers} />
    </div>
  );
}
