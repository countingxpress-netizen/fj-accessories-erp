import { generateNextDocNo } from "@/lib/docNumber";
import { getCurrentUserId } from "@/lib/currentUser";

// Payroll accounting — খরচ (accrual) আর পরিশোধ (payment) দুই ধাপে ভাগ করা হয়,
// যাতে বেতন খরচ সঠিক মাসে বসে (payment-এর দিনে নয়) আর Cash/Bank বেছে নেওয়া যায়।
//
//   Advance দেওয়া : Dr Advance to Employees (1260) / Cr বেছে নেওয়া Cash / Bank
//   Accrual JV   : Dr Salary Expense (5100)  = gross − other deduction
//                  Cr Salary Payable (2200)  = net salary
//                  Cr Advance to Employees (1260) = এ মাসে recover করা advance
//                  voucher date = বেতনের মাস-শেষ / বোনাসের তারিখ
//   Payment JV   : Dr Salary Payable (2200) / Cr বেছে নেওয়া Cash / Bank (1000–1099)
//                  voucher date = পরিশোধের দিন
//
// Salary Sheet ও Eid Bonus — দুই জায়গাতেই এই একই লজিক (SalaryRow, BonusRow,
// SalarySheetGenerator, BonusGenerator)।

export const SALARY_EXPENSE_CODE = "5100";
export const SALARY_PAYABLE_CODE = "2200"; // "Salary Payable" (chart-এ আগে থেকেই আছে)
export const EMPLOYEE_ADVANCE_CODE = "1260";

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
  const createdBy = await getCurrentUserId(supabase);
  const { data: voucher } = await supabase
    .from("journal_vouchers")
    .insert({ voucher_no: voucherNo, voucher_date: date, narration, created_by: createdBy })
    .select("id")
    .single();
  if (!voucher) return null;

  await supabase
    .from("journal_entry_lines")
    .insert(lines.map((l) => ({ voucher_id: voucher.id, ...l })));
  return voucher.id;
}

/**
 * Salary/Bonus accrual JV (gross basis):
 *   Dr 5100 Salary Expense           = gross − otherDeduction
 *   Cr 2200 Salary Payable           = netSalary
 *   Cr 1260 Advance to Employees     = advance     (recover; শুধু > 0 হলে)
 * Bonus-এ advance/otherDeduction থাকে না → শুধু Dr 5100 / Cr 2200 = amount।
 */
export async function postPayrollAccrual(
  supabase: Client,
  args: {
    date: string; narration: string; memo: string;
    gross: number; netSalary: number; advance?: number; otherDeduction?: number;
  }
): Promise<string | null> {
  const advance = Math.max(0, args.advance || 0);
  const otherDeduction = Math.max(0, args.otherDeduction || 0);
  const expenseAmt = Math.round((args.gross - otherDeduction) * 100) / 100;
  if (!(expenseAmt > 0) || !(args.netSalary > 0)) return null;

  const [expId, payId, advId] = await Promise.all([
    accountId(supabase, SALARY_EXPENSE_CODE),
    accountId(supabase, SALARY_PAYABLE_CODE),
    accountId(supabase, EMPLOYEE_ADVANCE_CODE),
  ]);
  if (!expId || !payId) return null;

  const lines = [
    { account_id: expId, debit: expenseAmt, credit: 0, memo: args.memo },
    { account_id: payId, debit: 0, credit: Math.round(args.netSalary * 100) / 100, memo: args.memo },
  ];
  if (advance > 0 && advId) {
    lines.push({ account_id: advId, debit: 0, credit: advance, memo: `Advance recovered — ${args.memo}` });
  } else if (advance > 0) {
    // 1260 account নেই — advance-কে Payable-এ যোগ করে ব্যালেন্স রাখি
    lines[1].credit = Math.round((args.netSalary + advance) * 100) / 100;
  }

  return makeVoucher(supabase, args.date, args.narration, lines);
}

/** Dr 1260 Advance to Employees / Cr chosen Cash/Bank — returns voucher id (or null). */
export async function postPayrollAdvance(
  supabase: Client,
  args: { date: string; narration: string; memo: string; amount: number; depositAccountId: string }
): Promise<string | null> {
  if (!(args.amount > 0) || !args.depositAccountId) return null;
  const advId = await accountId(supabase, EMPLOYEE_ADVANCE_CODE);
  if (!advId) return null;

  return makeVoucher(supabase, args.date, args.narration, [
    { account_id: advId, debit: args.amount, credit: 0, memo: args.memo },
    { account_id: args.depositAccountId, debit: 0, credit: args.amount, memo: args.memo },
  ]);
}

/** Dr 2200 Salary Payable / Cr chosen Cash/Bank — returns voucher id (or null). */
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

/**
 * Delete a JV + its lines (accrual or payment). No-op for null.
 *
 * `unlink` — যে row-টা এই voucher-কে reference করছে (salary_sheet /
 * bonus_sheet-এর voucher_id বা accrual_voucher_id) সেটা আগে `null` করে দেয়।
 * row-টা টিকে থাকলে (যেমন regenerate-এ) এটা না দিলে plain FK-এ voucher delete
 * আটকে যায় আর লাইনহীন orphan থেকে যায়। row নিজেই delete হয়ে গেলে দরকার নেই।
 */
export async function reversePayrollJv(
  supabase: Client,
  voucherId: string | null | undefined,
  unlink?: { table: string; column: string; id: string }
) {
  if (!voucherId) return;
  if (unlink) {
    await supabase.from(unlink.table).update({ [unlink.column]: null }).eq("id", unlink.id);
  }
  await supabase.from("journal_entry_lines").delete().eq("voucher_id", voucherId);
  await supabase.from("journal_vouchers").delete().eq("id", voucherId);
}
