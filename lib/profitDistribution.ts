import type { SupabaseClient } from "@supabase/supabase-js";
import { generateNextDocNo } from "@/lib/docNumber";
import { getCurrentUserId } from "@/lib/currentUser";
import { monthRange } from "@/lib/payroll";

// মাস-শেষ প্রফিট বণ্টন:
//   লাভ  →  Dr 3100 Retained Earnings / Cr 2800 লিল্লাহ্ ফান্ড (1%) / Cr 3300 ওমর ফারুক (99%)
//   লস   →  Dr 3300 ওমর ফারুক (100%) / Cr 3100 Retained Earnings
// এক মাসে একবার (narration দিয়ে guard)।

export const RETAINED_CODE = "3100"; // Retained Earnings
export const LILLAH_CODE = "2800";   // লিল্লাহ্ ফান্ড (Receivable) — liability-এর ভেতরেই থাকে
export const OMAR_CODE = "3300";     // ওমর ফারুক – Profit Account

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const round2 = (n: number) => Math.round(n * 100) / 100;

export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

export function distributionNarration(year: number, month: number): string {
  return `Profit distribution — ${monthLabel(year, month)}`;
}

/** ওই মাসের income − expense (voucher_date-ভিত্তিক)। */
export async function monthNetProfit(
  supabase: SupabaseClient,
  year: number,
  month: number
): Promise<{ income: number; expense: number; net: number }> {
  const { start, end } = monthRange(year, month);
  const { data: accts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_type")
    .in("account_type", ["income", "expense"]);
  const typeById = new Map<string, string>((accts ?? []).map((a: any) => [a.id, a.account_type]));
  const ids = (accts ?? []).map((a: any) => a.id);
  if (!ids.length) return { income: 0, expense: 0, net: 0 };

  const { data: lines } = await supabase
    .from("journal_entry_lines")
    .select("account_id, debit, credit, journal_vouchers(voucher_date)")
    .in("account_id", ids);

  let income = 0;
  let expense = 0;
  (lines ?? []).forEach((l: any) => {
    const d = l.journal_vouchers?.voucher_date ?? "";
    if (d < start || d > end) return;
    const t = typeById.get(l.account_id);
    if (t === "income") income += (l.credit || 0) - (l.debit || 0);
    else if (t === "expense") expense += (l.debit || 0) - (l.credit || 0);
  });
  income = round2(income);
  expense = round2(expense);
  return { income, expense, net: round2(income - expense) };
}

/** ওই মাসের বণ্টন JV আগে পোস্ট হয়েছে কিনা — voucher_no ফেরত দেয়, নাহলে null। */
export async function distributedVoucherNo(
  supabase: SupabaseClient,
  year: number,
  month: number
): Promise<string | null> {
  const { data } = await supabase
    .from("journal_vouchers")
    .select("voucher_no")
    .eq("narration", distributionNarration(year, month));
  return (data ?? [])[0]?.voucher_no ?? null;
}

/** net থেকে লিল্লাহ্ (1%) ও ওমর (বাকিটা) — লাভ হলে; লস হলে ওমর = পুরোটা। */
export function splitProfit(net: number): { lillah: number; omar: number } {
  if (net > 0) {
    const lillah = round2(net * 0.01);
    return { lillah, omar: round2(net - lillah) };
  }
  return { lillah: 0, omar: round2(net) }; // net ≤ 0 → পুরোটা ওমর (ঋণাত্মক)
}

export async function postProfitDistribution(
  supabase: SupabaseClient,
  year: number,
  month: number
): Promise<{ ok: boolean; voucherNo?: string; net?: number; error?: string }> {
  const already = await distributedVoucherNo(supabase, year, month);
  if (already) return { ok: false, error: `${monthLabel(year, month)}-এর বণ্টন আগেই পোস্ট করা হয়েছে (${already})।` };

  const { net } = await monthNetProfit(supabase, year, month);
  if (Math.abs(net) < 0.005) return { ok: false, error: "এই মাসে কোনো লাভ/লস নেই।" };

  const { data: accts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code")
    .in("account_code", [RETAINED_CODE, LILLAH_CODE, OMAR_CODE]);
  const id: Record<string, string> = Object.fromEntries((accts ?? []).map((a: any) => [a.account_code, a.id]));
  if (!id[RETAINED_CODE] || !id[LILLAH_CODE] || !id[OMAR_CODE]) {
    return { ok: false, error: `অ্যাকাউন্ট পাওয়া যায়নি (${RETAINED_CODE} / ${LILLAH_CODE} / ${OMAR_CODE})।` };
  }

  const { end } = monthRange(year, month);
  const narration = distributionNarration(year, month);
  const voucherNo = await generateNextDocNo(supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", end);
  const createdBy = await getCurrentUserId(supabase);
  const { data: v, error: vErr } = await supabase
    .from("journal_vouchers")
    .insert({ voucher_no: voucherNo, voucher_date: end, narration, created_by: createdBy })
    .select("id")
    .single();
  if (vErr || !v) return { ok: false, error: vErr?.message ?? "Voucher তৈরি ব্যর্থ।" };

  let lines: { account_id: string; debit: number; credit: number; memo: string }[];
  if (net > 0) {
    const { lillah, omar } = splitProfit(net);
    lines = [
      { account_id: id[RETAINED_CODE], debit: net, credit: 0, memo: narration },
      { account_id: id[LILLAH_CODE], debit: 0, credit: lillah, memo: `${narration} — 1% লিল্লাহ্` },
      { account_id: id[OMAR_CODE], debit: 0, credit: omar, memo: `${narration} — 99% ওমর` },
    ];
  } else {
    const loss = round2(-net);
    lines = [
      { account_id: id[OMAR_CODE], debit: loss, credit: 0, memo: `${narration} — লস` },
      { account_id: id[RETAINED_CODE], debit: 0, credit: loss, memo: `${narration} — লস` },
    ];
  }

  const { error: lErr } = await supabase.from("journal_entry_lines").insert(lines.map((l) => ({ voucher_id: v.id, ...l })));
  if (lErr) return { ok: false, error: lErr.message };
  return { ok: true, voucherNo, net };
}
