import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import PaymentForm from "./PaymentForm";

export default async function PaymentReceivedPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name").order("name");
  const { data: cashBankAccounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name")
    .eq("account_type", "asset")
    .or("account_name.ilike.%cash%,account_name.ilike.%bank%")
    .order("account_code");

  const { data: payments } = await supabase
    .from("customer_payments")
    .select("*, customers(name)")
    .order("payment_date", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Customer Payment Received</h1>
        <Link href="/dashboard/sales" className="text-sm text-gray-500 hover:underline">← Sales-এ ফিরুন</Link>
      </div>

      <PaymentForm customers={customers ?? []} cashBankAccounts={cashBankAccounts ?? []} />

      <div className="mt-6 overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Note</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(payments ?? []).map((p: any) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-2 text-gray-500">{formatDate(p.payment_date)}</td>
                <td className="px-4 py-2">{p.customers?.name ?? "-"}</td>
                <td className="px-4 py-2 text-gray-500">{p.note || "-"}</td>
                <td className="px-4 py-2 text-right">{p.amount.toFixed(2)}</td>
              </tr>
            ))}
            {(!payments || payments.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Payment নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}