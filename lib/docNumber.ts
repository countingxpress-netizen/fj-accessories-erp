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
// {docPrefix}-{year}-{NNNN} ফরম্যাটে fallback করে। এখন শুধু PI (generatePiNo)-তে
// ব্যবহৃত — Delivery Challan প্লেইন সিরিয়াল ব্যবহার করে (নিচে generateChallanNo দেখুন,
// ওখানে prefix/code লাগে না)। নতুন কোনো কোডেড ডকুমেন্ট নম্বর লাগলে এটাই রিইউজ করুন।
export function buildCustomerCodedDocNo(
  docPrefix: string,
  customer: { name?: string | null; code?: string | null } | null,
  docDate: string,
  serial: number
): string {
  const year = new Date(docDate).getFullYear();
  const code = (customer?.code || deriveCustomerCode(customer?.name || "")).toUpperCase().trim();
  if (!code) return `${docPrefix}-${year}-${String(serial).padStart(4, "0")}`;
  return `${docPrefix}/FNJ-${serial}-${code}/${year}`;
}

async function generateCustomerCodedDocNo(
  supabase: SupabaseClient,
  table: string,
  column: string,
  docPrefix: string,
  dateColumn: string,
  customer: { name?: string | null; code?: string | null } | null,
  docDate: string,
  hintNext?: number | null
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
  let maxNum = hintNext && hintNext > 0 ? hintNext - 1 : 0;
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

// Delivery Challan নম্বর — prefix/customer-code/year ছাড়া শুধু প্লেইন সিরিয়াল (কাগজের
// চালান বইয়ের নম্বরের মতো, যেমন শুধু "20399")। প্রতিটা কাস্টমারের নিজের বই/সিরিজ, তাই
// এই কাস্টমারের বিদ্যমান delivery_challans-এর challan_no-গুলোর মধ্যে সবচেয়ে বড় সংখ্যা +1
// (challan_next_serial_hint থাকলে সেটাকেও floor হিসেবে বিবেচনা করা হয়)। DB-তে
// UNIQUE(customer_id, challan_no) — তাই দুই ভিন্ন কাস্টমারের নম্বর মিলে যেতে পারে, সমস্যা না।
export async function generateChallanNo(
  supabase: SupabaseClient,
  customer: { id: string; challan_next_serial_hint?: number | null } | null,
  _challanDate: string
): Promise<string> {
  if (!customer?.id) return "1";

  const { data } = await supabase
    .from("delivery_challans")
    .select("challan_no")
    .eq("customer_id", customer.id);

  let maxNum = customer.challan_next_serial_hint && customer.challan_next_serial_hint > 0
    ? customer.challan_next_serial_hint - 1 : 0;
  (data ?? []).forEach((row: any) => {
    const n = parseInt(row.challan_no, 10);
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  });

  return String(maxNum + 1);
}