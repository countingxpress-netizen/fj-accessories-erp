import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { notFound } from "next/navigation";
import PaymentActions from "./PaymentActions";
import { money } from "@/lib/format";

export default async function PaymentViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("customer_payments")
    .select("*, customers(name, address, phone)")
    .eq("id", id).single();

  if (!payment) return notFound();

  const { data: depositAccount } = payment.deposit_account_id
    ? await supabase.from("chart_of_accounts").select("account_code, account_name").eq("id", payment.deposit_account_id).single()
    : { data: null };

  const { data: allocations } = await supabase
    .from("payment_allocations")
    .select("*, sales_invoices(invoice_no, invoice_date), raw_material_sales(sale_no, sale_date), wastage_sales(sale_no, sale_date), customer_adjustments(adj_no, adj_date)")
    .eq("payment_id", id);

  // Payment Amount-এর যেটুকু কোনো Invoice-এ apply করা নেই সেটাই Advance (কোনো Invoice-এর
  // সাথে যুক্ত না) — Customer Ledger/Outstanding-এর হিসাব payment.amount থেকেই চলে,
  // তাই এটা এমনিতেই Advance/Credit হিসেবে ধরা পড়ে, নতুন Invoice এলে অটো এডজাস্ট হবে।
  const totalApplied = (allocations ?? []).reduce((s: number, a: any) => s + (a.amount || 0), 0);
  const advancePortion = Number(payment.amount || 0) - totalApplied;

  return (
    <div>
      <Link href="/dashboard/sales/payment-received" className="text-sm text-gray-500 hover:underline">← সব Payment-এর তালিকায় ফিরুন</Link>

      <div className="flex items-center justify-between mt-2 mb-4">
        <h1 className="text-2xl font-semibold">Payment — {payment.customers?.name}</h1>
        <div className="flex gap-2">
          <PaymentActions paymentId={id} voucherId={payment.voucher_id} recordLabel={`${payment.customers?.name ?? ""} ${formatDate(payment.payment_date)}`} />
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm mb-4 text-sm space-y-1">
        <p><span className="text-gray-500">Customer:</span> {payment.customers?.name}</p>
        <p><span className="text-gray-500">Payment Date:</span> {formatDate(payment.payment_date)}</p>
        <p><span className="text-gray-500">Payment Mode:</span> {(payment.payment_mode ?? "cash").replace(/_/g, " ")}</p>
        <p><span className="text-gray-500">Deposit To:</span> {depositAccount ? `${depositAccount.account_code} - ${depositAccount.account_name}` : "-"}</p>
        {payment.bank_charges > 0 && <p><span className="text-gray-500">Bank Charges:</span> {money(payment.bank_charges)}</p>}
        <p><span className="text-gray-500">Note:</span> {payment.note || "-"}</p>
        <p className="text-base font-semibold"><span className="text-gray-500 font-normal">Total Amount:</span> {money(payment.amount)}</p>
        {advancePortion > 0.01 && (
          <p className="text-amber-700"><span className="text-gray-500">Advance (কোনো Invoice ছাড়া):</span> {money(advancePortion)}</p>
        )}
      </div>

      <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">Applied To Invoices</h2>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr><th className="px-4 py-2">Invoice / বিক্রি No</th><th className="px-4 py-2">Date</th><th className="px-4 py-2 text-right">Amount Applied</th></tr>
          </thead>
          <tbody>
            {(allocations ?? []).map((a: any) => {
              // কোন বকেয়ার বিপরীতে — Invoice / কাঁচামাল বিক্রি / ওয়েস্টেজ বিক্রি / (কিছু না হলে) Opening Balance
              const label = a.sales_invoices?.invoice_no
                ?? (a.raw_material_sales ? `${a.raw_material_sales.sale_no} (কাঁচামাল বিক্রি)` : null)
                ?? (a.wastage_sales ? `${a.wastage_sales.sale_no} (ওয়েস্টেজ বিক্রি)` : null)
                ?? (a.customer_adjustments ? `${a.customer_adjustments.adj_no} (এডজাস্টমেন্ট)` : null)
                ?? "Opening Balance (পূর্বের বাকি)";
              const date = a.sales_invoices?.invoice_date ?? a.raw_material_sales?.sale_date ?? a.wastage_sales?.sale_date ?? a.customer_adjustments?.adj_date;
              return (
              <tr key={a.id} className="border-t">
                <td className="px-4 py-2">{label}</td>
                <td className="px-4 py-2 text-gray-500">{date ? formatDate(date) : "-"}</td>
                <td className="px-4 py-2 text-right">{money(a.amount)}</td>
              </tr>
              );
            })}
            {(!allocations || allocations.length === 0) && (
              <tr><td colSpan={3} className="px-4 py-3 text-gray-400 italic">কোনো Invoice-এ Apply করা হয়নি</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}