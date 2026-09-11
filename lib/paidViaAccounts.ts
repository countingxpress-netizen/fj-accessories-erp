// "Paid Via" অ্যাকাউন্ট তালিকা — Cash + Bank অ্যাকাউন্ট + Md Abu Jafor (3000) + রিপন থিনার (1500)।
// Purchase Freight (in-form ও standalone) — দুই জায়গায় একই তালিকা লাগে (বাকিতে দেওয়া হয় না)।

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

export type PaidViaAccount = { id: string; account_code: string; account_name: string };

// cash/bank নামের বাইরে যেসব পার্টি-অ্যাকাউন্টও "প্রায়-নগদ" Paid Via উৎস (lib/daybook.ts-এর
// sourceIds-এর সাথে সামঞ্জস্যপূর্ণ রাখতে হবে — নতুন পার্টি এখানে যোগ হলে ওখানেও যোগ করা লাগবে)।
const EXTRA_PAID_VIA_CODES = ["1500", "3000"]; // রিপন থিনার, আবু জাফর

export async function loadPaidViaAccounts(supabase: Client): Promise<PaidViaAccount[]> {
  const { data: cashBank } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name")
    .eq("account_type", "asset")
    .or("account_name.ilike.%cash%,account_name.ilike.%bank%")
    .order("account_code");

  const { data: extra } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name")
    .in("account_code", EXTRA_PAID_VIA_CODES)
    .order("account_code");

  return [...(cashBank ?? []), ...(extra ?? [])];
}
