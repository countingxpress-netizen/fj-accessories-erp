import type { SupabaseClient } from "@supabase/supabase-js";

// Supabase/PostgREST caps a single .select() at 1000 rows by default. Reports that
// pull an entire table unfiltered (journal_entry_lines is 1300+ rows and growing)
// were silently truncated, producing wrong totals. This pages through with .range()
// until a page comes back short, so callers always get every row.
export async function fetchAllRows<T>(supabase: SupabaseClient, table: string, select: string): Promise<T[]> {
  const PAGE = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase.from(table).select(select).order("id", { ascending: true }).range(from, from + PAGE - 1);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}
