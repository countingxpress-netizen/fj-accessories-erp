import { createClient } from "@/lib/supabase/client";
import { DeleteResult, friendlyDeleteError } from "@/lib/deleteResult";
import { reverseInvoiceCogs } from "@/lib/invoiceCogs";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Deletes a Sales Invoice along with its items and, if present, the linked
 * Journal Voucher (+ its entry lines) — matches the FK cleanup requirement
 * from CLAUDE.md (invoice delete must remove the linked JV).
 *
 * Order matters: `sales_invoices.voucher_id` is a plain FK (no ON DELETE
 * action), so the JV can only be deleted AFTER the invoice row that points to
 * it is gone. Deleting the JV first raises a swallowed FK error and leaves an
 * orphan voucher header behind.
 */
export async function deleteInvoiceCascade(
  supabase: SupabaseClient,
  invoiceId: string,
  voucherId?: string | null
): Promise<DeleteResult> {
  // বিক্রির COGS উল্টে (WIP ফেরত) — invoice_cogs সারি invoice-এর সাথে cascade হলেও JV/wip নিজে ফেরত আসে না
  await reverseInvoiceCogs(supabase, invoiceId);
  await supabase.from("sales_invoice_items").delete().eq("invoice_id", invoiceId);
  const { error } = await supabase.from("sales_invoices").delete().eq("id", invoiceId);
  if (error) return { ok: false, error: friendlyDeleteError(error) };

  if (voucherId) {
    await supabase.from("journal_entry_lines").delete().eq("voucher_id", voucherId);
    await supabase.from("journal_vouchers").delete().eq("id", voucherId);
  }
  return { ok: true };
}
