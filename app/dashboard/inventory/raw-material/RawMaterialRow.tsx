"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import GuardedAction from "@/app/dashboard/GuardedAction";

type Account = { account_code: string; account_name: string };
type Material = {
  id: string;
  material_name: string;
  unit: string | null;
  reorder_level_lbs: number | null;
  inventory_account_code: string | null;
  avg_cost_per_lbs: number | null;
};

const UNITS = ["lbs", "kg", "bag"];
const num = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function RawMaterialRow({
  material,
  accounts,
  stockLbs = 0,
}: {
  material: Material;
  accounts: Account[];
  stockLbs?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(material.material_name);
  const [unit, setUnit] = useState(material.unit ?? "lbs");
  const [reorder, setReorder] = useState(String(material.reorder_level_lbs ?? 0));
  const [invAccount, setInvAccount] = useState(material.inventory_account_code ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const accountLabel = accounts.find((a) => a.account_code === material.inventory_account_code);

  async function handleSave() {
    setError("");
    if (!name.trim()) {
      setError("নাম দিন।");
      return;
    }
    setLoading(true);
    const { error } = await supabase
      .from("raw_materials")
      .update({
        material_name: name.trim(),
        unit,
        reorder_level_lbs: parseFloat(reorder) || 0,
        inventory_account_code: invAccount || null,
      })
      .eq("id", material.id);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm(`"${material.material_name}" মুছে ফেলতে চান?`)) return;
    setLoading(true);
    const { error } = await supabase.from("raw_materials").delete().eq("id", material.id);
    setLoading(false);
    if (error) {
      alert(
        "মুছে ফেলা যায়নি। এই material-এ স্টক, purchase বা production এন্ট্রি আছে বলে মনে হচ্ছে।\n\n" + error.message
      );
      return;
    }
    router.refresh();
  }

  if (editing) {
    return (
      <tr className="border-t bg-yellow-50">
        <td className="px-4 py-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" />
        </td>
        <td className="px-4 py-2">
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="rounded border px-2 py-1 text-sm">
            {UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-2 text-right">
          <input
            type="number"
            step="0.01"
            value={reorder}
            onChange={(e) => setReorder(e.target.value)}
            className="w-24 rounded border px-2 py-1 text-sm text-right"
          />
        </td>
        <td className="px-4 py-2">
          <select value={invAccount} onChange={(e) => setInvAccount(e.target.value)} className="rounded border px-2 py-1 text-sm">
            <option value="">— নেই —</option>
            {accounts.map((a) => (
              <option key={a.account_code} value={a.account_code}>
                {a.account_code} - {a.account_name}
              </option>
            ))}
          </select>
        </td>
        <td className="px-4 py-2 text-right text-gray-400">{num(Number(material.avg_cost_per_lbs) || 0)}</td>
        <td className="px-4 py-2 text-right whitespace-nowrap">
          <button onClick={handleSave} disabled={loading} className="rounded bg-green-600 px-3 py-1 text-xs text-white mr-1 disabled:opacity-50">সেভ</button>
          <button onClick={() => setEditing(false)} className="rounded bg-gray-200 px-3 py-1 text-xs text-gray-700">বাতিল</button>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2 font-medium">{material.material_name}</td>
      <td className="px-4 py-2 text-gray-500">{material.unit ?? "lbs"}</td>
      <td className="px-4 py-2 text-right text-gray-500">{num(Number(material.reorder_level_lbs) || 0)}</td>
      <td className="px-4 py-2 text-gray-500">
        {accountLabel ? `${accountLabel.account_code} - ${accountLabel.account_name}` : material.inventory_account_code || "—"}
      </td>
      <td className="px-4 py-2 text-right text-gray-500">{num(Number(material.avg_cost_per_lbs) || 0)}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <GuardedAction table="raw_materials" recordId={material.id} recordLabel={material.material_name} action="edit"
          onAllowed={() => setEditing(true)}
          className="rounded bg-blue-50 px-3 py-1 text-xs text-blue-700 mr-2 hover:bg-blue-100">Edit</GuardedAction>
        <GuardedAction table="raw_materials" recordId={material.id} recordLabel={material.material_name} action="delete"
          onAllowed={handleDelete} disabled={loading || stockLbs !== 0}
          className="rounded bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-40">Delete</GuardedAction>
      </td>
    </tr>
  );
}
