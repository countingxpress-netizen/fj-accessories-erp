"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function GarmentRow({ garment }: { garment: any }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(garment.name);
  const [address, setAddress] = useState(garment.address ?? "");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSave() {
    setLoading(true);
    await supabase.from("garments").update({ name, address }).eq("id", garment.id);
    setLoading(false);
    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm(`"${garment.name}" মুছে ফেলতে চান?`)) return;
    setLoading(true);
    const { error } = await supabase.from("garments").delete().eq("id", garment.id);
    setLoading(false);
    if (error) { alert("মুছে ফেলা যায়নি: " + error.message); return; }
    router.refresh();
  }

  if (editing) {
    return (
      <tr className="border-t bg-yellow-50">
        <td className="px-4 py-2"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2"><input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2 text-right whitespace-nowrap">
          <button onClick={handleSave} disabled={loading} className="rounded bg-green-600 px-3 py-1 text-xs text-white mr-1">সেভ</button>
          <button onClick={() => setEditing(false)} className="rounded bg-gray-200 px-3 py-1 text-xs text-gray-700">বাতিল</button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2 font-medium">{garment.name}</td>
      <td className="px-4 py-2 text-gray-500">{garment.address || "-"}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <Link href={`/dashboard/sales/garments/${garment.id}`} className="text-blue-700 hover:underline text-xs mr-2">View</Link>
        <button onClick={() => setEditing(true)} className="rounded bg-blue-50 px-3 py-1 text-xs text-blue-700 mr-2 hover:bg-blue-100">Edit</button>
        <button onClick={handleDelete} className="rounded bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100">Delete</button>
      </td>
    </tr>
  );
}