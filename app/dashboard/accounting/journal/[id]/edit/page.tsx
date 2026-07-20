import { createClient } from "@/lib/supabase/server";
import JournalVoucherForm from "../../new/JournalVoucherForm";
import { notFound } from "next/navigation";

export default async function EditJournalVoucherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type")
    .order("account_code");

  const { data: voucher } = await supabase
    .from("journal_vouchers")
    .select("*")
    .eq("id", id)
    .single();

  if (!voucher) return notFound();

  const { data: entryLines } = await supabase
    .from("journal_entry_lines")
    .select("*, chart_of_accounts(id, account_code, account_name, account_type)")
    .eq("voucher_id", id);

  const typeLabels: Record<string, string> = {
    asset: "Asset",
    liability: "Liability",
    equity: "Equity",
    income: "Income",
    expense: "Expense",
  };

  const initialLines = (entryLines ?? []).map((l: any) => ({
    account_id: l.account_id,
    accountLabel: l.chart_of_accounts
      ? `${l.chart_of_accounts.account_code} - ${l.chart_of_accounts.account_name} (${
          typeLabels[l.chart_of_accounts.account_type] ?? l.chart_of_accounts.account_type
        })`
      : "",
    debit: l.debit ? String(l.debit) : "",
    credit: l.credit ? String(l.credit) : "",
    memo: l.memo ?? "",
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Journal Voucher এডিট করুন — {voucher.voucher_no}</h1>
      <JournalVoucherForm
        accounts={accounts ?? []}
        mode="edit"
        voucherId={voucher.id}
        initialDate={voucher.voucher_date}
        initialNarration={voucher.narration ?? ""}
        initialLines={initialLines.length ? initialLines : undefined}
      />
    </div>
  );
}