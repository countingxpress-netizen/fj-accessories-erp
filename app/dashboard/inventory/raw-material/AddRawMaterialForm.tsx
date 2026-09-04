"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Account = { account_code: string; account_name: string };

const UNITS = ["lbs", "kg", "bag", "carton"];

export default function AddRawMaterialForm({ accounts }: { accounts: Account[] }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("lbs");
  const [reorder, setReorder] = useState("");
  const [invAccount, setInvAccount] = useState(
    accounts.some((a) => a.account_code === "1299") ? "1299" : accounts[0]?.account_code ?? ""
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Material নাম দিন।");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("raw_materials").insert({
      material_name: name.trim(),
      unit,
      reorder_level_lbs: parseFloat(reorder) || 0,
      inventory_account_code: invAccount || null,
    });
    setLoading(false);
    if (error) {
      setError(/duplicate|unique/i.test(error.message) ? `"${name.trim()}" নামে material আগে থেকেই আছে।` : error.message);
      return;
    }
    setName("");
    setReorder("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-4 shadow-sm mb-6 space-y-3">
      <h2 className="font-semibold text-gray-800">নতুন Raw Material যোগ করুন</h2>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-gray-500 mb-1">Material Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="যেমন: LLDPE, HDPE, Master Batch"
            className="w-full rounded-lg border px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Unit</label>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            {UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Reorder Level (Lbs)</label>
          <input
            type="number"
            step="0.01"
            value={reorder}
            onChange={(e) => setReorder(e.target.value)}
            placeholder="0.00"
            className="w-32 rounded-lg border px-3 py-2 text-sm"
          />
        </div>
        <div className="min-w-[220px]">
          <label className="block text-xs text-gray-500 mb-1">Inventory Account</label>
          <select
            value={invAccount}
            onChange={(e) => setInvAccount(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.account_code} value={a.account_code}>
                {a.account_code} - {a.account_name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {loading ? "সেভ হচ্ছে..." : "যোগ করুন"}
        </button>
      </div>
      <p className="text-xs text-gray-400">
        গড় খরচ (avg cost / lb) purchase বা Opening Inventory এন্ট্রি থেকে অটো হিসাব হয় — এখানে দিতে হয় না।
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
