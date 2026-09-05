import { createClient } from "@/lib/supabase/server";
import EditPaymentForm from "./EditPaymentForm";
import { notFound } from "next/navigation";

export default async function EditPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: payment } = await supabase.from("customer_payments").select("*, customers(name)").eq("id", id).single();
  if (!payment) return notFound();

  const { data: cashBankAccounts } = await supabase
    .from("chart_of_accounts").select("id, account_code, account_name")
    .eq("account_type", "asset").or("account_name.ilike.%cash%,account_name.ilike.%bank%").order("account_code");

  // Md Abu Jafor (3000) সরাসরি কালেক্ট করলেও "Deposit To"-তে বাছা যায় (আগে এভাবে সেভ করা payment এডিটেও দরকার)
  const { data: mdJaforAccount } = await supabase
    .from("chart_of_accounts").select("id, account_code, account_name")
    .eq("account_code", "3000").maybeSingle();
  const depositAccounts = mdJaforAccount ? [...(cashBankAccounts ?? []), mdJaforAccount] : (cashBankAccounts ?? []);

  // এই কাস্টমারের সব Invoice, এবং এই payment ছাড়া বাকি payment-গুলোর allocation বাদ দিয়ে "available due" বের করুন
  const { data: allInvoices } = await supabase
    .from("sales_invoices")
    .select("id, invoice_no, invoice_date, sales_invoice_items(amount)")
    .eq("customer_id", payment.customer_id);

  const invoiceIds = (allInvoices ?? []).map((inv: any) => inv.id);
  const { data: otherAllocations } = invoiceIds.length
    ? await supabase.from("payment_allocations").select("invoice_id, amount, payment_id").in("invoice_id", invoiceIds).neq("payment_id", id)
    : { data: [] };

  const allocatedByOthers: Record<string, number> = {};
  (otherAllocations ?? []).forEach((a: any) => {
    allocatedByOthers[a.invoice_id] = (allocatedByOthers[a.invoice_id] ?? 0) + a.amount;
  });

  const { data: thisPaymentAllocations } = await supabase
    .from("payment_allocations").select("invoice_id, amount").eq("payment_id", id);
  const currentAllocationMap: Record<string, number> = {};
  (thisPaymentAllocations ?? []).forEach((a: any) => { currentAllocationMap[a.invoice_id] = a.amount; });

  const invoices = (allInvoices ?? [])
    .map((inv: any) => {
      const total = (inv.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
      const due = total - (allocatedByOthers[inv.id] ?? 0); // এই payment-এর নিজস্ব allocation বাদ দিয়ে যা বাকি আছে + এই payment ফিরিয়ে দিলে যা যোগ হবে
      return { id: inv.id, invoice_no: inv.invoice_no, invoice_date: inv.invoice_date, total, due };
    })
    .filter((inv: any) => inv.due > 0.009 || currentAllocationMap[inv.id] > 0)
    .sort((a: any, b: any) => a.invoice_date.localeCompare(b.invoice_date));

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