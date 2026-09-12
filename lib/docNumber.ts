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

// Customer নাম থেকে short code সাজেস্ট করা (এডিটেবল, unique হতে হবে):
//   "AT Accessories"       → "AT"   (প্রথম শব্দ ≤3 অক্ষর হলে সেটাই)
//   "Network Apparels Ltd" → "NAL"  (প্রতি শব্দের আদ্যক্ষর)
//   "Rubel-Hams"           → "RH"
export function deriveCustomerCode(name: string): string {
  const words = (name || "").trim().split(/[\s\-_.]+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  if (words[0].length <= 3) return words[0].toUpperCase();
  return words.map((w) => w[0]).join("").toUpperCase();
}

// কাস্টমার-প্রতি আলাদা সিরিজ: {docPrefix}/FNJ-{seq}-{CODE}/{year} — seq প্রতি কাস্টমারের
// নিজের কোডের মধ্যে সবচেয়ে বড় সংখ্যা +1 (কখনো delete হলেও ঠিক থাকে, count-based না)।
// customer-এর code না থাকলে নাম থেকে ডিরাইভ; একেবারেই না পেলে পুরনো গ্লোবাল
// {docPrefix}-{year}-{NNNN} ফরম্যাটে fallback করে। PI (generatePiNo) আর Delivery
// Challan (generateChallanNo) দুটোতেই ব্যবহৃত — নতুন কোনো ডকুমেন্টেও একই প্যাটার্নে
// কাস্টমার-ভিত্তিক নম্বর লাগলে এটাই রিইউজ করুন।
async function generateCustomerCodedDocNo(
  supabase: SupabaseClient,
  table: string,
  column: string,
  docPrefix: string,
  dateColumn: string,
  customer: { name?: string | null; code?: string | null } | null,
  docDate: string
): Promise<string> {
  const year = new Date(docDate).getFullYear();
  const code = (customer?.code || deriveCustomerCode(customer?.name || "")).toUpperCase().trim();

  if (!code) {
    return generateNextDocNo(supabase, table, column, docPrefix, dateColumn, docDate);
  }

  const { data } = await supabase
    .from(table)
    .select(column)
    .ilike(column, `${docPrefix}/FNJ-%-${code}/%`);

  const re = new RegExp(`^${docPrefix}/FNJ-(\\d+)-${code}/`, "i");
  let maxNum = 0;
  (data ?? []).forEach((row: any) => {
    const m = (row[column] as string)?.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  });

  return `${docPrefix}/FNJ-${maxNum + 1}-${code}/${year}`;
}

export async function generatePiNo(
  supabase: SupabaseClient,
  customer: { name?: string | null; code?: string | null } | null,
  piDate: string
): Promise<string> {
  return generateCustomerCodedDocNo(supabase, "proforma_invoices", "pi_no", "PI", "pi_date", customer, piDate);
}

export async function generateChallanNo(
  supabase: SupabaseClient,
  customer: { name?: string | null; code?: string | null } | null,
  challanDate: string
): Promise<string> {
  return generateCustomerCodedDocNo(supabase, "delivery_challans", "challan_no", "DC", "challan_date", customer, challanDate);
}