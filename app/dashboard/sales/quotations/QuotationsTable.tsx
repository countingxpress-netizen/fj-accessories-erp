"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import { BulkActionBar } from "@/components/BulkActionBar";
import { deleteQuotationCascade } from "@/lib/quotationDelete";
import { useBulkDeletePermission } from "@/app/dashboard/PermissionProvider";
import ListFilterBar from "@/components/ListFilterBar";
import QuotationRow from "./QuotationRow";

export default function QuotationsTable({ quotations: allQuotations }: { quotations: any[] }) {
  const router = useRouter();
  const supabase = createClient();
  const { partition, markFulfilled } = useBulkDeletePermission("quotations");

  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const customerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    allQuotations.forEach((q: any) => { if (q.customer_id && q.customers?.name) seen.set(q.customer_id, q.customers.name); });
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [allQuotations]);

  const quotations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allQuotations.filter((qt: any) => {
      if (customerId && qt.customer_id !== customerId) return false;
      if (dateFrom && qt.quotation_date < dateFrom) return false;
      if (dateTo && qt.quotation_date > dateTo) return false;
      if (search.trim()) {
        const hay = `${qt.quotation_no ?? ""} ${qt.customers?.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allQuotations, search, customerId, dateFrom, dateTo]);

  function clearFilters() {
    setSearch(""); setCustomerId(""); setDateFrom(""); setDateTo("");
  }

  const {
    selectedIds, selectedCount, isSelected, toggle, toggleAll, isAllSelected, isSomeSelected, clear,
  } = useBulkSelect(quotations, (q: any) => q.id);

  async function handleBulkDelete() {
    const { allowed, blocked } = partition(selectedIds);
    const errors: string[] = [];
    for (const id of allowed) {
      const quotation = quotations.find((q: any) => q.id === id);
      const result = await deleteQuotationCascade(supabase, id);
      if (!result.ok) errors.push(`${quotation?.quotation_no ?? id}: ${result.error}`);
    }
    if (blocked.length > 0) errors.push(`${blocked.length}টা Quotation-এ Delete অনুমতি নেই — নিজের Delete বাটন থেকে Request পাঠান।`);
    await markFulfilled(allowed);
    clear();
    router.refresh();
    if (errors.length > 0) {
      alert(`${errors.length}টি Quotation মুছা যায়নি:\n\n${errors.join("\n")}`);
    }
  }

  return (
    <div>
      <ListFilterBar
        search={search} onSearchChange={setSearch} searchPlaceholder="Quotation No / Customer..."
        customers={customerOptions} customerId={customerId} onCustomerChange={setCustomerId}
        dateFrom={dateFrom} onDateFromChange={setDateFrom} dateTo={dateTo} onDateToChange={setDateTo}
        onClear={clearFilters}
      />
      <p className="mb-2 text-xs text-gray-400">{quotations.length} / {allQuotations.length} টা Quotation দেখানো হচ্ছে</p>
      <BulkActionBar count={selectedCount} itemLabel="Quotation" onDeleteSelected={handleBulkDelete} onClear={clear} />
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2 w-10">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => { if (el) el.indeterminate = isSomeSelected; }}
                  onChange={toggleAll}
                  aria-label="Select all quotations"
                />
              </th>
              <th className="px-4 py-2">Quotation No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2 text-right">Total Amount</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {quotations.map((q: any) => (
              <QuotationRow key={q.id} quotation={q} selected={isSelected(q.id)} onToggleSelect={() => toggle(q.id)} />
            ))}
            {quotations.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-3 text-gray-400 italic">
                {allQuotations.length === 0 ? "এখনো কোনো Quotation নেই" : "এই ফিল্টারে কোনো Quotation নেই"}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
