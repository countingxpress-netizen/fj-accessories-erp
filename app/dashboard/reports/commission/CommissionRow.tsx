"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/format";

export default function CommissionRow({
  invoiceId, invoiceNo, invoiceDate, customer, invoiceTotal, calc, adjustment, note,
}: {
  invoiceId: string; invoiceNo: string; invoiceDate: string; customer: string;
  invoiceTotal: number; calc: number; adjustment: number; note: string;
}) {
  const [adj, setAdj] = useState(String(adjustment || 0));
  const [noteVal, setNoteVal] = useState(note);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const dirty = (parseFloat(adj) || 0) !== adjustment || noteVal !== note;
  const finalCommission = calc + (parseFloat(adj) || 0);

  async function save() {
    setSaving(true);
    setError("");
    const { error } = await supabase
      .from("sales_invoices")
      .update({ commission_adjustment: parseFloat(adj) || 0, commission_note: noteVal || null })
      .eq("id", invoiceId);
    setSaving(false);
    if (error) { setError(error.message); return; }
    router.refresh();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2 font-medium">{invoiceNo}</td>
      <td className="px-4 py-2 text-gray-500">{invoiceDate}</td>
      <td className="px-4 py-2">{customer}</td>
      <td className="px-4 py-2 text-right text-gray-600">{money(invoiceTotal)}</td>
      <td className="px-4 py-2 text-right">{money(calc)}</td>
      <td className="px-4 py-2 text-right">
        <input
          type="number" step="0.01" value={adj}
          onChange={(e) => setAdj(e.target.value)}
          className="w-24 rounded border px-2 py-1 text-sm text-right"
        />
      </td>
      <td className="px-4 py-2">
        <input
          value={noteVal}
          onChange={(e) => setNoteVal(e.target.value)}
          placeholder="কারণ (ঐচ্ছিক)"
          className="w-full min-w-[120px] rounded border px-2 py-1 text-sm"
        />
        {error && <p className="text-[11px] text-red-600 mt-0.5">{error}</p>}
      </td>
      <td className="px-4 py-2 text-right font-medium text-purple-700">{money(finalCommission)}</td>
      <td className="px-4 py-2 text-right">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="rounded bg-green-600 px-3 py-1 text-xs text-white disabled:opacity-30"
        >
          {saving ? "..." : "সেভ"}
        </button>
      </td>
    </tr>
  );
}
