"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { lcRefText } from "@/lib/lcDocuments";

// Export LC সিরিয়াল — LC-র সব ডকুমেন্টের রেফারেন্স (Mushok-6.3 বাদে)
export default function SerialNoEditor({ lcId, initial, lcDate, beneficiary }: {
  lcId: string; initial: number | null; lcDate: string | null; beneficiary: string | null;
}) {
  const [value, setValue] = useState(initial == null ? "" : String(initial));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();
  const supabase = createClient();
  const parsed = value.trim() ? parseInt(value, 10) : null;
  const dirty = parsed !== initial;

  async function save() {
    setSaving(true);
    setMsg("");
    const { error } = await supabase.from("lc_register").update({ serial_no: parsed }).eq("id", lcId);
    setSaving(false);
    if (error) {
      setMsg(error.code === "23505" ? `সিরিয়াল ${parsed} অন্য Export LC-তে আছে` : "সেভ ব্যর্থ: " + error.message);
      return;
    }
    setMsg("সেভ হয়েছে");
    router.refresh();
  }

  return (
    <div>
      <p className="text-xs text-gray-500">Serial No (ডকুমেন্টের Ref)</p>
      <div className="flex items-center gap-2">
        <input type="number" value={value} onChange={(e) => { setValue(e.target.value); setMsg(""); }}
          className="w-24 rounded border px-2 py-1 text-sm" />
        <button type="button" onClick={save} disabled={!dirty || saving}
          className="rounded bg-gray-900 px-2 py-1 text-xs text-white disabled:opacity-30">{saving ? "..." : "সেভ"}</button>
      </div>
      <p className="text-[11px] text-gray-400">{lcRefText(parsed, lcDate, beneficiary) || "Ref নেই"}{msg && ` · ${msg}`}</p>
    </div>
  );
}
