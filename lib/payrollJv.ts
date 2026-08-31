import { generateNextDocNo } from "@/lib/docNumber";

// Payroll accounting — খরচ (accrual) আর পরিশোধ (payment) দুই ধাপে ভাগ করা হয়,
// যাতে বেতন খরচ সঠিক মাসে বসে (payment-এর দিনে নয়) আর Cash/Bank বেছে নেওয়া যায়।
//
//   Accrual JV : Dr Salary & Wages Expense (5100) / Cr Salary & Bonus Payable (2100)
//                voucher date = বেতনের মাস-শেষ / বোনাসের তারিখ
//   Payment JV : Dr Salary & Bonus Payable (2100) / Cr বেছে নেওয়া Cash (1000) / Bank (1010)
//                voucher date = পরিশোধের দিন
//
// Salary Sheet ও Eid Bonus — দুই জায়গাতেই এই একই লজিক (SalaryRow, BonusRow,
// SalarySheetGenerator, BonusGenerator)।

export const SALARY_EXPENSE_CODE = "5100";
export const SALARY_PAYABLE_CODE = "2100";
export const CASH_BANK_CODES = ["1000", "1010"];

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

async function accountId(supabase: Client, code: string): Promise<string | null> {
  const { data } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("account_code", code)
    .maybeSingle();
  return data?.id ?? null;
}

async function makeVoucher(
  supabase: Client,
  date: string,
  narration: string,
  lines: { account_id: string; debit: number; credit: number; memo: string }[]
): Promise<string | null> {
  const voucherNo = await generateNextDocNo(
    supabase,
    "journal_vouchers",
    "voucher_no",
    "JV",
    "voucher_date",
    date
  );
  const { data: voucher } = await supabase
    .from("journal_vouchers")
    .insert({ voucher_no: voucherNo, voucher_date: date, narration })
    .select("id")
    .single();
  if (!voucher) return null;

  await supabase
    .from("journal_entry_lines")
    .insert(lines.map((l) => ({ voucher_id: voucher.id, ...l })));
  return voucher.id;
}

/** Dr 5100 Salary Expense / Cr 2100 Salary & Bonus Payable — returns voucher id (or null). */
export async function postPayrollAccrual(
  supabase: Client,
  args: { date: string; narration: string; amount: number; memo: string }
): Promise<string | null> {
  if (!(args.amount > 0)) return null;
  const [expId, payId] = await Promise.all([
    accountId(supabase, SALARY_EXPENSE_CODE),
    accountId(supabase, SALARY_PAYABLE_CODE),
  ]);
  if (!expId || !payId) return null;

  return makeVoucher(supabase, args.date, args.narration, [
    { account_id: expId, debit: args.amount, credit: 0, memo: args.memo },
    { account_id: payId, debit: 0, credit: args.amount, memo: args.memo },
  ]);
}

/** Dr 2100 Salary & Bonus Payable / Cr chosen Cash/Bank — returns voucher id (or null). */
export async function postPayrollPayment(
  supabase: Client,
  args: {
    date: string;
    narration: string;
    amount: number;
    memo: string;
    depositAccountId: string;
  }
): Promise<string | null> {
  if (!(args.amount > 0) || !args.depositAccountId) return null;
  const payId = await accountId(supabase, SALARY_PAYABLE_CODE);
  if (!payId) return null;

  return makeVoucher(supabase, args.date, args.narration, [
    { account_id: payId, debit: args.amount, credit: 0, memo: args.memo },
    { account_id: args.depositAccountId, debit: 0, credit: args.amount, memo: args.memo },
  ]);
}

/** Delete a JV + its lines (accrual or payment). No-op for null. */
export async function reversePayrollJv(
  supabase: Client,
  voucherId: string | null | undefined
) {
  if (!voucherId) return;
  await supabase.from("journal_entry_lines").delete().eq("voucher_id", voucherId);
  await supabase.from("journal_vouchers").delete().eq("id", voucherId);
}
