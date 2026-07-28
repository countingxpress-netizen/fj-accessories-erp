"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Customer = { id: string; name: string };

export default function AddGarmentForm({ customers }: { customers: Customer[] }) {
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!customerId || !name) { setError("Customer ও Garments নাম দিন।"); return; }
    setLoading(true);
    const { error } = await supabase.from("garments").insert({ customer_id: customerId, name, address });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setName(""); setAddress("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-4 shadow-sm mb-6 space-y-3">
      <h2 className="font-semibold text-gray-800">নতুন Garments যোগ করুন</h2>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[180px]">
            <option value="">-- বাছুন --</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Garments নাম</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[180px]" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-gray-500 mb-1">ঠিকানা</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {loading ? "সেভ হচ্ছে..." : "যোগ করুন"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}