import type { SupabaseClient } from "@supabase/supabase-js";
import { generateNextDocNo } from "@/lib/docNumber";
import { getCurrentUserId } from "@/lib/currentUser";

// Customer opening balance — একটাই consolidated Journal Voucher নিজে নিজে sync থাকে।
// যখনই কোনো customer add / edit / delete হয় (opening_balance পাল্টাতে পারে),
// syncCustomerOpeningJv() ডাকুন। এটা মোট = Σ(customers.opening_balance) হিসাব করে:
//
//   মোট ≠ 0  → JV থাকলে অঙ্ক রিফ্রেশ করে, না থাকলে নতুন বানায়
//              (Dr 1100 Accounts Receivable / Cr 3900 Opening Balance Equity)
//   মোট ≈ 0  → JV থাকলে মুছে দেয়
//
// best-effort — customer save হয়ে গেলে JV sync ব্যর্থ হলেও সেটা আটকায় না।

const AR_CODE = "1100"; // Accounts Receivable (Customers)
const OBE_CODE = "3900"; // Opening Balance Equity
export const CUSTOMER_OPENING_NARRATION = "Opening — Customer receivable balances";

const round2 = (n: number) => Math.round(n * 100) / 100;

async function accountIdByCode(supabase: SupabaseClient, code: string): Promise<string | null> {
  const { data } = await supabase.from("chart_of_accounts").select("id").eq("account_code", code).maybeSingle();
  return data?.id ?? null;
}

export async function syncCustomerOpeningJv(supabase: SupabaseClient): Promise<void> {
  try {
    const [{ data: custs }, { data: existing }] = await Promise.all([
      supabase.from("customers").select("opening_balance, opening_balance_date"),
      supabase.from("journal_vouchers").select("id").eq("narration", CUSTOMER_OPENING_NARRATION),
    ]);

    const total = round2(
      (custs ?? []).reduce((s: number, c: { opening_balance: number | null }) => s + (Number(c.opening_balance) || 0), 0)
    );
    const jvId = (existing ?? [])[0]?.id ?? null;

    // মোট শূন্য — পুরনো JV থাকলে সরিয়ে দিন
    if (Math.abs(total) < 0.005) {
      if (jvId) {
        await supabase.from("journal_entry_lines").delete().eq("voucher_id", jvId);
        await supabase.from("journal_vouchers").delete().eq("id", jvId);
      }
      return;
    }

    const [arId, obeId] = await Promise.all([
      accountIdByCode(supabase, AR_CODE),
      accountIdByCode(supabase, OBE_CODE),
    ]);
    if (!arId || !obeId) return; // অ্যাকাউন্ট নেই — চুপচাপ বাদ

    const makeLines = (voucherId: string) => [
      { voucher_id: voucherId, account_id: arId, debit: total, credit: 0, memo: "Customer opening balances" },
      { voucher_id: voucherId, account_id: obeId, debit: 0, credit: total, memo: "Customer opening balances" },
    ];

    if (jvId) {
      // অঙ্ক রিফ্রেশ — voucher নম্বর ও তারিখ অপরিবর্তিত
      await supabase.from("journal_entry_lines").delete().eq("voucher_id", jvId);
      await supabase.from("journal_entry_lines").insert(makeLines(jvId));
      return;
    }

    // নতুন JV — তারিখ = balance-থাকা customer-দের সবচেয়ে আগের opening_balance_date
    const dates = (custs ?? [])
      .filter((c: { opening_balance: number | null }) => Number(c.opening_balance))
      .map((c: { opening_balance_date: string | null }) => c.opening_balance_date)
      .filter((d: string | null): d is string => !!d)
      .sort();
    const date = dates[0] ?? new Date().toISOString().slice(0, 10);

    const voucherNo = await generateNextDocNo(supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", date);
    const createdBy = await getCurrentUserId(supabase);
    const { data: voucher } = await supabase
      .from("journal_vouchers")
      .insert({ voucher_no: voucherNo, voucher_date: date, narration: CUSTOMER_OPENING_NARRATION, created_by: createdBy })
      .select("id")
      .single();
    if (!voucher) return;

    await supabase.from("journal_entry_lines").insert(makeLines(voucher.id));
  } catch {
    // best-effort — customer অপারেশন আটকাবে না
  }
}
