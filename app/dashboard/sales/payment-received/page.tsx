import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PaymentForm from "./PaymentForm";
import PaymentReceivedTable from "./PaymentReceivedTable";

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

  const { data: allInvoices } = await supabase
    .from("sales_invoices")
    .select("id, invoice_no, invoice_date, customer_id, sales_invoice_items(amount)");

  // invoice_id NULL হলে সেই allocation Opening Balance-এর বিপরীতে — customer_payments জয়েন করে
  // কোন কাস্টমারের Opening Balance কত পরিশোধ হয়েছে সেটা বের করা হচ্ছে।
  const { data: allAllocations } = await supabase
    .from("payment_allocations")
    .select("invoice_id, amount, customer_payments(customer_id)");
  const allocatedByInvoice: Record<string, number> = {};
  const openingPaidByCustomer: Record<string, number> = {};
  (allAllocations ?? []).forEach((a: any) => {
    if (a.invoice_id) {
      allocatedByInvoice[a.invoice_id] = (allocatedByInvoice[a.invoice_id] ?? 0) + a.amount;
    } else if (a.customer_payments?.customer_id) {
      const cid = a.customer_payments.customer_id;
      openingPaidByCustomer[cid] = (openingPaidByCustomer[cid] ?? 0) + a.amount;
    }
  });

  const invoicesByCustomer: Record<string, any[]> = {};
  (customers ?? []).forEach((c: any) => {
    const openingDue = (c.opening_balance ?? 0) - (openingPaidByCustomer[c.id] ?? 0);
    if (openingDue > 0.01) {
      invoicesByCustomer[c.id] = [{
        id: "opening", invoice_no: "Opening Balance (পূর্বের বাকি)",
        invoice_date: c.opening_balance_date ?? "2000-01-01",
        total: c.opening_balance, due: openingDue, isOpening: true,
      }];
    }
  });
  (allInvoices ?? []).forEach((inv: any) => {
    const total = (inv.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
    const due = total - (allocatedByInvoice[inv.id] ?? 0);
    if (due > 0.01) {
      if (!invoicesByCustomer[inv.customer_id]) invoicesByCustomer[inv.customer_id] = [];
      invoicesByCustomer[inv.customer_id].push({ id: inv.id, invoice_no: inv.invoice_no, invoice_date: inv.invoice_date, total, due });
    }
  });
  Object.keys(invoicesByCustomer).forEach((cid) => {
    invoicesByCustomer[cid].sort((a, b) => {
      if (a.isOpening) return -1;
      if (b.isOpening) return 1;
      return a.invoice_date.localeCompare(b.invoice_date);
    });
  });

  const { data: payments } = await supabase
    .from("customer_payments")
    .select("*, customers(name), creator:app_users!customer_payments_created_by_fkey(full_name)")
    .order("payment_date", { ascending: false });

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