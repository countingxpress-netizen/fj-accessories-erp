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
  signature_url: string | null;
};

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "full_no_edit", label: "Staff (Edit/Delete-এ Admin অনুমতি লাগবে)" },
];

const blank = { email: "", password: "", full_name: "", designation: "", role: "full_no_edit" };

async function uploadSignature(id: string, file: File): Promise<{ ok: boolean; error?: string; signature_url?: string }> {
  const fd = new FormData();
  fd.append("id", id);
  fd.append("file", file);
  const res = await fetch("/api/admin/users/signature", { method: "POST", body: fd });
  const body = await res.json();
  if (!res.ok) return { ok: false, error: body.error ?? "Signature আপলোড ব্যর্থ হয়েছে।" };
  return { ok: true, signature_url: body.signature_url };
}

function SignatureCell({ user, onUploaded }: { user: AppUser; onUploaded: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setUploading(true);
    const result = await uploadSignature(user.id, file);
    setUploading(false);
    if (!result.ok) { setError(result.error ?? "ব্যর্থ হয়েছে।"); return; }
    if (result.signature_url) onUploaded(result.signature_url);
  }

  return (
    <div className="flex items-center gap-2">
      {user.signature_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.signature_url} alt="Signature" className="h-8 w-auto object-contain border rounded bg-white" />
      ) : (
        <span className="text-xs text-gray-400 italic">নেই</span>
      )}
      <label className="text-xs text-blue-700 hover:underline cursor-pointer">
        {uploading ? "আপলোড হচ্ছে..." : user.signature_url ? "বদলান" : "আপলোড"}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFile} disabled={uploading} />
      </label>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

function ResetPasswordAction({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleReset() {
    if (password.length < 6) { setError("অন্তত ৬ ক্যারেক্টার দিন।"); return; }
    setError("");
    setLoading(true);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, password }),
    });
    const body = await res.json();
    setLoading(false);
    if (!res.ok) { setError(body.error ?? "ব্যর্থ হয়েছে।"); return; }
    setDone(true);
    setPassword("");
  }

  if (!open) {
    return (
      <button onClick={() => { setOpen(true); setDone(false); }} className="text-gray-600 text-xs hover:underline">
        🔑 Reset Password
      </button>
    );
  }

  return (
    <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border bg-white shadow-lg p-3 text-left space-y-2">
      <p className="text-xs text-gray-600">নতুন Password দিন:</p>
      <input
        type="text"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="নতুন Password (min ৬ ক্যারেক্টার)"
        className="w-full rounded border px-2 py-1 text-sm"
      />
      <div className="flex items-center gap-2">
        <button onClick={handleReset} disabled={loading} className="rounded bg-gray-900 px-2 py-1 text-xs text-white disabled:opacity-40">
          {loading ? "সেট হচ্ছে..." : "সেট করুন"}
        </button>
        <button onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:underline">বাতিল</button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {done && <p className="text-xs text-green-700">✅ Password বদলে গেছে।</p>}
    </div>
  );
}

export default function UserManager({ users, currentUserId }: { users: AppUser[]; currentUserId: string }) {
  const [rows, setRows] = useState(users);
  const [form, setForm] = useState(blank);
  const [newSignatureFile, setNewSignatureFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [addError, setAddError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
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

  async function handleDelete(u: AppUser) {
    if (!window.confirm(`"${u.full_name}"-এর লগইন স্থায়ীভাবে মুছে ফেলতে চান? এটা ফেরত আসবে না।`)) return;
    setError("");
    setDeletingId(u.id);
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id }),
    });
    const body = await res.json();
    setDeletingId(null);
    if (!res.ok) { setError(body.error ?? "ডিলিট করা যায়নি।"); return; }
    setRows((rs) => rs.filter((r) => r.id !== u.id));
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
    if (!res.ok) {
      setAdding(false);
      setAddError(body.error ?? "User তৈরি করা যায়নি।");
      return;
    }

    if (newSignatureFile) {
      const sigResult = await uploadSignature(body.id, newSignatureFile);
      if (!sigResult.ok) {
        setAdding(false);
        setAddError(`ইউজার তৈরি হয়েছে, কিন্তু Signature আপলোড ব্যর্থ হয়েছে: ${sigResult.error} — নিচে তালিকায় পরে আপলোড করে দিন।`);
        setForm(blank);
        setNewSignatureFile(null);
        router.refresh();
        return;
      }
    }

    setAdding(false);
    setForm(blank);
    setNewSignatureFile(null);
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
              <th className="px-4 py-2">Signature</th>
              <th className="px-4 py-2 w-32"></th>
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
                <td className="px-4 py-2">
                  <SignatureCell user={u} onUploaded={(url) => updateRow(u.id, { signature_url: url })} />
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button onClick={() => handleSave(u)} disabled={savingId === u.id} className="text-blue-700 text-xs hover:underline disabled:opacity-40 mr-3">
                    {savingId === u.id ? "সেভ হচ্ছে..." : "সেভ"}
                  </button>
                  <span className="relative inline-block mr-3">
                    <button onClick={() => setOpenActionsId(openActionsId === u.id ? null : u.id)} className="text-gray-600 text-xs hover:underline">
                      🔑 Reset
                    </button>
                    {openActionsId === u.id && (
                      <div className="absolute right-0 z-20 mt-1">
                        <ResetPasswordAction userId={u.id} />
                      </div>
                    )}
                  </span>
                  <button
                    onClick={() => handleDelete(u)}
                    disabled={deletingId === u.id || u.id === currentUserId}
                    className="text-red-600 text-xs hover:underline disabled:opacity-30"
                  >
                    {deletingId === u.id ? "ডিলিট হচ্ছে..." : "ডিলিট"}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-3 text-gray-400 italic">কোনো ইউজার নেই</td></tr>
            )}
          </tbody>
        </table>
        {error && <p className="px-4 py-2 text-xs text-red-600 border-t">{error}</p>}
      </div>

      <p className="text-xs text-gray-500">নতুন ইউজারের Email/Password দিয়ে দিন — সরাসরি লগইন তৈরি হয়ে যাবে। Signature (ঐচ্ছিক) দিলে তার তৈরি করা Invoice/Challan/PI-তে এই Signature ছাপা হবে।</p>
      <form onSubmit={handleAdd} className="rounded-xl border bg-white p-4 shadow-sm grid grid-cols-1 sm:grid-cols-6 gap-2 items-start">
        <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" className="rounded border px-2 py-1.5 text-sm sm:col-span-2" />
        <input type="text" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Password (min ৬ ক্যারেক্টার)" className="rounded border px-2 py-1.5 text-sm" />
        <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="নাম" className="rounded border px-2 py-1.5 text-sm" />
        <input value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} placeholder="Designation" className="rounded border px-2 py-1.5 text-sm" />
        <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="rounded border px-2 py-1.5 text-sm">
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <div className="sm:col-span-3">
          <label className="block text-xs text-gray-500 mb-1">Signature (ঐচ্ছিক)</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setNewSignatureFile(e.target.files?.[0] ?? null)}
            className="w-full rounded border px-2 py-1.5 text-xs"
          />
        </div>
        <button type="submit" disabled={adding} className="rounded bg-gray-900 px-3 py-1.5 text-xs text-white disabled:opacity-40 sm:col-span-6 sm:w-fit">
          {adding ? "তৈরি হচ্ছে..." : "নতুন লগইন তৈরি করুন"}
        </button>
        {addError && <p className="text-xs text-red-600 sm:col-span-6">{addError}</p>}
      </form>
    </div>
  );
}
