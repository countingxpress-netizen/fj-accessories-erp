"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function BuyerRow({ buyer }: { buyer: any }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(buyer.name);
  const [pricingRule, setPricingRule] = useState(buyer.pricing_rule ?? "manual");
  const [percentageValue, setPercentageValue] = useState(String(buyer.percentage_value ?? 0));
  const [rateValue, setRateValue] = useState(String(buyer.rate_per_lbs_value ?? 0));
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSave() {
    setLoading(true);
    await supabase.from("buyers").update({
      name, pricing_rule: pricingRule,
      percentage_value: parseFloat(percentageValue) || 0,
      rate_per_lbs_value: parseFloat(rateValue) || 0,
    }).eq("id", buyer.id);
    setLoading(false);
    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm(`"${buyer.name}" মুছে ফেলতে চান?`)) return;
    setLoading(true);
    const { error } = await supabase.from("buyers").delete().eq("id", buyer.id);
    setLoading(false);
    if (error) { alert("মুছে ফেলা যায়নি: " + error.message); return; }
    router.refresh();
  }

  if (editing) {
    return (
      <tr className="border-t bg-yellow-50">
        <td className="px-4 py-2"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2">
          <select value={pricingRule} onChange={(e) => setPricingRule(e.target.value)} className="rounded border px-2 py-1 text-sm">
            <option value="manual">Manual</option>
            <option value="percentage">% on Invoice</option>
            <option value="rate_per_lbs">Rate/Lbs</option>
          </select>
        </td>
        <td className="px-4 py-2">
          {pricingRule === "percentage" && <input type="number" step="0.01" value={percentageValue} onChange={(e) => setPercentageValue(e.target.value)} className="w-20 rounded border px-2 py-1 text-sm" />}
          {pricingRule === "rate_per_lbs" && <input type="number" step="0.01" value={rateValue} onChange={(e) => setRateValue(e.target.value)} className="w-20 rounded border px-2 py-1 text-sm" />}
        </td>
        <td className="px-4 py-2 text-right whitespace-nowrap">
          <button onClick={handleSave} disabled={loading} className="rounded bg-green-600 px-3 py-1 text-xs text-white mr-1">সেভ</button>
          <button onClick={() => setEditing(false)} className="rounded bg-gray-200 px-3 py-1 text-xs text-gray-700">বাতিল</button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2 font-medium">{buyer.name}</td>
      <td className="px-4 py-2 text-gray-500 capitalize">{(buyer.pricing_rule ?? "manual").replace(/_/g, " ")}</td>
      <td className="px-4 py-2 text-gray-500">
        {buyer.pricing_rule === "percentage" && `${buyer.percentage_value}%`}
        {buyer.pricing_rule === "rate_per_lbs" && buyer.rate_per_lbs_value}
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <button onClick={() => setEditing(true)} className="rounded bg-blue-50 px-3 py-1 text-xs text-blue-700 mr-2 hover:bg-blue-100">Edit</button>
        <button onClick={handleDelete} className="rounded bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100">Delete</button>
      </td>
    </tr>
  );
}