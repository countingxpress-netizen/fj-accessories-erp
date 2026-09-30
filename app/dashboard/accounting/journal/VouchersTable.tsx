"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import { BulkActionBar } from "@/components/BulkActionBar";
import { deleteSimpleRow } from "@/lib/simpleDelete";
import { useBulkDeletePermission } from "@/app/dashboard/PermissionProvider";
import VoucherRow from "./VoucherRow";
import { journalSourceLabel } from "@/lib/journalSource";

// সার্চের জন্য একটা voucher-এর সব খোঁজার-মতো টেক্সট এক স্ট্রিংয়ে (voucher no, তারিখ, narration,
// source, কে বানিয়েছে, মোট টাকা, প্রতিটা লাইনের account code/নাম ও memo)।
function searchText(v: any): string {
  const lines = v.journal_entry_lines ?? [];
  const total = lines.reduce((s: number, l: any) => s + (l.debit || 0), 0);
  return [
    v.voucher_no, v.voucher_date, v.narration, journalSourceLabel(v.source), v.source,
    v.creator?.full_name, String(total),
    ...lines.flatMap((l: any) => [l.chart_of_accounts?.account_code, l.chart_of_accounts?.account_name, l.memo]),
  ].filter(Boolean).join(" ").toLowerCase();
}

export default function VouchersTable({ vouchers: allVouchers }: { vouchers: any[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const indexed = useMemo(() => allVouchers.map((v) => ({ v, text: searchText(v) })), [allVouchers]);
  const vouchers = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return indexed
      .filter(({ v, text }) =>
        (!fromDate || (v.voucher_date ?? "") >= fromDate) &&
        (!toDate || (v.voucher_date ?? "") <= toDate) &&
        words.every((w) => text.includes(w))
      )
      .map(({ v }) => v);
  }, [indexed, search, fromDate, toDate]);
  const isFiltered = !!(search.trim() || fromDate || toDate);
  const supabase = createClient();
  const { partition, markFulfilled } = useBulkDeletePermission("journal_vouchers");

  const {
    selectedIds, selectedCount, isSelected, toggle, toggleAll, isAllSelected, isSomeSelected, clear,
  } = useBulkSelect(vouchers, (v: any) => v.id);

  async function handleBulkDelete() {
    const { allowed, blocked } = partition(selectedIds);
    const errors: string[] = [];
    for (const id of allowed) {
      const voucher = vouchers.find((v: any) => v.id === id);
      const result = await deleteSimpleRow(supabase, "journal_vouchers", id);
      if (!result.ok) errors.push(`${voucher?.voucher_no ?? id}: ${result.error}`);
    }
    if (blocked.length > 0) errors.push(`${blocked.length}টা Voucher-এ Delete অনুমতি নেই — নিজের Delete বাটন থেকে Request পাঠান।`);
    await markFulfilled(allowed);
    clear();
    router.refresh();
    if (errors.length > 0) {
      alert(`${errors.length}টি Voucher মুছা যায়নি:\n\n${errors.join("\n")}`);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[240px]">
          <label className="block text-xs text-gray-500 mb-1">সার্চ (Voucher No / Narration / Account / Amount / Source)</label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="যেমন: JV-2026-0012, Rent, 2600, 60000"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        {isFiltered && (
          <button
            type="button"
            onClick={() => { setSearch(""); setFromDate(""); setToDate(""); }}
            className="rounded-lg border px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            রিসেট
          </button>
        )}
        <span className="text-xs text-gray-500 pb-2">
          {isFiltered ? `${vouchers.length} / ${allVouchers.length}` : allVouchers.length}টি Voucher · রো-তে ক্লিক করলে ডিটেলস
        </span>
      </div>
      <BulkActionBar count={selectedCount} itemLabel="Voucher" onDeleteSelected={handleBulkDelete} onClear={clear} />
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2 w-10">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => { if (el) el.indeterminate = isSomeSelected; }}
                  onChange={toggleAll}
                  aria-label="Select all vouchers"
                />
              </th>
              <th className="px-4 py-2">Voucher No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Source</th>
              <th className="px-4 py-2">Narration</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2">Created By</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((v: any) => (
              <VoucherRow key={v.id} voucher={v} selected={isSelected(v.id)} onToggleSelect={() => toggle(v.id)} />
            ))}
            {vouchers.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-3 text-gray-400 italic">
                  {isFiltered ? "এই সার্চে কোনো Voucher পাওয়া যায়নি" : "এখনো কোনো Journal Voucher তৈরি হয়নি"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
