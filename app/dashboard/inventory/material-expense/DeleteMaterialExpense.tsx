"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteMaterialExpense } from "@/lib/materialExpense";

export default function DeleteMaterialExpense({ voucherId, label }: { voucherId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function run() {
    if (!window.confirm(`"${label}" মুছবেন? স্টক ফেরত যাবে আর JV মুছে যাবে।`)) return;
    setBusy(true);
    await deleteMaterialExpense(supabase, voucherId);
    setBusy(false);
    router.refresh();
  }

  return (
    <button onClick={run} disabled={busy} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-40">
      মুছুন
    </button>
  );
}
