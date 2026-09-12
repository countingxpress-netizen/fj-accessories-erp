"use client";
import { useMemo, useState } from "react";
import ProformaRow from "./ProformaRow";
import ListFilterBar from "@/components/ListFilterBar";

type Row = { pi: any; autoSalesInvoiceValue: number; garments: string };

export default function ProformaTable({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [garments, setGarments] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const customerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    rows.forEach((r) => {
      if (r.pi.customer_id && r.pi.customers?.name) seen.set(r.pi.customer_id, r.pi.customers.name);
    });
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const buyerOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.pi.buyer_name) set.add(r.pi.buyer_name); });
    return Array.from(set).sort().map((v) => ({ value: v, label: v }));
  }, [rows]);

  const garmentsOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.garments && r.garments !== "-") set.add(r.garments); });
    return Array.from(set).sort().map((v) => ({ value: v, label: v }));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(({ pi, garments: g }) => {
      if (customerId && pi.customer_id !== customerId) return false;
      if (buyerName && pi.buyer_name !== buyerName) return false;
      if (garments && g !== garments) return false;
      if (dateFrom && pi.pi_date < dateFrom) return false;
      if (dateTo && pi.pi_date > dateTo) return false;
      if (q) {
        const hay = `${pi.pi_no ?? ""} ${pi.buyer_name ?? ""} ${pi.customers?.name ?? ""} ${g}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, customerId, buyerName, garments, dateFrom, dateTo]);

  function clearFilters() {
    setSearch(""); setCustomerId(""); setBuyerName(""); setGarments(""); setDateFrom(""); setDateTo("");
  }

  return (
    <div>
      <ListFilterBar
        search={search} onSearchChange={setSearch} searchPlaceholder="PI No / Buyer / Customer..."
        customers={customerOptions} customerId={customerId} onCustomerChange={setCustomerId}
        buyers={buyerOptions} buyerId={buyerName} onBuyerChange={setBuyerName}
        garmentsOptions={garmentsOptions} garments={garments} onGarmentsChange={setGarments}
        dateFrom={dateFrom} onDateFromChange={setDateFrom} dateTo={dateTo} onDateToChange={setDateTo}
        onClear={clearFilters}
      />
      <p className="mb-2 text-xs text-gray-400">{filtered.length} / {rows.length} টা PI দেখানো হচ্ছে</p>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">PI No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Garments</th>
              <th className="px-4 py-2 text-right">PI Value</th>
              <th className="px-4 py-2 text-right">Sales Invoice Value</th>
              <th className="px-4 py-2 text-right">Commission</th>
              <th className="px-4 py-2 text-right">Submit to Customer</th>
              <th className="px-4 py-2">Notes</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ pi, autoSalesInvoiceValue, garments: g }) => (
              <ProformaRow key={pi.id} pi={pi} autoSalesInvoiceValue={autoSalesInvoiceValue} garments={g} />
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-3 text-gray-400 italic">এই ফিল্টারে কোনো PI নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
