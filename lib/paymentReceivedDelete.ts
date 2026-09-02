import { createClient } from "@/lib/supabase/client";
import { DeleteResult, friendlyDeleteError } from "@/lib/deleteResult";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Deletes a Customer Payment along with its invoice allocations and linked
 * Journal Voucher. The payment row is deleted BEFORE its voucher —
 * `customer_payments.voucher_id` is a plain FK, so deleting the JV first
 * fails (silently) and orphans the voucher header.
 */
export async function deleteCustomerPaymentCascade(
  supabase: SupabaseClient,
  paymentId: string,
  voucherId?: string | null
): Promise<DeleteResult> {
  await supabase.from("payment_allocations").delete().eq("payment_id", paymentId);
  const { error } = await supabase.from("customer_payments").delete().eq("id", paymentId);
  if (error) return { ok: false, error: friendlyDeleteError(error) };

  if (voucherId) {
    await supabase.from("journal_entry_lines").delete().eq("voucher_id", voucherId);
    await supabase.from("journal_vouchers").delete().eq("id", voucherId);
  }
  return { ok: true };
}
