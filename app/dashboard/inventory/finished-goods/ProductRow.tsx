"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteSimpleRow } from "@/lib/simpleDelete";

type Product = {
  id: string;
  product_name: string;
  length_cm: number;
  width_cm: number;
  thickness: number;
};

export default function ProductRow({
  product, selected, onToggleSelect,
}: { product: Product; selected?: boolean; onToggleSelect?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.product_name);
  const [length, setLength] = useState(String(product.length_cm));
  const [width, setWidth] = useState(String(product.width_cm));
  const [thickness, setThickness] = useState(String(product.thickness));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSave() {
    setError("");
    setLoading(true);
    const { error } = await supabase
      .from("finished_goods")
      .update({
        product_name: name,
        length_cm: parseFloat(length),
        width_cm: parseFloat(width),
        thickness: parseFloat(thickness),
      })
      .eq("id", product.id);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    const confirmed = window.confirm(`"${product.product_name}" মুছে ফেলতে চান?`);
    if (!confirmed) return;
    setLoading(true);
    const result = await deleteSimpleRow(supabase, "finished_goods", product.id);
    setLoading(false);
    if (!result.ok) {
      alert("মুছে ফেলা যায়নি। সম্ভবত এই পণ্যে বুকিং/স্টক এন্ট্রি আছে।\n\n" + result.error);
      return;
    }
    router.refresh();
  }

  const checkboxCell = (
    <td className="px-4 py-2">
      <input
        type="checkbox"
        checked={!!selected}
        onChange={onToggleSelect}
        aria-label={`Select product ${product.product_name}`}
      />
    </td>
  );

  if (editing) {
    return (
      <tr className="border-t bg-yellow-50">
        {checkboxCell}
        <td className="px-4 py-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" />
        </td>
        <td className="px-4 py-2">
          <input type="number" step="0.001" value={length} onChange={(e) => setLength(e.target.value)} className="w-20 rounded border px-2 py-1 text-sm" />
        </td>
        <td className="px-4 py-2">
          <input type="number" step="0.001" value={width} onChange={(e) => setWidth(e.target.value)} className="w-20 rounded border px-2 py-1 text-sm" />
        </td>
        <td className="px-4 py-2">
          <input type="number" step="0.0001" value={thickness} onChange={(e) => setThickness(e.target.value)} className="w-24 rounded border px-2 py-1 text-sm" />
        </td>
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
      {checkboxCell}
      <td className="px-4 py-2 font-medium">
        <Link href={`/dashboard/inventory/finished-goods/${product.id}`} className="hover:underline hover:text-blue-700">
          {product.product_name}
        </Link>
      </td>
      <td className="px-4 py-2 text-gray-500">{product.length_cm}</td>
      <td className="px-4 py-2 text-gray-500">{product.width_cm}</td>
      <td className="px-4 py-2 text-gray-500">{product.thickness}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <button onClick={() => setEditing(true)} className="rounded bg-blue-50 px-3 py-1 text-xs text-blue-700 mr-2 hover:bg-blue-100">Edit</button>
        <button onClick={handleDelete} disabled={loading} className="rounded bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50">Delete</button>
      </td>
    </tr>
  );
}
