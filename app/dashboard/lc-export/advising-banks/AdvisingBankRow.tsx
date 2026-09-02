"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteSimpleRow } from "@/lib/simpleDelete";
import GuardedAction from "@/app/dashboard/GuardedAction";

export default function AdvisingBankRow({ bank }: { bank: any }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(bank.name);
  const [branch, setBranch] = useState(bank.branch ?? "");
  const [address, setAddress] = useState(bank.address ?? "");
  const [swift, setSwift] = useState(bank.swift ?? "");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSave() {
    setLoading(true);
    await supabase.from("advising_banks").update({
      name, branch: branch || null, address: address || null, swift: swift || null,
    }).eq("id", bank.id);
    setLoading(false);
    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm(`"${bank.name}" মুছে ফেলতে চান?`)) return;
    setLoading(true);
    const result = await deleteSimpleRow(supabase, "advising_banks", bank.id);
    setLoading(false);
    if (!result.ok) { alert(result.error); return; }
    router.refresh();
  }

  if (editing) {
    return (
      <tr className="border-t bg-yellow-50">
        <td className="px-4 py-2"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2"><input value={branch} onChange={(e) => setBranch(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2"><input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2"><input value={swift} onChange={(e) => setSwift(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2 text-right whitespace-nowrap">
          <button onClick={handleSave} disabled={loading} className="rounded bg-green-600 px-3 py-1 text-xs text-white mr-1 disabled:opacity-50">সেভ</button>
          <button onClick={() => setEditing(false)} className="rounded bg-gray-200 px-3 py-1 text-xs text-gray-700">বাতিল</button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t hover:bg-gray-50">
      <td className="px-4 py-2 font-medium text-gray-800">{bank.name}</td>
      <td className="px-4 py-2 text-gray-600">{bank.branch || "-"}</td>
      <td className="px-4 py-2 text-gray-600">{bank.address || "-"}</td>
      <td className="px-4 py-2 text-gray-600">{bank.swift || "-"}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <GuardedAction table="advising_banks" recordId={bank.id} recordLabel={bank.name} action="edit"
          onAllowed={() => setEditing(true)}
          className="rounded bg-blue-50 px-3 py-1 text-xs text-blue-700 mr-2 hover:bg-blue-100">Edit</GuardedAction>
        <GuardedAction table="advising_banks" recordId={bank.id} recordLabel={bank.name} action="delete"
          onAllowed={handleDelete}
          className="rounded bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100">Delete</GuardedAction>
      </td>
    </tr>
  );
}
