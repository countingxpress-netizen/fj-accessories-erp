"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deriveCustomerCode } from "@/lib/docNumber";
import { getCurrentUserId } from "@/lib/currentUser";
import { syncCustomerOpeningJv } from "@/lib/customerOpeningJv";

export default function AddCustomerForm() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pricePerLbs, setPricePerLbs] = useState("");
  const [priceEffectiveFrom, setPriceEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [defaultPrintRate, setDefaultPrintRate] = useState("0.20");
  const [defaultAdhesiveRate, setDefaultAdhesiveRate] = useState("0.02");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [openingBalanceDate, setOpeningBalanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [commissionPercentage, setCommissionPercentage] = useState("1");
  const [lbsInvoicingEnabled, setLbsInvoicingEnabled] = useState(false);
  const [makingCuttingRate, setMakingCuttingRate] = useState("0");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data: created, error } = await supabase.from("customers").insert({
      name,
      code: (code || deriveCustomerCode(name)).toUpperCase().trim() || null,
      address,
      phone,
      email,
      price_per_lbs: pricePerLbs ? parseFloat(pricePerLbs) : null,
      default_print_rate: parseFloat(defaultPrintRate) || 0.20,
      default_adhesive_rate: parseFloat(defaultAdhesiveRate) || 0.02,
      opening_balance: parseFloat(openingBalance) || 0,
      opening_balance_date: openingBalanceDate,
      commission_enabled: commissionEnabled,
      commission_percentage: parseFloat(commissionPercentage) || 0,
      lbs_invoicing_enabled: lbsInvoicingEnabled,
      making_cutting_rate: parseFloat(makingCuttingRate) || 0,
    }).select("id").single();
    if (error || !created) {
      setLoading(false);
      setError(error?.message ?? "Customer তৈরি ব্যর্থ হয়েছে।");
      return;
    }
    // শুরুর Price/Lbs টা rate_history-তে প্রথম এন্ট্রি হিসেবে বসে — পরের পরিবর্তনগুলো
    // Customer রো-এর "History" প্যানেল থেকে তারিখ-ভিত্তিক ভাবে যোগ হবে।
    if (pricePerLbs) {
      const createdBy = await getCurrentUserId(supabase);
      await supabase.from("rate_history").insert({
        customer_id: created.id,
        rate: parseFloat(pricePerLbs),
        effective_from: priceEffectiveFrom || new Date().toISOString().slice(0, 10),
        note: "শুরুর দাম",
        created_by: createdBy,
      });
    }
    // opening balance দিলে consolidated Customer opening JV আপডেট হবে
    await syncCustomerOpeningJv(supabase);
    setLoading(false);
    setName(""); setCode(""); setCodeTouched(false); setAddress(""); setPhone(""); setEmail(""); setPricePerLbs("");
    setPriceEffectiveFrom(new Date().toISOString().slice(0, 10));
    setDefaultPrintRate("0.20"); setDefaultAdhesiveRate("0.02");
    setOpeningBalance("0"); setOpeningBalanceDate(new Date().toISOString().slice(0, 10));
    setCommissionEnabled(false); setCommissionPercentage("1");
    setLbsInvoicingEnabled(false); setMakingCuttingRate("0");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-4 shadow-sm mb-6 space-y-3">
      <h2 className="font-semibold text-gray-800">নতুন Customer যোগ করুন</h2>
      <div className="flex flex-wrap gap-3">
        <input placeholder="নাম" value={name} onChange={(e) => { setName(e.target.value); if (!codeTouched) setCode(deriveCustomerCode(e.target.value)); }} className="flex-1 min-w-[160px] rounded-lg border px-3 py-2 text-sm" required />
        <input placeholder="Code (PI নম্বরে, unique)" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeTouched(true); }} className="w-40 rounded-lg border px-3 py-2 text-sm" title="PI নম্বর: PI/FNJ-{seq}-{CODE}/{year}" />
        <input placeholder="ঠিকানা" value={address} onChange={(e) => setAddress(e.target.value)} className="flex-1 min-w-[160px] rounded-lg border px-3 py-2 text-sm" />
        <input placeholder="ফোন" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-36 rounded-lg border px-3 py-2 text-sm" />
        <input placeholder="ইমেইল" value={email} onChange={(e) => setEmail(e.target.value)} className="w-48 rounded-lg border px-3 py-2 text-sm" />
      </div>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Price/Lbs (ঐচ্ছিক)</label>
          <input type="number" step="0.01" value={pricePerLbs} onChange={(e) => setPricePerLbs(e.target.value)} className="w-40 rounded-lg border px-3 py-2 text-sm" />
        </div>
        {pricePerLbs && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">দাম কার্যকর তারিখ থেকে</label>
            <input type="date" value={priceEffectiveFrom} onChange={(e) => setPriceEffectiveFrom(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
          </div>
        )}
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
        <div>
          <label className="flex items-center gap-2 text-xs text-gray-600 mb-1">
            <input type="checkbox" checked={commissionEnabled} onChange={(e) => setCommissionEnabled(e.target.checked)} />
            কমিশন প্রযোজ্য
          </label>
          {commissionEnabled && (
            <input type="number" step="0.01" value={commissionPercentage} onChange={(e) => setCommissionPercentage(e.target.value)} className="w-28 rounded-lg border px-3 py-2 text-sm" placeholder="Commission %" title="Invoice Total-এর কত % কমিশন (AT ছাড়া)" />
          )}
        </div>
        <div>
          <label className="flex items-center gap-2 text-xs text-gray-600 mb-1" title="Powder/Making/Printing/Adhesive ভাগে LBS Invoice হবে">
            <input type="checkbox" checked={lbsInvoicingEnabled} onChange={(e) => setLbsInvoicingEnabled(e.target.checked)} />
            LBS Invoicing
          </label>
          {lbsInvoicingEnabled && (
            <>
              <input type="number" step="0.01" value={makingCuttingRate} onChange={(e) => setMakingCuttingRate(e.target.value)} className="w-32 rounded-lg border px-3 py-2 text-sm" placeholder="Making-Cutting Rate" title="Making + Cutting চার্জ — BDT / Lb" />
              <p className="text-[11px] text-gray-400 mt-1 max-w-[13rem]">Powder Bill rate = উপরের <b>Price/Lbs</b> — সেটাও দিন।</p>
            </>
          )}
        </div>
        <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {loading ? "সেভ হচ্ছে..." : "যোগ করুন"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}