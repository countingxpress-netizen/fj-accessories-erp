"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";
import { currencySymbol } from "@/lib/numberToWords";
import GuardedAction from "@/app/dashboard/GuardedAction";
import { usePermission } from "@/app/dashboard/PermissionProvider";
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

export default function ProformaRow({ pi, autoSalesInvoiceValue, garments }: { pi: any; autoSalesInvoiceValue: number; garments: string }) {
  const router = useRouter();
  const supabase = createClient();
  // Sales Invoice Value / Commission / Notes — শুধু Admin এডিট করতে পারবে, Staff শুধু দেখবে
  // (Edit/Delete-এর মতো request-approve সিস্টেম না, একদম strict admin-only)
  const { isAdmin } = usePermission("proforma_invoices", pi.id, "edit");

  // real_amount (হাতে বসানো — Manual PI-তে এটাই একমাত্র উৎস) থাকলে সেটা প্রাধান্য পায়,
  // নাহলে booking-লিংকড sales_invoice_items থেকে অটো-হিসাব করা মান দেখায়।
  const [realAmount, setRealAmount] = useState(pi.real_amount != null ? String(pi.real_amount) : "");
  const [commissionAmount, setCommissionAmount] = useState(pi.commission_amount != null ? String(pi.commission_amount) : "");
  const [notes, setNotes] = useState(pi.amount_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Submit to Customer = Sales Invoice Value + Commission (PI Value/USD-এর সাথে এর
  // কোনো সম্পর্ক নেই — এটা পুরোপুরি Sales Invoice-এর নিজের মুদ্রায় (সাধারণত BDT))
  const realAmountLive = realAmount === "" ? (autoSalesInvoiceValue > 0 ? autoSalesInvoiceValue : 0) : (parseFloat(realAmount) || 0);
  const commissionLive = parseFloat(commissionAmount) || 0;
  const submitToCustomer = realAmountLive + commissionLive;

  const dirty =
    (parseFloat(realAmount) || 0) !== (pi.real_amount ?? 0) ||
    (parseFloat(commissionAmount) || 0) !== (pi.commission_amount ?? 0) ||
    notes !== (pi.amount_notes ?? "");

  async function saveAmounts() {
    setSaving(true);
    setError("");
    const { error } = await supabase
      .from("proforma_invoices")
      .update({
        real_amount: realAmount === "" ? null : parseFloat(realAmount) || 0,
        commission_amount: commissionAmount === "" ? null : parseFloat(commissionAmount) || 0,
        amount_notes: notes || null,
      })
      .eq("id", pi.id);
    setSaving(false);
    if (error) { setError(error.message); return; }
    router.refresh();
  }

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
      <td className="px-4 py-2 text-right">
        {!isAdmin ? (
          <span className="text-gray-500">{realAmountLive > 0 ? money(realAmountLive) : "-"}</span>
        ) : pi.real_amount == null && autoSalesInvoiceValue > 0 ? (
          <span className="text-gray-500">{money(autoSalesInvoiceValue)}</span>
        ) : (
          <input
            type="number" step="0.01" value={realAmount}
            onChange={(e) => setRealAmount(e.target.value)}
            placeholder="হাতে দিন"
            className="w-24 rounded border px-2 py-1 text-sm text-right"
          />
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {!isAdmin ? (
          <span className="text-gray-500">{commissionLive > 0 ? money(commissionLive) : "-"}</span>
        ) : (
          <input
            type="number" step="0.01" value={commissionAmount}
            onChange={(e) => setCommissionAmount(e.target.value)}
            placeholder="-"
            className="w-24 rounded border px-2 py-1 text-sm text-right"
          />
        )}
      </td>
      <td className="px-4 py-2 text-right text-gray-700">
        {realAmountLive > 0 || commissionLive > 0 ? money(submitToCustomer) : "-"}
      </td>
      <td className="px-4 py-2">
        {!isAdmin ? (
          <span className="text-gray-500 text-xs">{notes || "-"}</span>
        ) : (
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="নোট (ঐচ্ছিক)"
            className="w-28 rounded border px-2 py-1 text-sm"
          />
        )}
        {error && <p className="text-[11px] text-red-600 mt-0.5">{error}</p>}
      </td>
      <td className="px-4 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs ${statusColors[pi.status]}`}>{statusLabels[pi.status]}</span>
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        {isAdmin && dirty && (
          <button
            onClick={saveAmounts}
            disabled={saving}
            className="rounded bg-green-600 px-2 py-1 text-xs text-white disabled:opacity-30 mr-2"
          >
            {saving ? "..." : "সেভ"}
          </button>
        )}
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
