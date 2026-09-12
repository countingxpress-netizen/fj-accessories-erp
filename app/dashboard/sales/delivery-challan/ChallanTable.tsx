"use client";
import { useMemo, useState } from "react";
import ListFilterBar from "@/components/ListFilterBar";
import ChallanRow from "./ChallanRow";

export default function ChallanTable({
  challans: allChallans, piNoByChallan = {}, latestChallanNo = "", bkById = {},
}: {
  challans: any[]; piNoByChallan?: Record<string, string>; latestChallanNo?: string;
  bkById?: Record<string, any>;
}) {
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const customerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    allChallans.forEach((c: any) => { if (c.customer_id && c.customers?.name) seen.set(c.customer_id, c.customers.name); });
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [allChallans]);

  const challans = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allChallans.filter((c: any) => {
      if (customerId && c.customer_id !== customerId) return false;
      if (dateFrom && c.challan_date < dateFrom) return false;
      if (dateTo && c.challan_date > dateTo) return false;
      if (q) {
        const hay = `${c.challan_no ?? ""} ${c.customers?.name ?? ""} ${piNoByChallan[c.id] ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allChallans, search, customerId, dateFrom, dateTo, piNoByChallan]);

  function clearFilters() {
    setSearch(""); setCustomerId(""); setDateFrom(""); setDateTo("");
  }

  return (
    <div>
      <ListFilterBar
        search={search} onSearchChange={setSearch} searchPlaceholder="Challan No / Customer / PI No..."
        customers={customerOptions} customerId={customerId} onCustomerChange={setCustomerId}
        dateFrom={dateFrom} onDateFromChange={setDateFrom} dateTo={dateTo} onDateToChange={setDateTo}
        onClear={clearFilters}
      />
      <p className="mb-2 text-xs text-gray-400">{challans.length} / {allChallans.length} টা Challan দেখানো হচ্ছে</p>
      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2 w-8"></th>
              <th className="px-4 py-2">Challan No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Booking</th>
              <th className="px-4 py-2">PI No</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Delivery Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {challans.map((c: any) => (
              <ChallanRow
                key={c.id}
                challan={c}
                piNo={piNoByChallan[c.id] ?? ""}
                isLatest={!!latestChallanNo && c.challan_no === latestChallanNo}
                bkById={bkById}
              />
            ))}
            {challans.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-4 text-center text-gray-400 italic">
                  {allChallans.length === 0 ? "এখনো কোনো Delivery Challan নেই" : "এই ফিল্টারে কোনো Delivery Challan নেই"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
