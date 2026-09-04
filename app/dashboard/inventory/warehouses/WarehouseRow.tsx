"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import GuardedAction from "@/app/dashboard/GuardedAction";

type Warehouse = { id: string; name: string; location: string | null };

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function WarehouseRow({
  warehouse,
  stockLbs = 0,
  stockValue = 0,
}: {
  warehouse: Warehouse;
  stockLbs?: number;
  stockValue?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(warehouse.name);
  const [location, setLocation] = useState(warehouse.location ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSave() {
    setError("");
    setLoading(true);
    const { error } = await supabase
      .from("warehouses")
      .update({ name, location })
      .eq("id", warehouse.id);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    const confirmed = window.confirm(`"${warehouse.name}" মুছে ফেলতে চান?`);
    if (!confirmed) return;
    setLoading(true);
    const { error } = await supabase.from("warehouses").delete().eq("id", warehouse.id);
    setLoading(false);
    if (error) {
      alert("মুছে ফেলা যায়নি। সম্ভবত এই গুদামে স্টক এন্ট্রি আছে।\n\n" + error.message);
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
          <input value={location} onChange={(e) => setLocation(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" />
        </td>
        <td className="px-4 py-2 text-right text-gray-500">{fmt(stockLbs)}</td>
        <td className="px-4 py-2 text-right text-gray-500">৳{fmt(stockValue)}</td>
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
      <td className="px-4 py-2 font-medium">{warehouse.name}</td>
      <td className="px-4 py-2 text-gray-500">{warehouse.location || "-"}</td>
      <td className="px-4 py-2 text-right">{fmt(stockLbs)}</td>
      <td className="px-4 py-2 text-right">৳{fmt(stockValue)}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <GuardedAction table="warehouses" recordId={warehouse.id} recordLabel={warehouse.name} action="edit"
          onAllowed={() => setEditing(true)}
          className="rounded bg-blue-50 px-3 py-1 text-xs text-blue-700 mr-2 hover:bg-blue-100">Edit</GuardedAction>
        <GuardedAction table="warehouses" recordId={warehouse.id} recordLabel={warehouse.name} action="delete"
          onAllowed={handleDelete} disabled={loading}
          className="rounded bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50">Delete</GuardedAction>
      </td>
    </tr>
  );
}