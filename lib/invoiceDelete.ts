import { createClient } from "@/lib/supabase/client";
import { DeleteResult } from "@/lib/deleteResult";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Deletes a Sales Invoice along with its items and, if present, the linked
 * Journal Voucher (+ its entry lines) — matches the FK cleanup requirement
 * from CLAUDE.md (invoice delete must remove the linked JV).
 */
export async function deleteInvoiceCascade(
  supabase: SupabaseClient,
  invoiceId: string,
  voucherId?: string | null
): Promise<DeleteResult> {
  if (voucherId) {
    await supabase.from("journal_entry_lines").delete().eq("voucher_id", voucherId);
    await supabase.from("journal_vouchers").delete().eq("id", voucherId);
  }
  await supabase.from("sales_invoice_items").delete().eq("invoice_id", invoiceId);
  const { error } = await supabase.from("sales_invoices").delete().eq("id", invoiceId);

  if (error) return { ok: false, error: "মুছে ফেলা যায়নি: " + error.message };
  return { ok: true };
}
