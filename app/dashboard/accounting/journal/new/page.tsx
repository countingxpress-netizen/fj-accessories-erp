import { createClient } from "@/lib/supabase/server";
import JournalVoucherForm from "./JournalVoucherForm";

export default async function NewJournalVoucherPage() {
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type")
    .order("account_code");

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">নতুন Journal Voucher</h1>
      <JournalVoucherForm accounts={accounts ?? []} />
    </div>
  );
}