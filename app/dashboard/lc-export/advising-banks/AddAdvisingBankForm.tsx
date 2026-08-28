"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AddAdvisingBankForm() {
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [address, setAddress] = useState("");
  const [swift, setSwift] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name) { setError("Bank Name দিন।"); return; }
    setLoading(true);
    const { error } = await supabase.from("advising_banks").insert({
      name, branch: branch || null, address: address || null, swift: swift || null,
    });
    setLoading(false);
    if (error) {
      const hint = error.message.includes("does not exist")
        ? " advising_banks টেবিলে migration SQL চালাতে হবে (Doc5)।"
        : "";
      setError(`${error.message}${hint}`);
      return;
    }
    setName(""); setBranch(""); setAddress(""); setSwift("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-4 shadow-sm mb-6">
      <h2 className="font-semibold text-gray-800 mb-3">নতুন Advising Bank যোগ করুন</h2>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Bank Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[200px]" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Branch</label>
          <input value={branch} onChange={(e) => setBranch(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[180px]" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-gray-500 mb-1">Address</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">SWIFT Code</label>
          <input value={swift} onChange={(e) => setSwift(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-40" />
        </div>
        <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {loading ? "সেভ হচ্ছে..." : "যোগ করুন"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </form>
  );
}
