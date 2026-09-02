import { createClient } from "@/lib/supabase/client";
import { DeleteResult, friendlyDeleteError } from "@/lib/deleteResult";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Deletes an Expense entry along with its linked Journal Voucher. The expense
 * row is deleted BEFORE its voucher — `expenses.voucher_id` is a plain FK, so
 * deleting the JV first fails silently and orphans the voucher header.
 */
export async function deleteExpenseCascade(
  supabase: SupabaseClient,
  expenseId: string,
  voucherId?: string | null
): Promise<DeleteResult> {
  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
  if (error) return { ok: false, error: friendlyDeleteError(error) };

  if (voucherId) {
    await supabase.from("journal_entry_lines").delete().eq("voucher_id", voucherId);
    await supabase.from("journal_vouchers").delete().eq("id", voucherId);
  }
  return { ok: true };
}
