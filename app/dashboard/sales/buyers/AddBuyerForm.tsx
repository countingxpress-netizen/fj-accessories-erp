"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Customer = { id: string; name: string };

export default function AddBuyerForm({ customers }: { customers: Customer[] }) {
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [pricingRule, setPricingRule] = useState<"manual" | "percentage" | "rate_per_lbs">("manual");
  const [percentageValue, setPercentageValue] = useState("0");
  const [rateValue, setRateValue] = useState("0");
  const [piThicknessMm, setPiThicknessMm] = useState("");
  const [adhesiveRatePerInch, setAdhesiveRatePerInch] = useState("");
  const [printColorsDefault, setPrintColorsDefault] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!customerId || !name) { setError("Customer ও Buyer নাম দিন।"); return; }
    setLoading(true);
    const { error } = await supabase.from("buyers").insert({
      customer_id: customerId, name,
      pricing_rule: pricingRule,
      percentage_value: parseFloat(percentageValue) || 0,
      rate_per_lbs_value: parseFloat(rateValue) || 0,
      pi_thickness_mm: parseFloat(piThicknessMm) || null,
      adhesive_rate_per_inch: parseFloat(adhesiveRatePerInch) || null,
      print_colors_default: parseFloat(printColorsDefault) || null,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setName(""); setPercentageValue("0"); setRateValue("0"); setPiThicknessMm(""); setAdhesiveRatePerInch(""); setPrintColorsDefault("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-4 shadow-sm mb-6 space-y-3">
      <h2 className="font-semibold text-gray-800">নতুন Buyer যোগ করুন</h2>
      <p className="text-xs text-gray-500">Buyer-এর Pricing Rule শুধুমাত্র Proforma Invoice তৈরি时 ব্যবহার হবে</p>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Customer</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[180px]">
              <option value="">-- বাছুন --</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Buyer নাম</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[180px]" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Pricing Rule</label>
            <select value={pricingRule} onChange={(e) => setPricingRule(e.target.value as any)} className="rounded-lg border px-3 py-2 text-sm">
              <option value="manual">Manual</option>
              <option value="percentage">PI Price + %</option>
              <option value="rate_per_lbs">PI Rate/Lbs ভিত্তিক</option>
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
        </div>

        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-semibold text-gray-600 mb-2">PI Defaults</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">PI Thickness (mm)</label>
              <input type="number" step="0.001" value={piThicknessMm} onChange={(e) => setPiThicknessMm(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-28" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Adhesive Rate/Inch</label>
              <input type="number" step="0.001" value={adhesiveRatePerInch} onChange={(e) => setAdhesiveRatePerInch(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Print/Color/Pc Default</label>
              <input type="number" min="0" step="0.0001" value={printColorsDefault} onChange={(e) => setPrintColorsDefault(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" placeholder="0.20/color/pc" />
            </div>
            <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
              {loading ? "সেভ হচ্ছে..." : "যোগ করুন"}
            </button>
          </div>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}