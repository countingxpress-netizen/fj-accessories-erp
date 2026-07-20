import { createClient } from "@/lib/supabase/server";
import PackingListForm from "./PackingListForm";

export default async function PackingListPage() {
  const supabase = await createClient();
  const { data: invoices } = await supabase.from("export_invoices").select("id, invoice_no").order("invoice_date", { ascending: false });
  const { data: lists } = await supabase
    .from("packing_lists")
    .select("*, export_invoices(invoice_no)")
    .order("id", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Packing List</h1>
      <PackingListForm invoices={invoices ?? []} />
      <div className="mt-6 overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Export Invoice</th>
              <th className="px-4 py-2 text-right">Cartons</th>
              <th className="px-4 py-2 text-right">Net Weight (Kg)</th>
              <th className="px-4 py-2 text-right">Gross Weight (Kg)</th>
            </tr>
          </thead>
          <tbody>
            {(lists ?? []).map((l: any) => (
              <tr key={l.id} className="border-t">
                <td className="px-4 py-2 font-medium">{l.export_invoices?.invoice_no ?? "-"}</td>
                <td className="px-4 py-2 text-right">{l.total_cartons}</td>
                <td className="px-4 py-2 text-right">{l.total_net_weight}</td>
                <td className="px-4 py-2 text-right">{l.total_gross_weight}</td>
              </tr>
            ))}
            {(!lists || lists.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Packing List নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}