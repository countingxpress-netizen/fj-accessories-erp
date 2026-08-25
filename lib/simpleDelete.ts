import { createClient } from "@/lib/supabase/client";
import { DeleteResult } from "@/lib/deleteResult";

type SupabaseClient = ReturnType<typeof createClient>;

/** Plain single-table delete by id — for Customers/Suppliers/Journal Vouchers, no cascade. */
export async function deleteSimpleRow(
  supabase: SupabaseClient,
  table: string,
  id: string
): Promise<DeleteResult> {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return { ok: false, error: "মুছে ফেলা যায়নি: " + error.message };
  return { ok: true };
}
