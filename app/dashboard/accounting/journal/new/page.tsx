import { createClient } from "@/lib/supabase/server";
import JournalVoucherForm from "./JournalVoucherForm";

const typeLabels: Record<string, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  income: "Income",
  expense: "Expense",
};

// ?clone=<voucher id> — Zoho-র মতো Clone: সেই voucher-এর narration ও লাইনগুলো ভরা নতুন ফর্ম
// (তারিখ আজকের, voucher no সেভের সময় নতুন)। সেভ হলে সম্পূর্ণ আলাদা নতুন Manual JV।
export default async function NewJournalVoucherPage({
  searchParams,
}: { searchParams: Promise<{ clone?: string }> }) {
  const { clone } = await searchParams;
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type")
    .order("account_code");

  let source: { voucher_no: string; narration: string | null } | null = null;
  let initialLines: { account_id: string; accountLabel: string; debit: string; credit: string; memo: string }[] | undefined;
  if (clone) {
    const [{ data: v }, { data: lines }] = await Promise.all([
      supabase.from("journal_vouchers").select("voucher_no, narration").eq("id", clone).maybeSingle(),
      supabase
        .from("journal_entry_lines")
        .select("account_id, debit, credit, memo, chart_of_accounts(account_code, account_name, account_type)")
        .eq("voucher_id", clone),
    ]);
    source = v;
    initialLines = (lines ?? []).map((l: any) => {
      const acc = Array.isArray(l.chart_of_accounts) ? l.chart_of_accounts[0] : l.chart_of_accounts;
      return {
        account_id: l.account_id,
        accountLabel: acc ? `${acc.account_code} - ${acc.account_name} (${typeLabels[acc.account_type] ?? acc.account_type})` : "",
        debit: l.debit ? String(l.debit) : "",
        credit: l.credit ? String(l.credit) : "",
        memo: l.memo ?? "",
      };
    });
    if (initialLines.length === 0) initialLines = undefined;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">নতুন Journal Voucher</h1>
      {source && (
        <p className="mb-4 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3">
          {source.voucher_no} থেকে Clone করা — তারিখ, টাকা, লাইন দরকারমতো বদলে সেভ করুন। নতুন Voucher No সেভের সময় বসবে।
        </p>
      )}
      <JournalVoucherForm
        key={clone ?? "new"}
        accounts={accounts ?? []}
        initialNarration={source?.narration ?? undefined}
        initialLines={initialLines}
      />
    </div>
  );
}
