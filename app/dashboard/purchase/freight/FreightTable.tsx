"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";
import { money } from "@/lib/format";
import { removeFreightCharge } from "@/lib/purchaseFreight";

export default function FreightTable({ charges }: { charges: any[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleDelete(c: any) {
    if (!window.confirm("এই Freight charge মুছে ফেলতে চান? এর Journal Voucher মুছে যাবে ও কাঁচামালের গড় খরচ আবার হিসাব হবে।")) return;
    setBusyId(c.id);
    await removeFreightCharge(supabase, c.id);
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-600">
          <tr>
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Purchase Entry</th>
            <th className="px-4 py-2">Supplier</th>
            <th className="px-4 py-2">Description</th>
            <th className="px-4 py-2">Paid Via</th>
            <th className="px-4 py-2">JV</th>
            <th className="px-4 py-2">Source</th>
            <th className="px-4 py-2 text-right">Amount</th>
            <th className="px-4 py-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {charges.map((c: any) => (
            <tr key={c.id} className="border-t">
              <td className="px-4 py-2 text-gray-500">{formatDate(c.charge_date)}</td>
              <td className="px-4 py-2">{c.purchase_entries?.entry_no ?? "-"}</td>
              <td className="px-4 py-2 text-gray-600">{c.purchase_entries?.suppliers?.name ?? "-"}</td>
              <td className="px-4 py-2 text-gray-600">{c.description || "-"}</td>
              <td className="px-4 py-2 text-gray-600">{c.paid_via?.account_name ?? "-"}</td>
              <td className="px-4 py-2 text-gray-500">{c.journal_vouchers?.voucher_no ?? "-"}</td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${c.source === "with_purchase" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                  {c.source === "with_purchase" ? "ক্রয়ের সাথে" : "আলাদা"}
                </span>
              </td>
              <td className="px-4 py-2 text-right font-medium">{money(c.amount)}</td>
              <td className="px-4 py-2 text-right">
                <button
                  onClick={() => handleDelete(c)}
                  disabled={busyId === c.id}
                  className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-40"
                >
                  {busyId === c.id ? "..." : "Delete"}
                </button>
              </td>
            </tr>
          ))}
          {charges.length === 0 && (
            <tr><td colSpan={9} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Freight charge নেই</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
