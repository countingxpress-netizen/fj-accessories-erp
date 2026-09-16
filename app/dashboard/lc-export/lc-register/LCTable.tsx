"use client";
import { useMemo, useState } from "react";
import LCRow from "./LCRow";

export default function LCTable({ lcs }: { lcs: any[] }) {
  const [search, setSearch] = useState("");
  const [lcType, setLcType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lcs.filter((lc) => {
      if (lcType && lc.lc_type !== lcType) return false;
      if (dateFrom && lc.lc_date < dateFrom) return false;
      if (dateTo && lc.lc_date > dateTo) return false;
      if (q) {
        const party = lc.customers?.name ?? lc.suppliers?.name ?? "";
        const hay = `${lc.lc_no ?? ""} ${party} ${lc.banks?.bank_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [lcs, search, lcType, dateFrom, dateTo]);

  function clearFilters() {
    setSearch(""); setLcType(""); setDateFrom(""); setDateTo("");
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border bg-gray-50 p-3">
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">সার্চ</label>
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="LC No / Party / Bank..."
            className="w-48 rounded-lg border px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">LC Type</label>
          <select value={lcType} onChange={(e) => setLcType(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm min-w-[120px]">
            <option value="">সব</option>
            <option value="export">Export</option>
            <option value="import">Import</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">তারিখ (থেকে)</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">তারিখ (পর্যন্ত)</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm" />
        </div>
        <button type="button" onClick={clearFilters} className="rounded-lg border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Clear</button>
      </div>
      <p className="mb-2 text-xs text-gray-400">{filtered.length} / {lcs.length} টা LC দেখানো হচ্ছে</p>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">LC No</th>
              <th className="px-4 py-2">Bank</th>
              <th className="px-4 py-2">Party</th>
              <th className="px-4 py-2">Linked PI</th>
              <th className="px-4 py-2">LC Date</th>
              <th className="px-4 py-2">Expiry</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((lc) => <LCRow key={lc.id} lc={lc} />)}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-3 text-gray-400 italic">এই ফিল্টারে কোনো LC নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
