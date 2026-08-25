import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import VouchersTable from "./VouchersTable";

export default async function JournalListPage() {
  const supabase = await createClient();
  const { data: vouchers } = await supabase
    .from("journal_vouchers")
    .select("*, journal_entry_lines(debit, credit)")
    .order("voucher_date", { ascending: false });

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

      <VouchersTable vouchers={vouchers ?? []} />
    </div>
  );
}
