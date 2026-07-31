import { createClient } from "@/lib/supabase/server";
import EditPaymentForm from "./EditPaymentForm";
import { notFound } from "next/navigation";

export default async function EditPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: payment } = await supabase.from("customer_payments").select("*").eq("id", id).single();
  if (!payment) return notFound();

  const { data: cashBankAccounts } = await supabase
    .from("chart_of_accounts").select("id, account_code, account_name")
    .eq("account_type", "asset").or("account_name.ilike.%cash%,account_name.ilike.%bank%").order("account_code");

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Payment এডিট করুন</h1>
      <EditPaymentForm payment={payment} cashBankAccounts={cashBankAccounts ?? []} />
    </div>
  );
}