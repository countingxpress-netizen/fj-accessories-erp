"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";

export default function ProformaRow({ pi }: { pi: any }) {
  const router = useRouter();
  const supabase = createClient();

  const bookingNos = (pi.pi_bookings ?? []).map((pb: any) => pb.bookings?.booking_no).filter(Boolean).join(", ");

  async function handleDelete() {
    if (!window.confirm(`PI "${pi.pi_no}" মুছে ফেলতে চান?`)) return;
    await supabase.from("pi_bookings").delete().eq("pi_id", pi.id);
    const { error } = await supabase.from("proforma_invoices").delete().eq("id", pi.id);
    if (error) { alert("মুছে ফেলা যায়নি: " + error.message); return; }
    router.refresh();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2 font-medium">{pi.pi_no}</td>
      <td className="px-4 py-2 text-gray-500">{formatDate(pi.pi_date)}</td>
      <td className="px-4 py-2">{pi.customers?.name ?? "-"}</td>
      <td className="px-4 py-2 text-xs text-gray-500">{bookingNos}</td>
      <td className="px-4 py-2 text-right">{pi.total_amount?.toFixed(2)}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <Link href={`/dashboard/lc-export/proforma/${pi.id}/print`} target="_blank" className="text-blue-700 hover:underline text-xs mr-2">Print</Link>
        <button onClick={handleDelete} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Delete</button>
      </td>
    </tr>
  );
}