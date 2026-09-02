import { createClient } from "@/lib/supabase/client";
import { DeleteResult, friendlyDeleteError } from "@/lib/deleteResult";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Deletes a Supplier Payment along with its linked Journal Voucher. The
 * payment row is deleted BEFORE its voucher — `supplier_payments.voucher_id`
 * is a plain FK, so deleting the JV first fails silently and orphans it.
 */
export async function deleteSupplierPaymentCascade(
  supabase: SupabaseClient,
  paymentId: string,
  voucherId?: string | null
): Promise<DeleteResult> {
  const { error } = await supabase.from("supplier_payments").delete().eq("id", paymentId);
  if (error) return { ok: false, error: friendlyDeleteError(error) };

  if (voucherId) {
    await supabase.from("journal_entry_lines").delete().eq("voucher_id", voucherId);
    await supabase.from("journal_vouchers").delete().eq("id", voucherId);
  }
  return { ok: true };
}
