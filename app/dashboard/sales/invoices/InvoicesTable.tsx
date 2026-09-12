"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import { BulkActionBar } from "@/components/BulkActionBar";
import { deleteInvoiceCascade } from "@/lib/invoiceDelete";
import { useBulkDeletePermission } from "@/app/dashboard/PermissionProvider";
import ListFilterBar from "@/components/ListFilterBar";
import InvoiceRow from "./InvoiceRow";

export default function InvoicesTable({ invoices: allInvoices, buyerNameMap = {} }: { invoices: any[]; buyerNameMap?: Record<string, string> }) {
  const router = useRouter();
  const supabase = createClient();
  const { partition, markFulfilled } = useBulkDeletePermission("sales_invoices");

  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  function invoiceBuyerIds(inv: any): string[] {
    return Array.from(new Set((inv.sales_invoice_items ?? []).map((it: any) => it.bookings?.buyer_id).filter(Boolean)));
  }

  const customerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    allInvoices.forEach((inv: any) => { if (inv.customer_id && inv.customers?.name) seen.set(inv.customer_id, inv.customers.name); });
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [allInvoices]);

  const buyerOptions = useMemo(() => {
    const ids = new Set<string>();
    allInvoices.forEach((inv: any) => invoiceBuyerIds(inv).forEach((id) => ids.add(id)));
    return Array.from(ids).map((id) => ({ value: id, label: buyerNameMap[id] ?? id })).sort((a, b) => a.label.localeCompare(b.label));
  }, [allInvoices, buyerNameMap]);

  const invoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allInvoices.filter((inv: any) => {
      if (customerId && inv.customer_id !== customerId) return false;
      if (buyerId && !invoiceBuyerIds(inv).includes(buyerId)) return false;
      if (dateFrom && inv.invoice_date < dateFrom) return false;
      if (dateTo && inv.invoice_date > dateTo) return false;
      if (q) {
        const hay = `${inv.invoice_no ?? ""} ${inv.customers?.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allInvoices, search, customerId, buyerId, dateFrom, dateTo]);

  function clearFilters() {
    setSearch(""); setCustomerId(""); setBuyerId(""); setDateFrom(""); setDateTo("");
  }

  const {
    selectedIds, selectedCount, isSelected, toggle, toggleAll, isAllSelected, isSomeSelected, clear,
  } = useBulkSelect(invoices, (inv: any) => inv.id);

  async function handleBulkDelete() {
    const { allowed, blocked } = partition(selectedIds);
    const errors: string[] = [];
    for (const id of allowed) {
      const invoice = invoices.find((inv: any) => inv.id === id);
      const result = await deleteInvoiceCascade(supabase, id, invoice?.voucher_id);
      if (!result.ok) errors.push(`${invoice?.invoice_no ?? id}: ${result.error}`);
    }
    if (blocked.length > 0) errors.push(`${blocked.length}টা Invoice-এ Delete অনুমতি নেই — নিজের Delete বাটন থেকে Request পাঠান।`);
    await markFulfilled(allowed);
    clear();
    router.refresh();
    if (errors.length > 0) {
      alert(`${errors.length}টি Invoice মুছা যায়নি:\n\n${errors.join("\n")}`);
    }
  }

  return (
    <div>
      <ListFilterBar
        search={search} onSearchChange={setSearch} searchPlaceholder="Invoice No / Customer..."
        customers={customerOptions} customerId={customerId} onCustomerChange={setCustomerId}
        buyers={buyerOptions} buyerId={buyerId} onBuyerChange={setBuyerId}
        dateFrom={dateFrom} onDateFromChange={setDateFrom} dateTo={dateTo} onDateToChange={setDateTo}
        onClear={clearFilters}
      />
      <p className="mb-2 text-xs text-gray-400">{invoices.length} / {allInvoices.length} টা Invoice দেখানো হচ্ছে</p>
      <BulkActionBar count={selectedCount} itemLabel="Invoice" onDeleteSelected={handleBulkDelete} onClear={clear} />
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
                  aria-label="Select all invoices"
                />
              </th>
              <th className="px-4 py-2">Invoice No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Bookings</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Total Amount</th>
              <th className="px-4 py-2 text-right">Commission</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv: any) => (
              <InvoiceRow key={inv.id} invoice={inv} selected={isSelected(inv.id)} onToggleSelect={() => toggle(inv.id)} />
            ))}
            {invoices.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-3 text-gray-400 italic">
                {allInvoices.length === 0 ? "এখনো কোনো Sales Invoice নেই" : "এই ফিল্টারে কোনো Sales Invoice নেই"}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
