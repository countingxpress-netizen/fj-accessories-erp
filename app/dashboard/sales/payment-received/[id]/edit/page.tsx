import { createClient } from "@/lib/supabase/server";
import EditPaymentForm from "./EditPaymentForm";
import { notFound } from "next/navigation";
import { loadCustomerDues, allocationKey } from "@/lib/paymentDues";

export default async function EditPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: payment } = await supabase.from("customer_payments").select("*, customers(name, opening_balance, opening_balance_date)").eq("id", id).single();
  if (!payment) return notFound();

  const { data: cashBankAccounts } = await supabase
    .from("chart_of_accounts").select("id, account_code, account_name")
    .eq("account_type", "asset").or("account_name.ilike.%cash%,account_name.ilike.%bank%").order("account_code");

  // Md Abu Jafor (3000) সরাসরি কালেক্ট করলেও "Deposit To"-তে বাছা যায় (আগে এভাবে সেভ করা payment এডিটেও দরকার)
  const { data: mdJaforAccount } = await supabase
    .from("chart_of_accounts").select("id, account_code, account_name")
    .eq("account_code", "3000").maybeSingle();
  const depositAccounts = mdJaforAccount ? [...(cashBankAccounts ?? []), mdJaforAccount] : (cashBankAccounts ?? []);

  // এই payment-এর নিজের allocation (key → টাকা) — key ফরম্যাট lib/paymentDues.ts দেখুন
  const { data: thisPaymentAllocations } = await supabase
    .from("payment_allocations").select("invoice_id, raw_material_sale_id, wastage_sale_id, customer_adjustment_id, amount").eq("payment_id", id);
  const currentAllocationMap: Record<string, number> = {};
  (thisPaymentAllocations ?? []).forEach((a: any) => {
    const key = allocationKey(a);
    currentAllocationMap[key] = (currentAllocationMap[key] ?? 0) + Number(a.amount || 0);
  });

  // এই payment বাদে বাকি সব payment-এর allocation বাদ দিয়ে "available due" (Opening + Invoice +
  // কাঁচামাল/ওয়েস্টেজ বাকি-বিক্রি); আগে allocate করা লাইন due 0 হলেও তালিকায় থাকে।
  const dues = await loadCustomerDues(supabase, {
    customerId: payment.customer_id,
    excludePaymentId: id,
    keepKeys: new Set(Object.keys(currentAllocationMap).filter((k) => currentAllocationMap[k] > 0)),
  });
  const invoices = dues[payment.customer_id] ?? [];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Payment এডিট করুন — {payment.customers?.name}</h1>
      <EditPaymentForm
        payment={payment}
        cashBankAccounts={depositAccounts}
        invoices={invoices}
        currentAllocationMap={currentAllocationMap}
      />
    </div>
  );
}