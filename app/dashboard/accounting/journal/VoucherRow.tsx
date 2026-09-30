"use client";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteSimpleRow } from "@/lib/simpleDelete";
import GuardedAction from "@/app/dashboard/GuardedAction";
import { money } from "@/lib/format";
import { journalSourceLabel, isManualJournal } from "@/lib/journalSource";

export default function VoucherRow({
  voucher, selected, onToggleSelect,
}: { voucher: any; selected?: boolean; onToggleSelect?: () => void }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const lines: any[] = voucher.journal_entry_lines ?? [];
  const totalCredit = lines.reduce((s: number, l: any) => s + (l.credit || 0), 0);

  const total = (voucher.journal_entry_lines ?? []).reduce(
    (sum: number, l: any) => sum + (l.debit || 0),
    0
  );

  async function handleDelete() {
    const confirmed = window.confirm(
      `Voucher "${voucher.voucher_no}" মুছে ফেলতে চান? এটি পূর্বাবস্থায় ফেরানো যাবে না।`
    );
    if (!confirmed) return;

    const result = await deleteSimpleRow(supabase, "journal_vouchers", voucher.id);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    router.refresh();
  }

  // রো-তে ক্লিক → নিচে লাইনগুলো (Account / Debit / Credit / Memo) খোলে/বন্ধ হয়।
  // চেকবক্স ও Edit/Delete বাটনে ক্লিক রো-টগল করে না (stopPropagation)।
  return (
    <Fragment>
    <tr
      className={`border-t cursor-pointer hover:bg-gray-50 ${open ? "bg-blue-50/40" : ""}`}
      onClick={() => setOpen((o) => !o)}
      title="ডিটেলস দেখতে ক্লিক করুন"
    >
      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={!!selected}
          onChange={onToggleSelect}
          aria-label={`Select voucher ${voucher.voucher_no}`}
        />
      </td>
      <td className="px-4 py-2 font-medium whitespace-nowrap">
        <span className="inline-block w-4 text-gray-400">{open ? "▾" : "▸"}</span>
        {voucher.voucher_no}
      </td>
      <td className="px-4 py-2 text-gray-500">{voucher.voucher_date}</td>
      <td className="px-4 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs ${
          isManualJournal(voucher.source) ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
        }`}>
          {journalSourceLabel(voucher.source)}
        </span>
      </td>
      <td className="px-4 py-2">{voucher.narration || "-"}</td>
      <td className="px-4 py-2 text-right">{money(total)}</td>
      <td className="px-4 py-2 text-gray-500 text-xs">{voucher.creator?.full_name ?? "-"}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
        <GuardedAction
          table="journal_vouchers" recordId={voucher.id} recordLabel={voucher.voucher_no} action="edit"
          onAllowed={() => router.push(`/dashboard/accounting/journal/${voucher.id}/edit`)}
          className="rounded bg-blue-50 px-3 py-1 text-xs text-blue-700 mr-2 hover:bg-blue-100"
        >
          Edit
        </GuardedAction>
        <GuardedAction
          table="journal_vouchers" recordId={voucher.id} recordLabel={voucher.voucher_no} action="delete"
          onAllowed={handleDelete}
          className="rounded bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100"
        >
          Delete
        </GuardedAction>
      </td>
    </tr>
    {open && (
      <tr className="bg-gray-50/70">
        <td />
        <td colSpan={7} className="px-4 pb-3 pt-1">
          <table className="w-full text-xs border rounded bg-white">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="px-3 py-1.5 text-left">Account</th>
                <th className="px-3 py-1.5 text-right">Debit</th>
                <th className="px-3 py-1.5 text-right">Credit</th>
                <th className="px-3 py-1.5 text-left">Memo</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l: any, i: number) => (
                <tr key={l.id ?? i} className="border-t">
                  <td className={`px-3 py-1.5 ${(l.credit || 0) > 0 && !(l.debit || 0) ? "pl-8" : ""}`}>
                    {l.chart_of_accounts ? `${l.chart_of_accounts.account_code} - ${l.chart_of_accounts.account_name}` : "-"}
                  </td>
                  <td className="px-3 py-1.5 text-right">{l.debit ? money(l.debit) : ""}</td>
                  <td className="px-3 py-1.5 text-right">{l.credit ? money(l.credit) : ""}</td>
                  <td className="px-3 py-1.5 text-gray-500">{l.memo || ""}</td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-2 text-gray-400 italic">কোনো লাইন নেই</td></tr>
              )}
            </tbody>
            <tfoot className="border-t font-semibold">
              <tr>
                <td className="px-3 py-1.5 text-right">Total</td>
                <td className="px-3 py-1.5 text-right">{money(total)}</td>
                <td className="px-3 py-1.5 text-right">{money(totalCredit)}</td>
                <td className="px-3 py-1.5 text-gray-500 font-normal">
                  {voucher.narration ? `Narration: ${voucher.narration}` : ""}
                </td>
              </tr>
            </tfoot>
          </table>
        </td>
      </tr>
    )}
    </Fragment>
  );
}
