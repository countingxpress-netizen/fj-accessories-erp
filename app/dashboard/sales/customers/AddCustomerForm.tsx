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
  const [defaultPrintRate, setDefaultPrintRate] = useState("0.20");
  const [defaultAdhesiveRate, setDefaultAdhesiveRate] = useState("0.02");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [openingBalanceDate, setOpeningBalanceDate] = useState(new Date().toISOString().slice(0, 10));
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
      default_print_rate: parseFloat(defaultPrintRate) || 0.20,
      default_adhesive_rate: parseFloat(defaultAdhesiveRate) || 0.02,
      opening_balance: parseFloat(openingBalance) || 0,
      opening_balance_date: openingBalanceDate,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setName(""); setAddress(""); setPhone(""); setEmail(""); setPricePerLbs("");
    setDefaultPrintRate("0.20"); setDefaultAdhesiveRate("0.02");
    setOpeningBalance("0"); setOpeningBalanceDate(new Date().toISOString().slice(0, 10));
    setOpeningBalance("0"); setOpeningBalanceDate(new Date().toISOString().slice(0, 10));
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
      </div>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Price/Lbs (ঐচ্ছিক)</label>
          <input type="number" step="0.01" value={pricePerLbs} onChange={(e) => setPricePerLbs(e.target.value)} className="w-40 rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Default Print Rate/Color/Pc</label>
          <input type="number" step="0.01" value={defaultPrintRate} onChange={(e) => setDefaultPrintRate(e.target.value)} className="w-40 rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Default Adhesive Rate/Inch</label>
          <input type="number" step="0.001" value={defaultAdhesiveRate} onChange={(e) => setDefaultAdhesiveRate(e.target.value)} className="w-40 rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Opening Balance (আগের বাকি)</label>
          <input type="number" step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} className="w-36 rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Opening Balance Date</label>
          <input type="date" value={openingBalanceDate} onChange={(e) => setOpeningBalanceDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {loading ? "সেভ হচ্ছে..." : "যোগ করুন"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}