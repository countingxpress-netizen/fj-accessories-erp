"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { StageRow } from "./page";

const typeLabels: Record<string, string> = {
  blowing: "Blowing", printing: "Printing", cutting: "Cutting",
};
const typeColors: Record<string, string> = {
  blowing: "bg-blue-100 text-blue-700",
  printing: "bg-indigo-100 text-indigo-700",
  cutting: "bg-purple-100 text-purple-700",
};

function stageText(stageType: string, completed: boolean) {
  if (stageType === "cutting") return completed ? "Finished to store" : "Cutting চলছে";
  const label = typeLabels[stageType];
  return completed ? `${label} শেষ` : `${label} চলছে`;
}

export default function ProductionStageRow({ row }: { row: StageRow }) {
  const [checked, setChecked] = useState(row.completed);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSave() {
    setLoading(true);
    const column = row.stageType === "blowing" ? "blowing_completed_at"
      : row.stageType === "printing" ? "printing_completed_at" : "cutting_completed_at";

    await supabase.from("production_orders").update({
      [column]: checked ? new Date().toISOString() : null,
    }).eq("id", row.productionOrderId);

    // Cutting সম্পন্ন হলে production_orders.stage-ও "finished" করুন
    if (row.stageType === "cutting" && checked) {
      await supabase.from("production_orders").update({ stage: "finished" }).eq("id", row.productionOrderId);
    }

    setLoading(false);
    router.refresh();
  }

  const stageLabel = stageText(row.stageType, checked);
  const stageColor = checked
    ? (row.stageType === "cutting" ? "text-green-700 font-medium" : "text-green-700")
    : "text-orange-600";

  return (
    <tr className="border-t">
      <td className="px-4 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs ${typeColors[row.stageType]}`}>{typeLabels[row.stageType]}</span>
      </td>
      <td className="px-4 py-2 font-medium">{row.bookingNo}</td>
      <td className="px-4 py-2">{row.customerName}</td>
      <td className="px-4 py-2">{row.productName}</td>
      <td className="px-4 py-2 text-gray-500 text-xs">{row.measurement}</td>
      <td className="px-4 py-2 text-right">{row.quantity.toLocaleString()} {row.quantityUnit}</td>
      <td className="px-4 py-2 text-center">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} disabled={loading} />
      </td>
      <td className={`px-4 py-2 ${stageColor}`}>{stageLabel}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        {checked !== row.completed && (
          <button onClick={handleSave} disabled={loading} className="rounded bg-gray-900 px-3 py-1 text-xs text-white mr-2">
            {loading ? "সেভ হচ্ছে..." : "সেভ করুন"}
          </button>
        )}
        <Link href={`/dashboard/sales/bookings/${row.bookingId}`} className="text-xs text-blue-600 hover:underline">View</Link>
      </td>
    </tr>
  );
}