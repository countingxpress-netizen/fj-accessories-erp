"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";
import GuardedAction from "@/app/dashboard/GuardedAction";
import { money } from "@/lib/format";

export default function LCRow({ lc }: { lc: any }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleStatusChange(status: string) {
    setLoading(true);
    await supabase.from("lc_register").update({ status }).eq("id", lc.id);
    setLoading(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm(`LC "${lc.lc_no}" মুছে ফেলতে চান?`)) return;
    const { error } = await supabase.from("lc_register").delete().eq("id", lc.id);
    if (error) { alert("মুছে ফেলা যায়নি: " + error.message); return; }
    router.refresh();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs ${lc.lc_type === "export" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
          {lc.lc_type === "export" ? "Export" : "Import"}
        </span>
      </td>
      <td className="px-4 py-2 font-medium">{lc.lc_no}</td>
      <td className="px-4 py-2 text-gray-500">{lc.banks?.bank_name ?? "-"}</td>
      <td className="px-4 py-2">{lc.customers?.name ?? lc.suppliers?.name ?? "-"}</td>
      <td className="px-4 py-2 text-gray-500">
        {formatDate(lc.lc_date)}
        {lc.creator?.full_name && <div className="text-[11px] text-gray-400">by {lc.creator.full_name}</div>}
      </td>
      <td className="px-4 py-2 text-gray-500">{lc.expiry_date ? formatDate(lc.expiry_date) : "-"}</td>
      <td className="px-4 py-2 text-right">{money(lc.amount)} {lc.currency}</td>
      <td className="px-4 py-2">
        <select value={lc.status} onChange={(e) => handleStatusChange(e.target.value)} disabled={loading} className="rounded border px-2 py-1 text-xs">
          <option value="active">Active</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </td>
      <td className="px-4 py-2 text-right">
        <GuardedAction table="lc_register" recordId={lc.id} recordLabel={lc.lc_no} action="delete"
          onAllowed={handleDelete}
          className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Delete</GuardedAction>
      </td>
    </tr>
  );
}