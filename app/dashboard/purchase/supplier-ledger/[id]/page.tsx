import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { notFound } from "next/navigation";

export default async function SupplierLedgerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: supplier } = await supabase.from("suppliers").select("*").eq("id", id).single();
  if (!supplier) return notFound();

  const { data: entries } = await supabase
    .from("purchase_entries")
    .select("id, entry_no, entry_date, invoice_no, purchase_entry_items(quantity_lbs, rate_per_lbs, raw_materials(material_name))")
    .eq("supplier_id", id);

  const { data: payments } = await supabase
    .from("supplier_payments")
    .select("*")
    .eq("supplier_id", id);

  type Row = { date: string; type: "purchase" | "payment"; ref: string; desc: string; debit: number; credit: number };
  const rows: Row[] = [];

  (entries ?? []).forEach((e: any) => {
    const amount = (e.purchase_entry_items ?? []).reduce((s: number, i: any) => s + i.quantity_lbs * i.rate_per_lbs, 0);
    const desc = (e.purchase_entry_items ?? []).map((i: any) => `${i.raw_materials?.material_name} (${i.quantity_lbs} Lbs)`).join(", ");
    rows.push({ date: e.entry_date, type: "purchase", ref: e.entry_no ?? "-", desc, debit: 0, credit: amount });
  });

  (payments ?? []).forEach((p: any) => {
    rows.push({ date: p.payment_date, type: "payment", ref: "Payment", desc: p.note || "Payment Given", debit: p.amount, credit: 0 });
  });

  rows.sort((a, b) => a.date.localeCompare(b.date));

  let runningBalance = 0;
  const finalRows = rows.map((r) => {
    runningBalance += r.credit - r.debit;
    return { ...r, balance: runningBalance };
  });

  const totalPurchase = rows.reduce((s, r) => s + r.credit, 0);
  const totalPayments = rows.reduce((s, r) => s + r.debit, 0);

  return (
    <div>
      <Link href="/dashboard/purchase/supplier-ledger" className="text-sm text-gray-500 hover:underline">← সব Supplier-এর তালিকায় ফিরুন</Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">{supplier.name}</h1>
      <p className="text-sm text-gray-500 mb-4">{supplier.address} {supplier.phone && `· ${supplier.phone}`}</p>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Reference</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2 text-right">Payment (Dr)</th>
              <th className="px-4 py-2 text-right">Purchase (Cr)</th>
              <th className="px-4 py-2 text-right">Due Balance</th>
            </tr>
          </thead>
          <tbody>
            {finalRows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="px-4 py-2 text-gray-500">{formatDate(r.date)}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${r.type === "purchase" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                    {r.type === "purchase" ? "Purchase" : "Payment"}
                  </span>
                </td>
                <td className="px-4 py-2">{r.ref}</td>
                <td className="px-4 py-2 text-gray-600">{r.desc}</td>
                <td className="px-4 py-2 text-right">{r.debit ? r.debit.toFixed(2) : ""}</td>
                <td className="px-4 py-2 text-right">{r.credit ? r.credit.toFixed(2) : ""}</td>
                <td className="px-4 py-2 text-right font-medium">{r.balance.toFixed(2)}</td>
              </tr>
            ))}
            {finalRows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Purchase/Payment নেই</td></tr>
            )}
          </tbody>
          <tfoot className="border-t-2 font-semibold bg-gray-50">
            <tr>
              <td colSpan={4} className="px-4 py-3 text-right">Total</td>
              <td className="px-4 py-3 text-right">{totalPayments.toFixed(2)}</td>
              <td className="px-4 py-3 text-right">{totalPurchase.toFixed(2)}</td>
              <td className="px-4 py-3 text-right">{runningBalance.toFixed(2)} (পাওনা)</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}