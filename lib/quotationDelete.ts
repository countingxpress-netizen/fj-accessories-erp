import { createClient } from "@/lib/supabase/client";
import { DeleteResult } from "@/lib/deleteResult";

type SupabaseClient = ReturnType<typeof createClient>;

/** Deletes a Quotation and its line items. Quotations don't touch stock or accounting. */
export async function deleteQuotationCascade(
  supabase: SupabaseClient,
  quotationId: string
): Promise<DeleteResult> {
  await supabase.from("quotation_items").delete().eq("quotation_id", quotationId);
  const { error } = await supabase.from("quotations").delete().eq("id", quotationId);

  if (error) return { ok: false, error: "মুছে ফেলা যায়নি: " + error.message };
  return { ok: true };
}
