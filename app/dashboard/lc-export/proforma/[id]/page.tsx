import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { notFound } from "next/navigation";
import { currencySymbol } from "@/lib/numberToWords";
import NewRevisionButton from "./NewRevisionButton";
import ProformaViewActions from "./ProformaViewActions";
import { money } from "@/lib/format";

export default async function ProformaViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: pi } = await supabase
    .from("proforma_invoices")
    .select("*, customers(name, address, phone)")
    .eq("id", id).single();

  if (!pi) return notFound();

  const { data: items } = await supabase
    .from("pi_items").select("*, bookings(booking_no)").eq("pi_id", id).order("sl_no");

  const sym = currencySymbol(pi.currency);

  return (
    <div>
      <Link href="/dashboard/lc-export/proforma" className="text-sm text-gray-500 hover:underline">← সব PI-এর তালিকায় ফিরুন</Link>
      <div className="flex items-center justify-between mt-2 mb-4">
        <h1 className="text-2xl font-semibold">{pi.pi_no} {pi.revision > 0 && `(Rev-${pi.revision})`}</h1>
        <div className="flex gap-2">
          <ProformaViewActions piId={id} piNo={pi.pi_no} />
          <NewRevisionButton piId={id} />
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm mb-4 text-sm space-y-1">
        <p><span className="text-gray-500">Customer:</span> {pi.customers?.name ?? "Manual"}</p>
        <p><span className="text-gray-500">Date:</span> {formatDate(pi.pi_date)}</p>
        <p><span className="text-gray-500">Currency:</span> {pi.currency}</p>
        <p><span className="text-gray-500">Status:</span> {pi.status}</p>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Sl</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2">Measurement</th>
              <th className="px-4 py-2 text-right">Qty (Pcs)</th>
              <th className="px-4 py-2 text-right">Qty (Dzn)</th>
              <th className="px-4 py-2 text-right">Price/{"{basis}"}</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((it: any) => {
              const amount = it.price_basis === "dzn" ? (it.qty_pcs / 12) * it.price_unit : it.qty_pcs * it.price_unit;
              return (
                <tr key={it.id} className="border-t">
                  <td className="px-4 py-2">{it.sl_no}</td>
                  <td className="px-4 py-2 whitespace-pre-line">{it.description}{it.bookings && <span className="text-xs text-gray-400"> ({it.bookings.booking_no})</span>}</td>
                  <td className="px-4 py-2">{it.measurement}</td>
                  <td className="px-4 py-2 text-right">{it.qty_pcs}</td>
                  <td className="px-4 py-2 text-right">{money((it.qty_pcs / 12))}</td>
                  <td className="px-4 py-2 text-right">{sym}{Number(it.price_unit).toFixed(pi.price_decimals ?? 4)}/{it.price_basis}</td>
                  <td className="px-4 py-2 text-right">{sym}{money(amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm max-w-sm ml-auto text-sm">
        <p>Total: <strong>{pi.currency} {money(pi.total_amount)}</strong></p>
      </div>
    </div>
  );
}