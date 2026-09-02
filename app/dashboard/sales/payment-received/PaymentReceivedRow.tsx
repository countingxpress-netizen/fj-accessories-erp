"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";
import { deleteCustomerPaymentCascade } from "@/lib/paymentReceivedDelete";
import GuardedAction from "@/app/dashboard/GuardedAction";

export default function PaymentReceivedRow({
  payment, selected, onToggleSelect,
}: { payment: any; selected?: boolean; onToggleSelect?: () => void }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleDelete() {
    if (!window.confirm("এই Payment মুছে ফেলতে চান? সংশ্লিষ্ট Journal Voucher-ও মুছে যাবে।")) return;

    const result = await deleteCustomerPaymentCascade(supabase, payment.id, payment.voucher_id);
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
          aria-label={`Select payment from ${payment.customers?.name ?? payment.id}`}
        />
      </td>
      <td className="px-4 py-2 text-gray-500">{formatDate(payment.payment_date)}</td>
      <td className="px-4 py-2">{payment.customers?.name ?? "-"}</td>
      <td className="px-4 py-2 text-gray-500 capitalize">{(payment.payment_mode ?? "cash").replace(/_/g, " ")}</td>
      <td className="px-4 py-2 text-gray-500">{payment.note || "-"}</td>
      <td className="px-4 py-2 text-right">{payment.amount.toFixed(2)}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <Link href={`/dashboard/sales/payment-received/${payment.id}`} className="text-blue-700 hover:underline text-xs mr-2">View</Link>
        <GuardedAction table="customer_payments" recordId={payment.id} recordLabel={`${payment.customers?.name ?? ""} ${formatDate(payment.payment_date)}`} action="delete"
          onAllowed={handleDelete}
          className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Delete</GuardedAction>
      </td>
    </tr>
  );
}
