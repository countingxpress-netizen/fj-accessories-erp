"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";
import { deleteInvoiceCascade } from "@/lib/invoiceDelete";
import GuardedAction from "@/app/dashboard/GuardedAction";

export default function InvoiceRow({
  invoice, selected, onToggleSelect,
}: { invoice: any; selected?: boolean; onToggleSelect?: () => void }) {
  const router = useRouter();
  const supabase = createClient();

  const total = (invoice.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
  const qty = (invoice.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.quantity_pcs || 0), 0);
  const bookingNos = Array.from(new Set((invoice.sales_invoice_items ?? []).map((i: any) => i.bookings?.booking_no))).join(", ");

  async function handleDelete() {
    if (!window.confirm(`Invoice "${invoice.invoice_no}" মুছে ফেলতে চান? এর সাথে যুক্ত Journal Voucher-ও মুছে যাবে।`)) return;

    const result = await deleteInvoiceCascade(supabase, invoice.id, invoice.voucher_id);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2">
        <input
          type="checkbox"
          checked={!!selected}
          onChange={onToggleSelect}
          aria-label={`Select invoice ${invoice.invoice_no}`}
        />
      </td>
      <td className="px-4 py-2 font-medium">{invoice.invoice_no}</td>
      <td className="px-4 py-2 text-gray-500">{formatDate(invoice.invoice_date)}</td>
      <td className="px-4 py-2">{invoice.customers?.name ?? "-"}</td>
      <td className="px-4 py-2 text-xs text-gray-500">{bookingNos}</td>
      <td className="px-4 py-2 text-right">{qty.toLocaleString()}</td>
      <td className="px-4 py-2 text-right">{total.toFixed(2)}</td>
      <td className="px-4 py-2 text-right text-purple-700">{invoice.commission != null ? invoice.commission.toFixed(2) : "-"}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <Link href={`/dashboard/sales/invoices/${invoice.id}/print`} target="_blank" className="text-blue-700 hover:underline text-xs mr-2">View</Link>
        {invoice.customers?.name === "AT Accessories" && (
          <Link href={`/dashboard/sales/invoices/${invoice.id}/print-customer`} target="_blank" className="text-purple-700 hover:underline text-xs mr-2">Submit to Customer</Link>
        )}
        <GuardedAction
          table="sales_invoices" recordId={invoice.id} recordLabel={invoice.invoice_no} action="edit"
          onAllowed={() => router.push(`/dashboard/sales/invoices/${invoice.id}/edit`)}
          className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100 mr-2"
        >
          Edit
        </GuardedAction>
        <GuardedAction
          table="sales_invoices" recordId={invoice.id} recordLabel={invoice.invoice_no} action="delete"
          onAllowed={handleDelete}
          className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
        >
          Delete
        </GuardedAction>
      </td>
    </tr>
  );
}
