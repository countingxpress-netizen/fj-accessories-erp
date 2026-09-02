"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import GuardedAction from "@/app/dashboard/GuardedAction";

type Bank = {
  id: string;
  bank_name: string; branch: string | null; account_number: string | null; account_name: string | null;
};

const blank = { bank_name: "", branch: "", account_number: "", account_name: "" };

export default function BanksManager({ banks }: { banks: Bank[] }) {
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.bank_name.trim()) { setError("Bank Name দিন।"); return; }
    setLoading(true);
    const { error: err } = await supabase.from("banks").insert({
      bank_name: form.bank_name.trim(),
      branch: form.branch || null,
      account_number: form.account_number || null,
      account_name: form.account_name || null,
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setForm(blank);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("এই ব্যাংক অ্যাকাউন্ট মুছে ফেলতে চান?")) return;
    const { error: err } = await supabase.from("banks").delete().eq("id", id);
    if (err) { alert("মুছে ফেলা যায়নি: " + err.message); return; }
    router.refresh();
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-600">
          <tr>
            <th className="px-4 py-2">Bank</th>
            <th className="px-4 py-2">Branch</th>
            <th className="px-4 py-2">A/C Name</th>
            <th className="px-4 py-2">A/C Number</th>
            <th className="px-4 py-2 w-16"></th>
          </tr>
        </thead>
        <tbody>
          {banks.map((b) => (
            <tr key={b.id} className="border-t">
              <td className="px-4 py-2 font-medium">{b.bank_name}</td>
              <td className="px-4 py-2 text-gray-600">{b.branch || "-"}</td>
              <td className="px-4 py-2 text-gray-600">{b.account_name || "-"}</td>
              <td className="px-4 py-2 text-gray-600">{b.account_number || "-"}</td>
              <td className="px-4 py-2 text-right">
                <GuardedAction table="banks" recordId={b.id} recordLabel={b.bank_name} action="delete"
                  onAllowed={() => handleDelete(b.id)}
                  className="text-red-600 text-xs hover:underline">মুছুন</GuardedAction>
              </td>
            </tr>
          ))}
          {banks.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-3 text-gray-400 italic">কোনো ব্যাংক অ্যাকাউন্ট নেই</td></tr>
          )}
        </tbody>
        <tfoot className="border-t bg-gray-50/60">
          <tr>
            <td className="px-4 py-2"><input value={form.bank_name} onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))} placeholder="Bank Name" className="w-full rounded border px-2 py-1 text-sm" /></td>
            <td className="px-4 py-2"><input value={form.branch} onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))} placeholder="Branch" className="w-full rounded border px-2 py-1 text-sm" /></td>
            <td className="px-4 py-2"><input value={form.account_name} onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))} placeholder="A/C Name" className="w-full rounded border px-2 py-1 text-sm" /></td>
            <td className="px-4 py-2"><input value={form.account_number} onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))} placeholder="A/C Number" className="w-full rounded border px-2 py-1 text-sm" /></td>
            <td className="px-4 py-2 text-right">
              <button onClick={handleAdd} disabled={loading} className="rounded bg-gray-900 px-3 py-1 text-xs text-white disabled:opacity-40">যোগ</button>
            </td>
          </tr>
          {error && <tr><td colSpan={5} className="px-4 pb-2 text-xs text-red-600">{error}</td></tr>}
        </tfoot>
      </table>
    </div>
  );
}
