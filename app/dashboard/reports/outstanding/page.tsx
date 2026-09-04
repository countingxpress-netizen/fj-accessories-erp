import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";

export default async function OutstandingReportPage() {
  const supabase = await createClient();

  const { data: customers } = await supabase.from("customers").select("id, name, opening_balance");
  const { data: invoices } = await supabase.from("sales_invoices").select("customer_id, sales_invoice_items(amount)");
  const { data: customerPayments } = await supabase.from("customer_payments").select("customer_id, amount");

  const customerDue: Record<string, number> = {};
  (customers ?? []).forEach((c: any) => {
    if (c.opening_balance) customerDue[c.id] = (customerDue[c.id] ?? 0) + c.opening_balance;
  });
  (invoices ?? []).forEach((inv: any) => {
    const amt = (inv.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
    customerDue[inv.customer_id] = (customerDue[inv.customer_id] ?? 0) + amt;
  });
  (customerPayments ?? []).forEach((p: any) => {
    customerDue[p.customer_id] = (customerDue[p.customer_id] ?? 0) - p.amount;
  });

  const { data: suppliers } = await supabase.from("suppliers").select("id, name");
  const { data: purchases } = await supabase.from("purchase_entries").select("supplier_id, purchase_entry_items(quantity_lbs, rate_per_lbs)");
  const { data: supplierPayments } = await supabase.from("supplier_payments").select("supplier_id, amount");

  const supplierDue: Record<string, number> = {};
  (purchases ?? []).forEach((p: any) => {
    const amt = (p.purchase_entry_items ?? []).reduce((s: number, i: any) => s + i.quantity_lbs * i.rate_per_lbs, 0);
    supplierDue[p.supplier_id] = (supplierDue[p.supplier_id] ?? 0) + amt;
  });
  (supplierPayments ?? []).forEach((p: any) => {
    supplierDue[p.supplier_id] = (supplierDue[p.supplier_id] ?? 0) - p.amount;
  });

  const totalReceivable = Object.values(customerDue).reduce((s, v) => s + (v > 0 ? v : 0), 0);
  const totalPayable = Object.values(supplierDue).reduce((s, v) => s + (v > 0 ? v : 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Outstanding Report</h1>
        <Link href="/dashboard/reports" className="text-sm text-gray-500 hover:underline">← Reports-এ ফিরুন</Link>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Receivable (কাস্টমার বাকি)</p>
          <p className="text-lg font-semibold text-blue-700">{money(totalReceivable)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Payable (সাপ্লায়ার পাওনা)</p>
          <p className="text-lg font-semibold text-amber-700">{money(totalPayable)}</p>
        </div>
      </div>

      <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">Customer Due</h2>
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr><th className="px-4 py-2">Customer</th><th className="px-4 py-2 text-right">Due Amount</th></tr>
          </thead>
          <tbody>
            {(customers ?? []).filter((c) => (customerDue[c.id] ?? 0) > 0).map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-2">
                  <Link href={`/dashboard/sales/customer-ledger/${c.id}`} className="hover:underline hover:text-blue-700">{c.name}</Link>
                </td>
                <td className="px-4 py-2 text-right">{money((customerDue[c.id] ?? 0))}</td>
              </tr>
            ))}
            {(customers ?? []).filter((c) => (customerDue[c.id] ?? 0) > 0).length === 0 && (
              <tr><td colSpan={2} className="px-4 py-3 text-gray-400 italic">কোনো বাকি নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">Supplier Payable</h2>
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr><th className="px-4 py-2">Supplier</th><th className="px-4 py-2 text-right">Payable Amount</th></tr>
          </thead>
          <tbody>
            {(suppliers ?? []).filter((s) => (supplierDue[s.id] ?? 0) > 0).map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-4 py-2">
                  <Link href={`/dashboard/purchase/supplier-ledger/${s.id}`} className="hover:underline hover:text-blue-700">{s.name}</Link>
                </td>
                <td className="px-4 py-2 text-right">{money((supplierDue[s.id] ?? 0))}</td>
              </tr>
            ))}
            {(suppliers ?? []).filter((s) => (supplierDue[s.id] ?? 0) > 0).length === 0 && (
              <tr><td colSpan={2} className="px-4 py-3 text-gray-400 italic">কোনো পাওনা নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}