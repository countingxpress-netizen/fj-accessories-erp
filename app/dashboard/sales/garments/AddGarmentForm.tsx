"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Customer = { id: string; name: string };

export default function AddGarmentForm({ customers }: { customers: Customer[] }) {
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [pricingRule, setPricingRule] = useState<"manual" | "percentage" | "rate_per_lbs">("manual");
  const [percentageValue, setPercentageValue] = useState("0");
  const [rateValue, setRateValue] = useState("0");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!customerId || !name) { setError("Customer ও Garments নাম দিন।"); return; }
    setLoading(true);
    const { error } = await supabase.from("garments").insert({
      customer_id: customerId, name,
      pricing_rule: pricingRule,
      percentage_value: parseFloat(percentageValue) || 0,
      rate_per_lbs_value: parseFloat(rateValue) || 0,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setName(""); setPercentageValue("0"); setRateValue("0");
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
        <div>
          <label className="block text-xs text-gray-500 mb-1">Pricing Rule</label>
          <select value={pricingRule} onChange={(e) => setPricingRule(e.target.value as any)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="manual">Manual (ফিক্সড না)</option>
            <option value="percentage">Sales Invoice Price + %</option>
            <option value="rate_per_lbs">Rate/Lbs ভিত্তিক</option>
          </select>
        </div>
        {pricingRule === "percentage" && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Percentage (%)</label>
            <input type="number" step="0.01" value={percentageValue} onChange={(e) => setPercentageValue(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-28" />
          </div>
        )}
        {pricingRule === "rate_per_lbs" && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Rate/Lbs</label>
            <input type="number" step="0.01" value={rateValue} onChange={(e) => setRateValue(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-28" />
          </div>
        )}
        <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {loading ? "সেভ হচ্ছে..." : "যোগ করুন"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}