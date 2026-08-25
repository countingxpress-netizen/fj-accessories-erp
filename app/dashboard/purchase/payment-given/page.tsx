import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PaymentGivenForm from "./PaymentGivenForm";
import PaymentGivenTable from "./PaymentGivenTable";

export default async function PaymentGivenPage() {
  const supabase = await createClient();
  const { data: suppliers } = await supabase.from("suppliers").select("id, name").order("name");
  const { data: cashBankAccounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name")
    .eq("account_type", "asset")
    .or("account_name.ilike.%cash%,account_name.ilike.%bank%")
    .order("account_code");

  const { data: payments } = await supabase
    .from("supplier_payments")
    .select("*, suppliers(name)")
    .order("payment_date", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Supplier Payment Given</h1>
        <Link href="/dashboard/purchase" className="text-sm text-gray-500 hover:underline">← Purchase-এ ফিরুন</Link>
      </div>

      <PaymentGivenForm suppliers={suppliers ?? []} cashBankAccounts={cashBankAccounts ?? []} />

      <PaymentGivenTable payments={payments ?? []} />
    </div>
  );
}
