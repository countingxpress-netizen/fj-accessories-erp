"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { REQUIRED_DOCUMENT_OPTIONS } from "@/lib/lcDocuments";

// LC সেভের পরেও Required Documents বদলানো যায় — ডকুমেন্ট সেটের প্রিন্টে এগুলোই আসে
export default function RequiredDocsEditor({ lcId, initial }: { lcId: string; initial: string[] }) {
  const [docs, setDocs] = useState<string[]>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();
  const supabase = createClient();
  const dirty = [...docs].sort().join("|") !== [...initial].sort().join("|");

  function toggle(doc: string) {
    setDocs((prev) => (prev.includes(doc) ? prev.filter((d) => d !== doc) : [...prev, doc]));
    setMsg("");
  }

  async function save() {
    setSaving(true);
    const ordered = REQUIRED_DOCUMENT_OPTIONS.filter((d) => docs.includes(d)).concat(docs.filter((d) => !REQUIRED_DOCUMENT_OPTIONS.includes(d)));
    const { error } = await supabase.from("lc_register").update({ required_documents: ordered }).eq("id", lcId);
    setSaving(false);
    setMsg(error ? "সেভ ব্যর্থ: " + error.message : "সেভ হয়েছে");
    if (!error) router.refresh();
  }

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Required Documents</h2>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-gray-500">{msg}</span>}
          <button type="button" onClick={save} disabled={!dirty || saving}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-30">
            {saving ? "সেভ হচ্ছে..." : "সেভ"}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {REQUIRED_DOCUMENT_OPTIONS.map((doc) => (
          <label key={doc} className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={docs.includes(doc)} onChange={() => toggle(doc)} />
            {doc}
          </label>
        ))}
      </div>
    </section>
  );
}
