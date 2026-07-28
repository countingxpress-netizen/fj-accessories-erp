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
  const [bookingThicknessMm, setBookingThicknessMm] = useState("");
  const [adhesiveRatePerInch, setAdhesiveRatePerInch] = useState("");
  const [printColorsDefault, setPrintColorsDefault] = useState("");
  const [colorQuantity, setColorQuantity] = useState("");
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
      booking_thickness_mm: parseFloat(bookingThicknessMm) || null,
      adhesive_rate_per_inch: parseFloat(adhesiveRatePerInch) || null,
      print_colors_default: parseFloat(printColorsDefault) || null,
      color_quantity: parseInt(colorQuantity) || null,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setName(""); setPercentageValue("0"); setRateValue("0"); setPiThicknessMm(""); setBookingThicknessMm(""); setAdhesiveRatePerInch("0.02"); setPrintColorsDefault(""); setColorQuantity("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-3 shadow-sm mb-6">
      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500">Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded-lg border px-2 py-1 text-sm">
            <option value="">-- বাছুন --</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500">Buyer নাম</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border px-2 py-1 text-sm w-44" />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500">PI Pricing Rules Value</label>
          <select value={pricingRule} onChange={(e) => setPricingRule(e.target.value as any)} className="rounded-lg border px-2 py-1 text-sm">
            <option value="manual">Manual</option>
            <option value="percentage">PI Price + %</option>
            <option value="rate_per_lbs">PI Rate/Lbs</option>
          </select>
        </div>

        {pricingRule === "percentage" && (
          <div className="flex flex-col">
            <label className="text-xs text-gray-500">Value (%)</label>
            <input type="number" step="0.01" value={percentageValue} onChange={(e) => setPercentageValue(e.target.value)} className="rounded-lg border px-2 py-1 text-sm w-28" />
          </div>
        )}

        {pricingRule === "rate_per_lbs" && (
          <div className="flex flex-col">
            <label className="text-xs text-gray-500">Value (Rate/Lbs)</label>
            <input type="number" step="0.01" value={rateValue} onChange={(e) => setRateValue(e.target.value)} className="rounded-lg border px-2 py-1 text-sm w-32" />
          </div>
        )}

        <div className="flex flex-col">
          <label className="text-xs text-gray-500">PI Thickness (mm)</label>
          <input type="number" step="0.001" value={piThicknessMm} onChange={(e) => setPiThicknessMm(e.target.value)} className="rounded-lg border px-2 py-1 text-sm w-28" />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500">Booking Thickness (mm)</label>
          <input type="number" step="0.001" value={bookingThicknessMm} onChange={(e) => setBookingThicknessMm(e.target.value)} className="rounded-lg border px-2 py-1 text-sm w-28" />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500">Adhesive Rate/Inch</label>
          <input type="number" step="0.001" value={adhesiveRatePerInch || "0.02"} onChange={(e) => setAdhesiveRatePerInch(e.target.value)} className="rounded-lg border px-2 py-1 text-sm w-32" />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500">Print/Color/Pc</label>
          <input type="number" min="0" step="0.0001" value={printColorsDefault} onChange={(e) => setPrintColorsDefault(e.target.value)} className="rounded-lg border px-2 py-1 text-sm w-32" placeholder="0.20" />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500">Color Quantity</label>
          <input type="number" min="0" value={colorQuantity} onChange={(e) => setColorQuantity(e.target.value)} className="rounded-lg border px-2 py-1 text-sm w-28" />
        </div>

        <div className="flex items-end">
          <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
            {loading ? "সেভ হচ্ছে..." : "যোগ করুন"}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </form>
  );
}