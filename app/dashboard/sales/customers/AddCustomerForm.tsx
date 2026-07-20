"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AddCustomerForm() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pricePerLbs, setPricePerLbs] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.from("customers").insert({
      name,
      address,
      phone,
      email,
      price_per_lbs: pricePerLbs ? parseFloat(pricePerLbs) : null,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setName(""); setAddress(""); setPhone(""); setEmail(""); setPricePerLbs("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-4 shadow-sm mb-6 space-y-3">
      <h2 className="font-semibold text-gray-800">নতুন Customer যোগ করুন</h2>
      <div className="flex flex-wrap gap-3">
        <input placeholder="নাম" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 min-w-[160px] rounded-lg border px-3 py-2 text-sm" required />
        <input placeholder="ঠিকানা" value={address} onChange={(e) => setAddress(e.target.value)} className="flex-1 min-w-[160px] rounded-lg border px-3 py-2 text-sm" />
        <input placeholder="ফোন" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-36 rounded-lg border px-3 py-2 text-sm" />
        <input placeholder="ইমেইল" value={email} onChange={(e) => setEmail(e.target.value)} className="w-48 rounded-lg border px-3 py-2 text-sm" />
        <input type="number" step="0.01" placeholder="Price/Lbs (ঐচ্ছিক)" value={pricePerLbs} onChange={(e) => setPricePerLbs(e.target.value)} className="w-40 rounded-lg border px-3 py-2 text-sm" />
        <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {loading ? "সেভ হচ্ছে..." : "যোগ করুন"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}