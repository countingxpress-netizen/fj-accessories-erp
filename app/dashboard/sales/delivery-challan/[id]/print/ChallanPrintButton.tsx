"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// চালান Print করলে Delivery Status 'delivery_done' হয় (challan_ready থেকে)।
// আগেই delivery_done/challan_received হলে শুধু print — status নামানো হয় না।
// router.refresh() ইচ্ছাকৃতভাবে নেই (Product কলামের হাতে-এডিট মুছে যেত)।
export default function ChallanPrintButton({
  challanId, currentStatus,
}: { challanId: string; currentStatus: string }) {
  const [busy, setBusy] = useState(false);
  const supabase = createClient();

  async function handlePrint() {
    if (currentStatus === "challan_ready") {
      setBusy(true);
      await supabase
        .from("delivery_challans")
        .update({ delivery_status: "delivery_done", printed_at: new Date().toISOString() })
        .eq("id", challanId);
      setBusy(false);
    }
    window.print();
  }

  return (
    <button
      onClick={handlePrint}
      disabled={busy}
      className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
    >
      🖨 Print
    </button>
  );
}
