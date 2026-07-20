import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import ExportInvoiceForm from "./ExportInvoiceForm";

export default async function ExportInvoicePage() {
  const supabase = await createClient();
  const { data: lcs } = await supabase.from("lc_register").select("id, lc_no").eq("lc_type", "export").order("lc_date", { ascending: false });
  const { data: customers } = await supabase.from("customers").select("id, name").order("name");
  const { data: invoices } = await supabase
    .from("export_invoices")
    .select("*, customers(name), lc_register(lc_no)")
    .order("invoice_date", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Export Invoice</h1>
      <ExportInvoiceForm lcs={lcs ?? []} customers={customers ?? []} />
      <div className="mt-6 overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Invoice No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">LC No</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(invoices ?? []).map((inv: any) => (
              <tr key={inv.id} className="border-t">
                <td className="px-4 py-2 font-medium">{inv.invoice_no}</td>
                <td className="px-4 py-2 text-gray-500">{formatDate(inv.invoice_date)}</td>
                <td className="px-4 py-2">{inv.customers?.name ?? "-"}</td>
                <td className="px-4 py-2 text-gray-500">{inv.lc_register?.lc_no ?? "-"}</td>
                <td className="px-4 py-2 text-right">{inv.amount?.toFixed(2)}</td>
              </tr>
            ))}
            {(!invoices || invoices.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Export Invoice নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}