"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AddCustomerGroupForm() {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("গ্রুপের নাম দিন।"); return; }
    setLoading(true);
    const { error } = await supabase.from("customer_groups").insert({ name: name.trim(), note: note.trim() || null });
    setLoading(false);
    if (error) {
      const hint = error.message.includes("does not exist")
        ? " — customer_groups migration চালাতে হবে (npm run db:push)।"
        : "";
      setError(`${error.message}${hint}`);
      return;
    }
    setName(""); setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-4 shadow-sm mb-6">
      <h2 className="font-semibold text-gray-800 mb-3">নতুন গ্রুপ যোগ করুন</h2>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">গ্রুপের নাম</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-56 rounded-lg border px-3 py-2 text-sm" placeholder="যেমন: নতুন পার্টি" required />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-500 mb-1">নোট (ঐচ্ছিক)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {loading ? "সেভ হচ্ছে..." : "যোগ করুন"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </form>
  );
}
