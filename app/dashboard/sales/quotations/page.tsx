import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";

export default async function QuotationListPage() {
  const supabase = await createClient();
  const { data: quotations } = await supabase
    .from("quotations")
    .select("*, customers(name), quotation_items(quantity_pcs, unit_price)")
    .order("quotation_date", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Quotations</h1>
        <Link href="/dashboard/sales/quotations/new" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
          + নতুন Quotation
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Quotation No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2 text-right">Total Amount</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(quotations ?? []).map((q: any) => {
              const total = (q.quotation_items ?? []).reduce((s: number, i: any) => s + i.quantity_pcs * i.unit_price, 0);
              return (
                <tr key={q.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{q.quotation_no}</td>
                  <td className="px-4 py-2 text-gray-500">{formatDate(q.quotation_date)}</td>
                  <td className="px-4 py-2">{q.customers?.name ?? "-"}</td>
                  <td className="px-4 py-2 text-right">{total.toFixed(2)}</td>
                  <td className="px-4 py-2 capitalize">{q.status}</td>
                </tr>
              );
            })}
            {(!quotations || quotations.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Quotation নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
