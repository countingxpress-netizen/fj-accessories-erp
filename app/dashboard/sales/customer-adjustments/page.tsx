import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetchAll";
import CustomerAdjustmentForm from "./CustomerAdjustmentForm";
import CustomerAdjustmentRow from "./CustomerAdjustmentRow";

export default async function CustomerAdjustmentsPage() {
  const supabase = await createClient();

  const [{ data: customers }, { data: accounts }] = await Promise.all([
    supabase.from("customers").select("id, name").order("name"),
    // 1100 (Accounts Receivable) নিজেই এক পাশ — বিপরীত account হিসেবে বাদ
    supabase.from("chart_of_accounts").select("id, account_code, account_name, account_type")
      .eq("is_active", true).neq("account_code", "1100").order("account_code"),
  ]);

  const adjustments = await fetchAllRows<any>(
    supabase, "customer_adjustments",
    "*, customers(name), contra:chart_of_accounts!customer_adjustments_contra_account_id_fkey(account_code, account_name), journal_vouchers(voucher_no), creator:app_users!customer_adjustments_created_by_fkey(full_name)",
    (q) => q.order("adj_date", { ascending: false }).order("created_at", { ascending: false })
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">কাস্টমার এডজাস্টমেন্ট</h1>
        <Link href="/dashboard/sales" className="text-sm text-gray-500 hover:underline">← Sales-এ ফিরুন</Link>
      </div>
      <p className="text-sm text-gray-500 -mt-3 mb-4">
        কোনো বিক্রি বা পেমেন্ট ছাড়াই কাস্টমারের বাকিতে টাকা যোগ করা বা বাকি কমানো, বিপরীতে অন্য একটা account।
        যেমন মুন্না-3-এর কমিশন এটি এক্সেসোরিজ-এর বাকিতে যোগ: Customer = এটি এক্সেসোরিজ, ধরন = বাকিতে যোগ,
        বিপরীত Account = 2710 মুন্না-3 → JV: Dr 1100 / Cr 2710। Customer Ledger, Outstanding, Receivable ও
        Payment Received-এ দেখাবে।
      </p>

      <CustomerAdjustmentForm customers={customers ?? []} accounts={accounts ?? []} />

      <div className="mt-6 overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">No</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">ধরন</th>
              <th className="px-4 py-2">বিপরীত Account</th>
              <th className="px-4 py-2">Note</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {adjustments.map((a: any) => <CustomerAdjustmentRow key={a.id} adj={a} />)}
            {adjustments.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-3 text-gray-400 italic">এখনো কোনো এডজাস্টমেন্ট নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
