import type { SupabaseClient } from "@supabase/supabase-js";
import { generateNextDocNo } from "@/lib/docNumber";
import { getCurrentUserId } from "@/lib/currentUser";

// Chart of Accounts opening balance — একটাই consolidated Journal Voucher নিজে নিজে
// sync থাকে। যখনই কোনো account add / edit হয় (opening_balance পাল্টাতে পারে),
// syncOpeningBalanceJv() ডাকুন। এটা প্রতিটা account-এর opening_balance পড়ে:
//
//   asset / expense    → normal side debit  (opening_balance < 0 হলে credit)
//   liability / equity  → normal side credit (opening_balance < 0 হলে debit)
//   income              → normal side credit
//
//   পুরো JV-র net balancing line যায় 3900 Opening Balance Equity-তে।
//   কোনো account-এ balance না থাকলে JV মুছে যায়।
//
// best-effort — account save হয়ে গেলে JV sync ব্যর্থ হলেও সেটা আটকায় না।

const OBE_CODE = "3900"; // Opening Balance Equity (balancing account)
export const ACCOUNT_OPENING_NARRATION = "Opening — Account balances";

// এই code-গুলোর opening আলাদা মেকানিজম/ম্যানুয়াল ভাউচার থেকে পোস্ট হয় (customer
// opening JV, Opening Inventory reconciliation, "Opening — Cash in Hand" নামের
// ম্যানুয়াল JV) — এখানে ধরলে দুবার গণনা হতো (2026-09-04-এ ঠিক এই কারণে লিল্লাহ্/
// ওমরের balance ভুলবশত দুই ভাউচারে পোস্ট হয়ে একে অপরকে কাটাকাটি করেছিল), তাই বাদ।
export const AUTO_OPENING_CODES = new Set([
  "1000", // Cash in Hand → ম্যানুয়াল "Opening — Cash in Hand" ভাউচার
  "1100", // Accounts Receivable → lib/customerOpeningJv.ts
  "1200", "1201", "1202", "1203", "1210", "1220", "1299", // inventory → Opening Inventory পেজ
  OBE_CODE, // নিজেই balancing line
]);

const round2 = (n: number) => Math.round(n * 100) / 100;
const DEBIT_NORMAL = new Set(["asset", "expense"]);

type AcctRow = {
  id: string;
  account_code: string | null;
  account_type: string;
  opening_balance: number | null;
  opening_balance_date: string | null;
};

export async function syncOpeningBalanceJv(supabase: SupabaseClient): Promise<void> {
  try {
    const [{ data: accts }, { data: existing }] = await Promise.all([
      supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_type, opening_balance, opening_balance_date"),
      supabase.from("journal_vouchers").select("id").eq("narration", ACCOUNT_OPENING_NARRATION),
    ]);

    const jvId = (existing ?? [])[0]?.id ?? null;

    // যে account-গুলোর opening balance ধরা হবে
    const rows = ((accts ?? []) as AcctRow[]).filter((a) => {
      const code = String(a.account_code ?? "").trim();
      return !AUTO_OPENING_CODES.has(code) && Math.abs(Number(a.opening_balance) || 0) >= 0.005;
    });

    const lines: { account_id: string; debit: number; credit: number; memo: string }[] = [];
    for (const a of rows) {
      const bal = round2(Number(a.opening_balance) || 0);
      const onDebitSide = DEBIT_NORMAL.has(a.account_type) ? bal > 0 : bal < 0;
      const amt = Math.abs(bal);
      lines.push({
        account_id: a.id,
        debit: onDebitSide ? amt : 0,
        credit: onDebitSide ? 0 : amt,
        memo: "Opening balance",
      });
    }

    // balance না থাকলে পুরনো JV সরিয়ে দিন
    if (lines.length === 0) {
      if (jvId) {
        await supabase.from("journal_entry_lines").delete().eq("voucher_id", jvId);
        await supabase.from("journal_vouchers").delete().eq("id", jvId);
      }
      return;
    }

    // net balancing line → 3900 Opening Balance Equity
    const totalDr = round2(lines.reduce((s, l) => s + l.debit, 0));
    const totalCr = round2(lines.reduce((s, l) => s + l.credit, 0));
    const diff = round2(totalDr - totalCr);
    if (Math.abs(diff) >= 0.005) {
      const { data: obe } = await supabase
        .from("chart_of_accounts").select("id").eq("account_code", OBE_CODE).maybeSingle();
      if (!obe) return; // 3900 নেই — চুপচাপ বাদ
      lines.push({
        account_id: obe.id,
        debit: diff < 0 ? -diff : 0,
        credit: diff > 0 ? diff : 0,
        memo: "Opening Balance Equity (balancing)",
      });
    }

    const makeLines = (voucherId: string) => lines.map((l) => ({ voucher_id: voucherId, ...l }));

    if (jvId) {
      // অঙ্ক রিফ্রেশ — voucher নম্বর ও তারিখ অপরিবর্তিত
      await supabase.from("journal_entry_lines").delete().eq("voucher_id", jvId);
      await supabase.from("journal_entry_lines").insert(makeLines(jvId));
      return;
    }

    // নতুন JV — তারিখ = balance-থাকা account-দের সবচেয়ে আগের opening_balance_date
    const dates = rows
      .map((a) => a.opening_balance_date)
      .filter((d): d is string => !!d)
      .sort();
    const date = dates[0] ?? new Date().toISOString().slice(0, 10);

    const voucherNo = await generateNextDocNo(
      supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", date
    );
    const createdBy = await getCurrentUserId(supabase);
    const { data: voucher } = await supabase
      .from("journal_vouchers")
      .insert({ voucher_no: voucherNo, voucher_date: date, narration: ACCOUNT_OPENING_NARRATION, created_by: createdBy })
      .select("id")
      .single();
    if (!voucher) return;

    await supabase.from("journal_entry_lines").insert(makeLines(voucher.id));
  } catch {
    // best-effort — account অপারেশন আটকাবে না
  }
}
