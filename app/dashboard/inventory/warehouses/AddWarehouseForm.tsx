"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AddWarehouseForm() {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.from("warehouses").insert({ name, location });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setName("");
    setLocation("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-4 shadow-sm mb-6 space-y-3">
      <h2 className="font-semibold text-gray-800">নতুন গুদাম (Warehouse) যোগ করুন</h2>
      <div className="flex gap-3">
        <input
          placeholder="গুদামের নাম (যেমন: Main Factory Store)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
          required
        />
        <input
          placeholder="অবস্থান (ঐচ্ছিক)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {loading ? "সেভ হচ্ছে..." : "যোগ করুন"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}