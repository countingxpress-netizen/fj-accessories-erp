"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";

export default function StatusTracker({
  productionOrder, hasPrint, bookingCreatedAt,
}: { productionOrder: any; hasPrint: boolean; bookingCreatedAt: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function markBlowingDone() {
    setLoading(true);
    await supabase.from("production_orders").update({
      blowing_completed_at: new Date().toISOString(),
      stage: "cutting",
    }).eq("id", productionOrder.id);
    setLoading(false);
    router.refresh();
  }

  async function markCuttingDone() {
    setLoading(true);
    await supabase.from("production_orders").update({
      cutting_completed_at: new Date().toISOString(),
      stage: hasPrint ? "printing" : "finished",
    }).eq("id", productionOrder.id);
    setLoading(false);
    router.refresh();
  }

  async function markPrintingDone() {
    setLoading(true);
    await supabase.from("production_orders").update({
      printing_completed_at: new Date().toISOString(),
      stage: "finished",
    }).eq("id", productionOrder.id);
    setLoading(false);
    router.refresh();
  }

  const blowingDone = !!productionOrder.blowing_completed_at;
  const printingDone = !!productionOrder.printing_completed_at;
  const cuttingDone = !!productionOrder.cutting_completed_at;
  const finishedDone = productionOrder.stage === "finished";

  function StepRow({ label, done, dateStr, children }: { label: string; done: boolean; dateStr?: string | null; children?: React.ReactNode }) {
    return (
      <div className="flex items-center justify-between border-t py-3">
        <div>
          <span className={`inline-block w-5 h-5 rounded-full text-xs text-center leading-5 mr-2 ${done ? "bg-green-600 text-white" : "bg-gray-200 text-gray-500"}`}>
            {done ? "✓" : ""}
          </span>
          <span className="text-sm font-medium">{label}</span>
          {dateStr && <span className="text-xs text-gray-400 ml-2">({formatDate(dateStr)})</span>}
        </div>
        <div className="flex gap-2">{children}</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm px-4 divide-y">
      <StepRow label="a. বুকিং রিসিভ করলাম" done dateStr={bookingCreatedAt} />

      <StepRow label="b. ব্লোয়িং সিডিউল দিলাম" done={blowingDone} dateStr={productionOrder.blowing_completed_at}>
        {!blowingDone && (
          <button onClick={markBlowingDone} disabled={loading} className="rounded bg-gray-900 px-3 py-1 text-xs text-white">সম্পন্ন করুন</button>
        )}
      </StepRow>

      <StepRow label="c. কাটিং সিডিউল দিলাম" done={cuttingDone} dateStr={productionOrder.cutting_completed_at}>
        {blowingDone && !cuttingDone && (
          <button onClick={markCuttingDone} disabled={loading} className="rounded bg-gray-900 px-3 py-1 text-xs text-white">সম্পন্ন করুন</button>
        )}
      </StepRow>

      {hasPrint ? (
        <StepRow label="d. প্রিন্টিং সিডিউল দিলাম" done={printingDone} dateStr={productionOrder.printing_completed_at}>
          {cuttingDone && !printingDone && (
            <button onClick={markPrintingDone} disabled={loading} className="rounded bg-gray-900 px-3 py-1 text-xs text-white">সম্পন্ন করুন</button>
          )}
        </StepRow>
      ) : (
        <StepRow label="d. প্রিন্টিং (নেই)" done={true} />
      )}

      <StepRow label="e. Finished Goods স্টোর হলো" done={finishedDone}>
        {!finishedDone && (
          <Link href="/dashboard/production/finished-goods-receive" className="text-xs text-blue-700 hover:underline self-center">Receive করুন →</Link>
        )}
      </StepRow>
    </div>
  );
}