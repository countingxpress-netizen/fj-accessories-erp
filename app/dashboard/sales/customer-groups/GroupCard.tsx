"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Customer = { id: string; name: string; code: string | null; group_id: string | null };
type Group = { id: string; name: string; note: string | null };

export default function GroupCard({
  group, members, assignable,
}: { group: Group; members: Customer[]; assignable: Customer[] }) {
  const router = useRouter();
  const supabase = createClient();

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(group.name);
  const [note, setNote] = useState(group.note ?? "");

  const [editingMembers, setEditingMembers] = useState(false);
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const [checked, setChecked] = useState<Set<string>>(memberIds);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function saveName() {
    if (!name.trim()) { setError("নাম খালি রাখা যাবে না।"); return; }
    setLoading(true); setError("");
    const { error } = await supabase.from("customer_groups")
      .update({ name: name.trim(), note: note.trim() || null }).eq("id", group.id);
    setLoading(false);
    if (error) { setError(error.message); return; }
    setEditingName(false);
    router.refresh();
  }

  async function deleteGroup() {
    if (!window.confirm(`"${group.name}" গ্রুপ মুছবেন? সদস্য কাস্টমারগুলো গ্রুপ-বিহীন হয়ে যাবে (লেনদেন হারাবে না)।`)) return;
    setLoading(true); setError("");
    const { error } = await supabase.from("customer_groups").delete().eq("id", group.id);
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.refresh();
  }

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveMembers() {
    setLoading(true); setError("");
    // যে কাস্টমার এখন টিক আছে কিন্তু আগে এই গ্রুপে ছিল না → এই গ্রুপে আনো।
    // যে কাস্টমার আগে এই গ্রুপে ছিল কিন্তু এখন টিক নেই → গ্রুপ-বিহীন করো।
    const toAdd = assignable.filter((c) => checked.has(c.id) && c.group_id !== group.id).map((c) => c.id);
    const toRemove = assignable.filter((c) => !checked.has(c.id) && c.group_id === group.id).map((c) => c.id);

    for (const id of toAdd) {
      const { error } = await supabase.from("customers").update({ group_id: group.id }).eq("id", id);
      if (error) { setLoading(false); setError(error.message); return; }
    }
    for (const id of toRemove) {
      const { error } = await supabase.from("customers").update({ group_id: null }).eq("id", id);
      if (error) { setLoading(false); setError(error.message); return; }
    }
    setLoading(false);
    setEditingMembers(false);
    router.refresh();
  }

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        {editingName ? (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">নাম</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-52 rounded-lg border px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">নোট</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} className="w-52 rounded-lg border px-3 py-1.5 text-sm" />
            </div>
            <button onClick={saveName} disabled={loading} className="rounded bg-green-600 px-3 py-1.5 text-xs text-white">সেভ</button>
            <button onClick={() => { setEditingName(false); setName(group.name); setNote(group.note ?? ""); }} className="rounded bg-gray-200 px-3 py-1.5 text-xs text-gray-700">বাতিল</button>
          </div>
        ) : (
          <div>
            <h3 className="font-semibold text-gray-800">
              {group.name}
              <span className="ml-2 text-xs font-normal text-gray-400">{members.length} কাস্টমার</span>
            </h3>
            {group.note && <p className="text-xs text-gray-500 mt-0.5">{group.note}</p>}
          </div>
        )}

        {!editingName && (
          <div className="flex gap-2 shrink-0">
            <Link href={`/dashboard/sales/customer-ledger/group/${group.id}`} className="rounded bg-gray-50 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100">গ্রুপ লেজার</Link>
            <button onClick={() => setEditingName(true)} className="rounded bg-blue-50 px-3 py-1 text-xs text-blue-700 hover:bg-blue-100">নাম Edit</button>
            <button onClick={deleteGroup} disabled={loading} className="rounded bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100">Delete</button>
          </div>
        )}
      </div>

      <div className="mt-3">
        {!editingMembers ? (
          <div className="flex items-center gap-2 flex-wrap text-sm text-gray-600">
            {members.length === 0
              ? <span className="text-gray-400 italic">কোনো সদস্য নেই</span>
              : members.map((m) => (
                  <span key={m.id} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs">
                    {m.name}{m.code ? ` (${m.code})` : ""}
                  </span>
                ))}
            <button onClick={() => { setChecked(new Set(members.map((m) => m.id))); setEditingMembers(true); }} className="text-xs text-blue-600 hover:underline ml-1">সদস্য সম্পাদনা</button>
          </div>
        ) : (
          <div className="rounded-lg border bg-gray-50 p-3">
            <p className="text-xs text-gray-500 mb-2">এই গ্রুপে যে কাস্টমারগুলো রাখতে চান টিক দিন। অন্য গ্রুপে থাকা কাস্টমার টিক দিলে সে এই গ্রুপে চলে আসবে।</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 max-h-64 overflow-y-auto">
              {assignable.map((c) => {
                const otherGroup = c.group_id && c.group_id !== group.id;
                return (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggle(c.id)} />
                    <span className={otherGroup ? "text-amber-700" : ""}>
                      {c.name}{c.code ? ` (${c.code})` : ""}
                      {otherGroup && <span className="text-[11px] text-amber-600"> · অন্য গ্রুপে</span>}
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={saveMembers} disabled={loading} className="rounded bg-green-600 px-4 py-1.5 text-xs text-white disabled:opacity-50">
                {loading ? "সেভ হচ্ছে..." : "সেভ"}
              </button>
              <button onClick={() => setEditingMembers(false)} className="rounded bg-gray-200 px-4 py-1.5 text-xs text-gray-700">বাতিল</button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
