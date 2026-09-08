// "Paid Via" অ্যাকাউন্ট তালিকা — Cash + Bank অ্যাকাউন্ট + Md Abu Jafor (3000)।
// Expenses ও Purchase Freight — দুই জায়গায় একই তালিকা লাগে (বাকিতে দেওয়া হয় না)।

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

export type PaidViaAccount = { id: string; account_code: string; account_name: string };

export async function loadPaidViaAccounts(supabase: Client): Promise<PaidViaAccount[]> {
  const { data: cashBank } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name")
    .eq("account_type", "asset")
    .or("account_name.ilike.%cash%,account_name.ilike.%bank%")
    .order("account_code");

  const { data: mdJafor } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name")
    .eq("account_code", "3000")
    .maybeSingle();

  return mdJafor ? [...(cashBank ?? []), mdJafor] : (cashBank ?? []);
}
