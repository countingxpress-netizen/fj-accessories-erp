import { createClient } from "@/lib/supabase/client";
import { DeleteResult, friendlyDeleteError } from "@/lib/deleteResult";

type SupabaseClient = ReturnType<typeof createClient>;

/** Deletes a Supplier Payment along with its linked Journal Voucher. */
export async function deleteSupplierPaymentCascade(
  supabase: SupabaseClient,
  paymentId: string,
  voucherId?: string | null
): Promise<DeleteResult> {
  if (voucherId) {
    await supabase.from("journal_entry_lines").delete().eq("voucher_id", voucherId);
    await supabase.from("journal_vouchers").delete().eq("id", voucherId);
  }
  const { error } = await supabase.from("supplier_payments").delete().eq("id", paymentId);

  if (error) return { ok: false, error: friendlyDeleteError(error) };
  return { ok: true };
}
