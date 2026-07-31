"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PaymentActions({ paymentId, voucherId }: { paymentId: string; voucherId: string | null }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleDelete() {
    if (!window.confirm("এই Payment মুছে ফেলতে চান? সংশ্লিষ্ট Journal Voucher-ও মুছে যাবে।")) return;

    if (voucherId) {
      await supabase.from("journal_entry_lines").delete().eq("voucher_id", voucherId);
      await supabase.from("journal_vouchers").delete().eq("id", voucherId);
    }
    await supabase.from("payment_allocations").delete().eq("payment_id", paymentId);
    const { error } = await supabase.from("customer_payments").delete().eq("id", paymentId);

    if (error) {
      alert("মুছে ফেলা যায়নি: " + error.message);
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