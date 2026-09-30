import type { SupabaseClient } from "@supabase/supabase-js";

// Supabase/PostgREST caps a single .select() at 1000 rows by default. Reports that
// pull an entire table unfiltered (journal_entry_lines is 2600+ rows and growing)
// were silently truncated, producing wrong totals. This pages through with .range()
// until a page comes back short, so callers always get every row.
// applyFilter (optional) adds .eq/.in/... to each page's query, e.g.
//   fetchAllRows(sb, "journal_entry_lines", "debit, credit", (q) => q.eq("account_id", id))
export async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  applyFilter?: (q: any) => any
): Promise<T[]> {
  const PAGE = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q: any = supabase.from(table).select(select);
    if (applyFilter) q = applyFilter(q);
    const { data } = await q.order("id", { ascending: true }).range(from, from + PAGE - 1);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

// .in(column, ids) with a long id list both hits the 1000-row cap and can blow past the
// URL length limit (each uuid ≈ 37 chars in the query string). This splits ids into
// chunks, pages each chunk with fetchAllRows, and concatenates. Order across chunks is
// not preserved — callers that need an order should sort the result themselves.
export async function fetchAllRowsIn<T>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  column: string,
  ids: (string | null | undefined)[],
  applyFilter?: (q: any) => any
): Promise<T[]> {
  const uniq = [...new Set(ids.filter(Boolean) as string[])];
  if (uniq.length === 0) return [];
  const CHUNK = 150;
  const chunks: string[][] = [];
  for (let i = 0; i < uniq.length; i += CHUNK) chunks.push(uniq.slice(i, i + CHUNK));
  const results = await Promise.all(
    chunks.map((chunk) =>
      fetchAllRows<T>(supabase, table, select, (q) => {
        const withIn = q.in(column, chunk);
        return applyFilter ? applyFilter(withIn) : withIn;
      })
    )
  );
  return results.flat();
}
