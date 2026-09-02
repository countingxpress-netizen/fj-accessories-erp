"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AppUser = {
  id: string;
  full_name: string;
  designation: string | null;
  role: string;
  is_active: boolean | null;
};

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "full_no_edit", label: "Staff (Edit/Delete-এ Admin অনুমতি লাগবে)" },
];

const blank = { email: "", password: "", full_name: "", designation: "", role: "full_no_edit" };

export default function UserManager({ users, currentUserId }: { users: AppUser[]; currentUserId: string }) {
  const [rows, setRows] = useState(users);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [addError, setAddError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function updateRow(id: string, patch: Partial<AppUser>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function handleSave(u: AppUser) {
    setError("");
    setSavingId(u.id);
    const { error: err } = await supabase
      .from("app_users")
      .update({ full_name: u.full_name.trim(), designation: u.designation || null, role: u.role, is_active: u.is_active })
      .eq("id", u.id);
    setSavingId(null);
    if (err) { setError(err.message); return; }
    router.refresh();
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    if (!form.email.trim() || !form.password || !form.full_name.trim()) {
      setAddError("Email, Password, নাম আবশ্যক।");
      return;
    }
    setAdding(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await res.json();
    setAdding(false);
    if (!res.ok) { setAddError(body.error ?? "User তৈরি করা যায়নি।"); return; }
    setForm(blank);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Designation</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Active</th>
              <th className="px-4 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-4 py-2">
                  <input value={u.full_name} onChange={(e) => updateRow(u.id, { full_name: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" />
                </td>
                <td className="px-4 py-2">
                  <input value={u.designation ?? ""} onChange={(e) => updateRow(u.id, { designation: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" />
                </td>
                <td className="px-4 py-2">
                  <select
                    value={u.role}
                    disabled={u.id === currentUserId}
                    onChange={(e) => updateRow(u.id, { role: e.target.value })}
                    className="w-full rounded border px-2 py-1 text-sm disabled:bg-gray-100"
                  >
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={u.is_active ?? true}
                    disabled={u.id === currentUserId}
                    onChange={(e) => updateRow(u.id, { is_active: e.target.checked })}
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => handleSave(u)} disabled={savingId === u.id} className="text-blue-700 text-xs hover:underline disabled:opacity-40">
                    {savingId === u.id ? "সেভ হচ্ছে..." : "সেভ"}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-3 text-gray-400 italic">কোনো ইউজার নেই</td></tr>
            )}
          </tbody>
        </table>
        {error && <p className="px-4 py-2 text-xs text-red-600 border-t">{error}</p>}
      </div>

      <p className="text-xs text-gray-500">নতুন ইউজারের Email/Password দিয়ে দিন — সরাসরি লগইন তৈরি হয়ে যাবে।</p>
      <form onSubmit={handleAdd} className="rounded-xl border bg-white p-4 shadow-sm grid grid-cols-1 sm:grid-cols-6 gap-2 items-start">
        <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" className="rounded border px-2 py-1.5 text-sm sm:col-span-2" />
        <input type="text" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Password (min ৬ ক্যারেক্টার)" className="rounded border px-2 py-1.5 text-sm" />
        <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="নাম" className="rounded border px-2 py-1.5 text-sm" />
        <input value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} placeholder="Designation" className="rounded border px-2 py-1.5 text-sm" />
        <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="rounded border px-2 py-1.5 text-sm">
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <button type="submit" disabled={adding} className="rounded bg-gray-900 px-3 py-1.5 text-xs text-white disabled:opacity-40 sm:col-span-6 sm:w-fit">
          {adding ? "তৈরি হচ্ছে..." : "নতুন লগইন তৈরি করুন"}
        </button>
        {addError && <p className="text-xs text-red-600 sm:col-span-6">{addError}</p>}
      </form>
    </div>
  );
}
