import { SupabaseClient } from "@supabase/supabase-js";

export async function generateNextDocNo(
  supabase: SupabaseClient,
  table: string,
  column: string,
  prefix: string,
  dateColumn: string,
  dateValue: string
): Promise<string> {
  const year = new Date(dateValue).getFullYear();
  const { data } = await supabase
    .from(table)
    .select(column)
    .gte(dateColumn, `${year}-01-01`)
    .lte(dateColumn, `${year}-12-31`)
    .ilike(column, `${prefix}-${year}-%`);

  let maxNum = 0;
  (data ?? []).forEach((row: any) => {
    const val = row[column] as string;
    const match = val?.match(new RegExp(`${prefix}-${year}-(\\d+)$`));
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  });

  return `${prefix}-${year}-${String(maxNum + 1).padStart(4, "0")}`;
}