"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/formatDate";
import ListFilterBar from "@/components/ListFilterBar";

export default function ChallanReceivedTable({ received: allReceived }: { received: any[] }) {
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const customerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    allReceived.forEach((c: any) => { if (c.customer_id && c.customers?.name) seen.set(c.customer_id, c.customers.name); });
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [allReceived]);

  const received = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allReceived.filter((c: any) => {
      if (customerId && c.customer_id !== customerId) return false;
      if (dateFrom && c.challan_date < dateFrom) return false;
      if (dateTo && c.challan_date > dateTo) return false;
      if (q) {
        const hay = `${c.challan_no ?? ""} ${c.customers?.name ?? ""} ${c.received_note ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allReceived, search, customerId, dateFrom, dateTo]);

  function clearFilters() {
    setSearch(""); setCustomerId(""); setDateFrom(""); setDateTo("");
  }

  return (
    <div>
      <ListFilterBar
        search={search} onSearchChange={setSearch} searchPlaceholder="Challan No / Customer / Note..."
        customers={customerOptions} customerId={customerId} onCustomerChange={setCustomerId}
        dateFrom={dateFrom} onDateFromChange={setDateFrom} dateTo={dateTo} onDateToChange={setDateTo}
        onClear={clearFilters}
      />
      <p className="mb-2 text-xs text-gray-400">{received.length} / {allReceived.length} টা Received চালান দেখানো হচ্ছে</p>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Challan No</th>
              <th className="px-4 py-2">Challan Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2">Received Date</th>
              <th className="px-4 py-2">Note</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {received.map((c: any) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-2 font-medium">{c.challan_no}</td>
                <td className="px-4 py-2 text-gray-500">{formatDate(c.challan_date)}</td>
                <td className="px-4 py-2">{c.customers?.name ?? "-"}</td>
                <td className="px-4 py-2 text-right">{c.totalQty}</td>
                <td className="px-4 py-2 text-gray-500">{c.received_date ? formatDate(c.received_date) : "-"}</td>
                <td className="px-4 py-2 text-gray-500">{c.received_note || "-"}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <Link
                    href={`/dashboard/sales/delivery-challan/${c.id}/print`}
                    target="_blank"
                    className="text-blue-700 hover:underline text-xs mr-3"
                  >
                    View
                  </Link>
                  {c.received_file_url ? (
                    <a href={c.received_file_url} target="_blank" rel="noreferrer" className="text-gray-700 hover:underline text-xs">
                      রিসিট কপি
                    </a>
                  ) : (
                    <span className="text-gray-300 text-xs">রিসিট নেই</span>
                  )}
                </td>
              </tr>
            ))}
            {received.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-4 text-center text-gray-400 italic">
                {allReceived.length === 0 ? "এখনো কোনো চালান Received হয়নি" : "এই ফিল্টারে কোনো চালান নেই"}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
