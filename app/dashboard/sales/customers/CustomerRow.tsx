"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Customer = {
  id: string; name: string; address: string | null;
  phone: string | null; email: string | null; price_per_lbs: number | null;
  default_print_rate: number | null; default_adhesive_rate: number | null;
};

export default function CustomerRow({ customer }: { customer: Customer }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(customer.name);
  const [address, setAddress] = useState(customer.address ?? "");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [price, setPrice] = useState(customer.price_per_lbs != null ? String(customer.price_per_lbs) : "");
  const [printRate, setPrintRate] = useState(customer.default_print_rate != null ? String(customer.default_print_rate) : "0.20");
  const [adhesiveRate, setAdhesiveRate] = useState(customer.default_adhesive_rate != null ? String(customer.default_adhesive_rate) : "0.02");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSave() {
    setLoading(true);
    const { error } = await supabase
      .from("customers")
      .update({
        name, address, phone, email,
        price_per_lbs: price ? parseFloat(price) : null,
        default_print_rate: parseFloat(printRate) || 0.20,
        default_adhesive_rate: parseFloat(adhesiveRate) || 0.02,
      })
      .eq("id", customer.id);
    setLoading(false);
    if (error) { setError(error.message); return; }
    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm(`"${customer.name}" মুছে ফেলতে চান?`)) return;
    setLoading(true);
    const { error } = await supabase.from("customers").delete().eq("id", customer.id);
    setLoading(false);
    if (error) { alert("মুছে ফেলা যায়নি: " + error.message); return; }
    router.refresh();
  }

  if (editing) {
    return (
      <tr className="border-t bg-yellow-50">
        <td className="px-4 py-2"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2"><input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2"><input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2"><input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="w-24 rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2"><input type="number" step="0.01" value={printRate} onChange={(e) => setPrintRate(e.target.value)} className="w-20 rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2"><input type="number" step="0.001" value={adhesiveRate} onChange={(e) => setAdhesiveRate(e.target.value)} className="w-20 rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2 text-right whitespace-nowrap">
          <button onClick={handleSave} disabled={loading} className="rounded bg-green-600 px-3 py-1 text-xs text-white mr-1">সেভ</button>
          <button onClick={() => setEditing(false)} className="rounded bg-gray-200 px-3 py-1 text-xs text-gray-700">বাতিল</button>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2 font-medium">{customer.name}</td>
      <td className="px-4 py-2 text-gray-500">{customer.address || "-"}</td>
      <td className="px-4 py-2 text-gray-500">{customer.phone || "-"}</td>
      <td className="px-4 py-2 text-gray-500">{customer.price_per_lbs ?? "-"}</td>
      <td className="px-4 py-2 text-gray-500">{customer.default_print_rate ?? "0.20"}</td>
      <td className="px-4 py-2 text-gray-500">{customer.default_adhesive_rate ?? "0.02"}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <button onClick={() => setEditing(true)} className="rounded bg-blue-50 px-3 py-1 text-xs text-blue-700 mr-2 hover:bg-blue-100">Edit</button>
        <button onClick={handleDelete} disabled={loading} className="rounded bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100">Delete</button>
      </td>
    </tr>
  );
}