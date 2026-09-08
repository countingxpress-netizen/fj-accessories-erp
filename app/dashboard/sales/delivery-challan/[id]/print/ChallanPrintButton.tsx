"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// চালান Print করলে Delivery Status 'delivery_done' হয়ে যায় (challan_ready থেকে)।
// আগেই delivery_done/challan_received হলে আর নামানো হয় না — শুধু print।
export default function ChallanPrintButton({
  challanId, currentStatus,
}: { challanId: string; currentStatus: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handlePrint() {
    if (currentStatus === "challan_ready") {
      setBusy(true);
      await supabase
        .from("delivery_challans")
        .update({ delivery_status: "delivery_done", printed_at: new Date().toISOString() })
        .eq("id", challanId);
      setBusy(false);
      router.refresh();
    }
    window.print();
  }

  return (
    <div className="print:hidden mb-4 flex justify-end gap-2">
      <button
        onClick={handlePrint}
        disabled={busy}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        🖨 Print
      </button>
    </div>
  );
}
