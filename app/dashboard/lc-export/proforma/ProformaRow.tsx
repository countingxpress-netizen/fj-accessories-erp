"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";
import { calcPiUnitPrice } from "@/lib/calcTubeCutting";

const statusLabels: Record<string, string> = {
  draft: "Draft", sent: "Sent", in_garments: "In Garments", lc_opened: "LC Opened", paid: "Paid",
};
const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  in_garments: "bg-purple-100 text-purple-700",
  lc_opened: "bg-orange-100 text-orange-700",
  paid: "bg-green-100 text-green-700",
};

export default function ProformaRow({ pi, customerPricePerLbs }: { pi: any; customerPricePerLbs: number | null }) {
  const router = useRouter();
  const supabase = createClient();

  const bookingValue = (pi.pi_items ?? []).reduce((s: number, item: any) => {
    if (!item.bookings || !customerPricePerLbs) return s;
    const unitPrice = calcPiUnitPrice(item.bookings, customerPricePerLbs);
    return s + unitPrice * item.qty_pcs;
  }, 0);

  const diff = pi.total_amount - bookingValue;

  async function handleStatusChange(status: string) {
    await supabase.from("proforma_invoices").update({ status }).eq("id", pi.id);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm(`PI "${pi.pi_no}" মুছে ফেলতে চান?`)) return;
    await supabase.from("pi_items").delete().eq("pi_id", pi.id);
    const { error } = await supabase.from("proforma_invoices").delete().eq("id", pi.id);
    if (error) { alert("মুছে ফেলা যায়নি: " + error.message); return; }
    router.refresh();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2 font-medium">
        {pi.pi_no} {pi.revision > 0 && <span className="text-xs text-blue-600">(Rev-{pi.revision})</span>}
      </td>
      <td className="px-4 py-2 text-gray-500">{formatDate(pi.pi_date)}</td>
      <td className="px-4 py-2">{pi.customers?.name ?? (pi.is_manual ? "Manual" : "-")}</td>
      <td className="px-4 py-2 text-right text-gray-500">{bookingValue > 0 ? bookingValue.toFixed(2) : "-"}</td>
      <td className="px-4 py-2 text-right font-medium">{pi.currency} {pi.total_amount?.toFixed(2)}</td>
      <td className={`px-4 py-2 text-right text-xs ${diff !== 0 ? (diff > 0 ? "text-green-600" : "text-red-600") : "text-gray-400"}`}>
        {bookingValue > 0 ? diff.toFixed(2) : "-"}
      </td>
      <td className="px-4 py-2">
        <select value={pi.status} onChange={(e) => handleStatusChange(e.target.value)} className={`rounded-full border-0 px-2 py-1 text-xs ${statusColors[pi.status]}`}>
          {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <Link href={`/dashboard/lc-export/proforma/${pi.id}`} className="text-blue-700 hover:underline text-xs mr-2">View</Link>
        <Link href={`/dashboard/lc-export/proforma/${pi.id}/print`} target="_blank" className="text-blue-700 hover:underline text-xs mr-2">Print</Link>
        <button onClick={handleDelete} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Delete</button>
      </td>
    </tr>
  );
}