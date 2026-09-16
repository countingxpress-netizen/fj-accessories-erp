"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveElementAsPdf } from "@/lib/saveAsPdf";

// চালান Print/Save করলে Delivery Status 'delivery_done' হয় (challan_ready থেকে)।
// আগেই delivery_done/challan_received হলে শুধু print/save — status নামানো হয় না।
// router.refresh() ইচ্ছাকৃতভাবে নেই (Product কলামের হাতে-এডিট মুছে যেত)।
export default function ChallanPrintButton({
  challanId, currentStatus, pdfFilename, pdfContentId = "pdf-area",
}: { challanId: string; currentStatus: string; pdfFilename?: string; pdfContentId?: string }) {
  const [busy, setBusy] = useState(false);
  const supabase = createClient();

  async function markDelivered() {
    if (currentStatus === "challan_ready") {
      await supabase
        .from("delivery_challans")
        .update({ delivery_status: "delivery_done", printed_at: new Date().toISOString() })
        .eq("id", challanId);
    }
  }

  async function handlePrint() {
    setBusy(true);
    await markDelivered();
    setBusy(false);
    window.print();
  }

  async function handleSavePdf() {
    if (!pdfFilename) return;
    setBusy(true);
    try {
      await markDelivered();
      await saveElementAsPdf(pdfContentId, pdfFilename);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      {pdfFilename && (
        <button
          onClick={handleSavePdf}
          disabled={busy}
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          💾 Save as PDF
        </button>
      )}
      <button
        onClick={handlePrint}
        disabled={busy}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {pdfFilename ? "🖨 Print" : "🖨 PDF ডাউনলোড / Print"}
      </button>
    </div>
  );
}
