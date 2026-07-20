"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AddProductForm() {
  const [name, setName] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [thickness, setThickness] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.from("finished_goods").insert({
      product_name: name,
      length_cm: parseFloat(length),
      width_cm: parseFloat(width),
      thickness: parseFloat(thickness),
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setName("");
    setLength("");
    setWidth("");
    setThickness("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-4 shadow-sm mb-6 space-y-3">
      <h2 className="font-semibold text-gray-800">নতুন পণ্য (Product) যোগ করুন</h2>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-500 mb-1">Product Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="যেমন: LLDPE Bag 10x12"
            className="w-full rounded-lg border px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Length (cm)</label>
          <input
            type="number" step="0.001" value={length}
            onChange={(e) => setLength(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm w-28" required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Width (cm)</label>
          <input
            type="number" step="0.001" value={width}
            onChange={(e) => setWidth(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm w-28" required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Thickness</label>
          <input
            type="number" step="0.0001" value={thickness}
            onChange={(e) => setThickness(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm w-28" required
          />
        </div>
        <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {loading ? "সেভ হচ্ছে..." : "যোগ করুন"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}