"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";

export default function EXPRow({ exp }: { exp: any }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function markRealized() {
    setLoading(true);
    await supabase.from("exp_tracking").update({ status: "realized", realization_date: new Date().toISOString().slice(0, 10) }).eq("id", exp.id);
    setLoading(false);
    router.refresh();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2 font-medium">{exp.exp_no}</td>
      <td className="px-4 py-2">{exp.export_invoices?.invoice_no ?? "-"}</td>
      <td className="px-4 py-2 text-gray-500">{formatDate(exp.submission_date)}</td>
      <td className="px-4 py-2 text-gray-500">{exp.realization_date ? formatDate(exp.realization_date) : "-"}</td>
      <td className="px-4 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs ${exp.status === "realized" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
          {exp.status}
        </span>
      </td>
      <td className="px-4 py-2 text-right">
        {exp.status !== "realized" && (
          <button onClick={markRealized} disabled={loading} className="rounded bg-green-50 px-2 py-1 text-xs text-green-700 hover:bg-green-100">Mark Realized</button>
        )}
      </td>
    </tr>
  );
}