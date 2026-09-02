"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteSimpleRow } from "@/lib/simpleDelete";
import GuardedAction from "@/app/dashboard/GuardedAction";

type Supplier = { id: string; name: string; address: string | null; phone: string | null; email: string | null };

export default function SupplierRow({
  supplier, selected, onToggleSelect,
}: { supplier: Supplier; selected?: boolean; onToggleSelect?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(supplier.name);
  const [address, setAddress] = useState(supplier.address ?? "");
  const [phone, setPhone] = useState(supplier.phone ?? "");
  const [email, setEmail] = useState(supplier.email ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSave() {
    setLoading(true);
    const { error } = await supabase.from("suppliers").update({ name, address, phone, email }).eq("id", supplier.id);
    setLoading(false);
    if (error) { setError(error.message); return; }
    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm(`"${supplier.name}" মুছে ফেলতে চান?`)) return;
    setLoading(true);
    const result = await deleteSimpleRow(supabase, "suppliers", supplier.id);
    setLoading(false);
    if (!result.ok) { alert(result.error); return; }
    router.refresh();
  }

  const checkboxCell = (
    <td className="px-4 py-2">
      <input
        type="checkbox"
        checked={!!selected}
        onChange={onToggleSelect}
        aria-label={`Select supplier ${supplier.name}`}
      />
    </td>
  );

  if (editing) {
    return (
      <tr className="border-t bg-yellow-50">
        {checkboxCell}
        <td className="px-4 py-2"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2"><input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2"><input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2"><input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
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
      {checkboxCell}
      <td className="px-4 py-2 font-medium">
        <Link href={`/dashboard/purchase/suppliers/${supplier.id}`} className="hover:underline hover:text-blue-700">{supplier.name}</Link>
      </td>
      <td className="px-4 py-2 text-gray-500">{supplier.address || "-"}</td>
      <td className="px-4 py-2 text-gray-500">{supplier.phone || "-"}</td>
      <td className="px-4 py-2 text-gray-500">{supplier.email || "-"}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <GuardedAction table="suppliers" recordId={supplier.id} recordLabel={supplier.name} action="edit"
          onAllowed={() => setEditing(true)}
          className="rounded bg-blue-50 px-3 py-1 text-xs text-blue-700 mr-2 hover:bg-blue-100">Edit</GuardedAction>
        <GuardedAction table="suppliers" recordId={supplier.id} recordLabel={supplier.name} action="delete"
          onAllowed={handleDelete} disabled={loading}
          className="rounded bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100">Delete</GuardedAction>
      </td>
    </tr>
  );
}
