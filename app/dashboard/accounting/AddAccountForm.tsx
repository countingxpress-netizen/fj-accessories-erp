"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AddAccountForm() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("asset");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.from("chart_of_accounts").insert({
      account_code: code,
      account_name: name,
      account_type: type,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setCode("");
    setName("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-4 shadow-sm mb-6 space-y-3">
      <h2 className="font-semibold text-gray-800">নতুন অ্যাকাউন্ট যোগ করুন</h2>
      <div className="flex gap-3">
        <input
          placeholder="Account Code (e.g. 1500)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-40 rounded-lg border px-3 py-2 text-sm"
          required
        />
        <input
          placeholder="Account Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
          required
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="asset">Asset</option>
          <option value="liability">Liability</option>
          <option value="equity">Equity</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "সেভ হচ্ছে..." : "যোগ করুন"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}