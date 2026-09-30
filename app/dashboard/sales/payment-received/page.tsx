import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PaymentForm from "./PaymentForm";
import PaymentReceivedTable from "./PaymentReceivedTable";
import { loadCustomerDues } from "@/lib/paymentDues";

export default async function PaymentReceivedPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name, opening_balance, opening_balance_date").order("name");
  const { data: cashBankAccounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name")
    .eq("account_type", "asset")
    .or("account_name.ilike.%cash%,account_name.ilike.%bank%")
    .order("account_code");

  // Md Abu Jafor (3000) সরাসরি কালেক্ট করলেও "Deposit To"-তে বাছা যায়
  const { data: mdJaforAccount } = await supabase
    .from("chart_of_accounts").select("id, account_code, account_name")
    .eq("account_code", "3000").maybeSingle();
  const depositAccounts = mdJaforAccount ? [...(cashBankAccounts ?? []), mdJaforAccount] : (cashBankAccounts ?? []);

  // বকেয়া = Opening + Sales Invoice + কাঁচামাল/ওয়েস্টেজ বাকি-বিক্রি (lib/paymentDues.ts)
  const invoicesByCustomer = await loadCustomerDues(supabase);

  const { data: payments } = await supabase
    .from("customer_payments")
    .select("*, customers(name), creator:app_users!customer_payments_created_by_fkey(full_name)")
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Customer Payment Received</h1>
        <Link href="/dashboard/sales" className="text-sm text-gray-500 hover:underline">← Sales-এ ফিরুন</Link>
      </div>

      <PaymentForm customers={customers ?? []} cashBankAccounts={depositAccounts} invoicesByCustomer={invoicesByCustomer} />

      <PaymentReceivedTable payments={payments ?? []} />
    </div>
  );
}