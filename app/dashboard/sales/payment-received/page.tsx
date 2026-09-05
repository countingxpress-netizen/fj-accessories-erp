import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PaymentForm from "./PaymentForm";
import PaymentReceivedTable from "./PaymentReceivedTable";

export default async function PaymentReceivedPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name").order("name");
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

  const { data: allAllocations } = await supabase.from("payment_allocations").select("invoice_id, amount");
  const allocatedByInvoice: Record<string, number> = {};
  (allAllocations ?? []).forEach((a: any) => {
    allocatedByInvoice[a.invoice_id] = (allocatedByInvoice[a.invoice_id] ?? 0) + a.amount;
  });

  const invoicesByCustomer: Record<string, any[]> = {};
  (allInvoices ?? []).forEach((inv: any) => {
    const total = (inv.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
    const due = total - (allocatedByInvoice[inv.id] ?? 0);
    if (due > 0.01) {
      if (!invoicesByCustomer[inv.customer_id]) invoicesByCustomer[inv.customer_id] = [];
      invoicesByCustomer[inv.customer_id].push({ id: inv.id, invoice_no: inv.invoice_no, invoice_date: inv.invoice_date, total, due });
    }
  });
  Object.keys(invoicesByCustomer).forEach((cid) => {
    invoicesByCustomer[cid].sort((a, b) => a.invoice_date.localeCompare(b.invoice_date));
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