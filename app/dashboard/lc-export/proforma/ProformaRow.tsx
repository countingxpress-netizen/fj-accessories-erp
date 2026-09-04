"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";
import { currencySymbol } from "@/lib/numberToWords";
import GuardedAction from "@/app/dashboard/GuardedAction";
import { money } from "@/lib/format";

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

export default function ProformaRow({ pi, salesInvoiceValue, garments }: { pi: any; salesInvoiceValue: number; garments: string }) {
  const router = useRouter();
  const supabase = createClient();

  const piValueInBdt = pi.currency === "USD" ? pi.total_amount * (pi.exchange_rate_to_bdt ?? 122) : pi.total_amount;
  const difference = piValueInBdt - salesInvoiceValue;

  async function handleSent() {
    await supabase.from("proforma_invoices").update({ status: "in_garments" }).eq("id", pi.id);
    router.refresh();
  }
  async function handleMarkPaid() {
    await supabase.from("proforma_invoices").update({ status: "paid" }).eq("id", pi.id);
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
      <td className="px-4 py-2 text-gray-500">
        {formatDate(pi.pi_date)}
        {pi.creator?.full_name && <div className="text-[11px] text-gray-400">by {pi.creator.full_name}</div>}
      </td>
      <td className="px-4 py-2">{pi.customers?.name ?? (pi.is_manual ? "Manual" : "-")}</td>
      <td className="px-4 py-2 text-gray-500">{garments}</td>
      <td className="px-4 py-2 text-right font-medium">{currencySymbol(pi.currency)}{money(pi.total_amount)}</td>
      <td className="px-4 py-2 text-right text-gray-500">{salesInvoiceValue > 0 ? money(salesInvoiceValue) : "-"}</td>
      <td className={`px-4 py-2 text-right text-xs ${salesInvoiceValue > 0 ? (difference >= 0 ? "text-green-600" : "text-red-600") : "text-gray-400"}`}>
        {salesInvoiceValue > 0 ? money(difference) : "-"}
      </td>
      <td className="px-4 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs ${statusColors[pi.status]}`}>{statusLabels[pi.status]}</span>
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        {pi.status === "draft" && (
          <button onClick={handleSent} className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100 mr-2">Sent</button>
        )}
        {pi.status === "lc_opened" && (
          <button onClick={handleMarkPaid} className="rounded bg-green-50 px-2 py-1 text-xs text-green-700 hover:bg-green-100 mr-2">Mark Paid</button>
        )}
        <Link href={`/dashboard/lc-export/proforma/${pi.id}`} className="text-blue-700 hover:underline text-xs mr-2">View</Link>
        <Link href={`/dashboard/lc-export/proforma/${pi.id}/print`} target="_blank" className="text-blue-700 hover:underline text-xs mr-2">Print</Link>
        <GuardedAction table="proforma_invoices" recordId={pi.id} recordLabel={pi.pi_no} action="delete"
          onAllowed={handleDelete}
          className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Delete</GuardedAction>
      </td>
    </tr>
  );
}