"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteCustomerPaymentCascade } from "@/lib/paymentReceivedDelete";

export default function PaymentActions({ paymentId, voucherId }: { paymentId: string; voucherId: string | null }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleDelete() {
    if (!window.confirm("এই Payment মুছে ফেলতে চান? সংশ্লিষ্ট Journal Voucher-ও মুছে যাবে।")) return;

    const result = await deleteCustomerPaymentCascade(supabase, paymentId, voucherId);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    router.push("/dashboard/sales/payment-received");
    router.refresh();
  }

  return (
    <button onClick={handleDelete} className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 hover:bg-red-100">
      Delete
    </button>
  );
}
