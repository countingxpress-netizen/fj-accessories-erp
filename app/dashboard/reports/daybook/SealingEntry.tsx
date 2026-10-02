"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/currentUser";

// দৈনিক সাইড/বটম সিলিং — খাতার হাতে গোনা সংখ্যা (daybook_sealing)। এক দিনে একটাই এন্ট্রি; আবার সেভ করলে বদলে যায়।
// এন্ট্রি থাকলে DayBook-এ সেটাই দেখায়, না থাকলে cutting-সম্পন্ন pcs থেকে হিসাব।
export default function SealingEntry({
  date,
  side,
  bottom,
}: {
  date: string;
  side: number | null;
  bottom: number | null;
}) {
  const router = useRouter();
  const [sideText, setSideText] = useState(side != null ? String(side) : "");
  const [bottomText, setBottomText] = useState(bottom != null ? String(bottom) : "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setMsg("");
    const s = Number(sideText || 0);
    const b = Number(bottomText || 0);
    if (!Number.isFinite(s) || !Number.isFinite(b) || s < 0 || b < 0) {
      setMsg("সঠিক সংখ্যা দিন।");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const createdBy = await getCurrentUserId(supabase);
    const { error } = await supabase
      .from("daybook_sealing")
      .upsert({ seal_date: date, side_pcs: s, bottom_pcs: b, created_by: createdBy }, { onConflict: "seal_date" });
    setSaving(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg("✔ সেভ হয়েছে");
    router.refresh();
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border bg-gray-50 px-3 py-2 text-sm">
      <span className="font-medium text-gray-700">সিলিং এন্ট্রি ({date.split("-").reverse().join(".")}):</span>
      <label className="flex items-center gap-1">
        সাইড
        <input value={sideText} onChange={(e) => setSideText(e.target.value)} inputMode="numeric"
          className="w-28 rounded border px-2 py-1 text-right" placeholder="0" />
      </label>
      <label className="flex items-center gap-1">
        বটম
        <input value={bottomText} onChange={(e) => setBottomText(e.target.value)} inputMode="numeric"
          className="w-28 rounded border px-2 py-1 text-right" placeholder="0" />
      </label>
      <button type="button" onClick={save} disabled={saving}
        className="rounded bg-gray-900 px-3 py-1 text-white disabled:opacity-50">
        {saving ? "সেভ হচ্ছে..." : "সেভ"}
      </button>
      {msg && <span className={msg.startsWith("✔") ? "text-green-700" : "text-red-600"}>{msg}</span>}
      <span className="text-xs text-gray-400">খালি থাকলে cutting-সম্পন্ন pcs থেকে হিসাব হয়</span>
    </div>
  );
}
