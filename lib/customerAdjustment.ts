import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { accountIdByCode, makeVoucher, reverseInventoryJv } from "@/lib/inventoryCost";

// কাস্টমার এডজাস্টমেন্ট — বিক্রি/পেমেন্ট ছাড়া কাস্টমারের বাকি বাড়ানো/কমানো, বিপরীতে অন্য account।
//   debit  (বাকি বাড়ে) : Dr 1100 AR / Cr contra   — যেমন মুন্না-3 (2710)-এর কমিশন এটি-র বাকিতে যোগ
//   credit (বাকি কমে)  : Dr contra / Cr 1100 AR
// বাকির হিসাবে (ledger/outstanding/receivable/dashboard/daybook) debit = +amount, credit = −amount
// — adjustmentSigned() দিয়ে সব জায়গায় একই নিয়মে যোগ হয়।

type Client = ReturnType<typeof createClient>;

const AR_CODE = "1100";

export type AdjustmentDirection = "debit" | "credit";

export type CustomerAdjustmentInput = {
  adjDate: string;
  customerId: string;
  customerName: string;
  direction: AdjustmentDirection;
  contraAccountId: string;
  contraLabel: string;
  amount: number;
  note: string;
  createdBy: string | null;
};

/** বাকির উপর প্রভাব: debit → +amount, credit → −amount */
export function adjustmentSigned(a: { direction?: string | null; amount?: number | string | null }): number {
  const amt = Number(a.amount || 0);
  return a.direction === "credit" ? -amt : amt;
}

export function adjustmentLabel(direction: string | null | undefined): string {
  return direction === "credit" ? "বাকি কমানো" : "বাকিতে যোগ";
}

export async function createCustomerAdjustment(
  supabase: Client, input: CustomerAdjustmentInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!input.customerId || !input.contraAccountId || !(input.amount > 0)) {
    return { ok: false, error: "Customer, বিপরীত Account ও টাকা দিন।" };
  }
  const arId = await accountIdByCode(supabase, AR_CODE);
  if (!arId) return { ok: false, error: "Accounts Receivable (1100) অ্যাকাউন্ট পাওয়া যায়নি।" };
  if (input.contraAccountId === arId) return { ok: false, error: "বিপরীত Account হিসেবে 1100 বাছা যাবে না।" };

  const adjNo = await generateNextDocNo(supabase, "customer_adjustments", "adj_no", "ADJ", "adj_date", input.adjDate);
  const { data: row, error } = await supabase.from("customer_adjustments").insert({
    adj_no: adjNo, adj_date: input.adjDate, customer_id: input.customerId,
    direction: input.direction, contra_account_id: input.contraAccountId,
    amount: input.amount, note: input.note || null, created_by: input.createdBy,
  }).select("id").single();
  if (error || !row) return { ok: false, error: error?.message ?? "সেভ করা যায়নি।" };

  const memo = `${adjNo} — ${input.customerName} ${input.direction === "credit" ? "←" : "→"} ${input.contraLabel}${input.note ? ` (${input.note})` : ""}`;
  const lines = input.direction === "credit"
    ? [
        { account_id: input.contraAccountId, debit: input.amount, credit: 0, memo },
        { account_id: arId, debit: 0, credit: input.amount, memo },
      ]
    : [
        { account_id: arId, debit: input.amount, credit: 0, memo },
        { account_id: input.contraAccountId, debit: 0, credit: input.amount, memo },
      ];
  const voucherId = await makeVoucher(supabase, input.adjDate, `Customer Adjustment ${memo}`, lines, "customer_adjustment");
  if (!voucherId) {
    await supabase.from("customer_adjustments").delete().eq("id", row.id);
    return { ok: false, error: "Journal Voucher তৈরি হয়নি — কিছু সেভ হয়নি।" };
  }
  await supabase.from("customer_adjustments").update({ voucher_id: voucherId }).eq("id", row.id);
  return { ok: true };
}

/** এডজাস্টমেন্ট মুছে ফেলা — JV উল্টে দেয়; এর বিপরীতে payment allocation থাকলে (cascade) মুছে যায়, টাকাটা Advance হয়ে থাকে। */
export async function deleteCustomerAdjustment(supabase: Client, adj: { id: string; voucher_id: string | null }): Promise<void> {
  await reverseInventoryJv(supabase, adj.voucher_id, {
    unlink: { table: "customer_adjustments", column: "voucher_id", id: adj.id },
  });
  await supabase.from("customer_adjustments").delete().eq("id", adj.id);
}
