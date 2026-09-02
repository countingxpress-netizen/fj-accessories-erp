"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/currentUser";
import { currentRate, type RateHistoryRow } from "@/lib/rateHistory";
import { usePermission } from "@/app/dashboard/PermissionProvider";

// Customer Price/Lbs বা Buyer PI Rate/Lbs-এর তারিখ-ভিত্তিক history দেখা ও এডিট।
// customers.price_per_lbs / buyers.rate_per_lbs_value কলামটা "আজকের কার্যকর দাম"-এর
// cached copy — এখানে row যোগ/মুছলে সেটা re-sync করা হয়।

type Kind = "customer" | "buyer";

const CONFIG: Record<Kind, { table: string; rateColumn: string; refColumn: string; rateLabel: string }> = {
  customer: { table: "customers", rateColumn: "price_per_lbs", refColumn: "customer_id", rateLabel: "Price/Lbs" },
  buyer: { table: "buyers", rateColumn: "rate_per_lbs_value", refColumn: "buyer_id", rateLabel: "Rate/Lbs" },
};

type Row = {
  id: string;
  rate: number;
  effective_from: string;
  note: string | null;
  created_at: string;
  creator: { full_name: string | null } | null;
};

export default function RateHistoryPanel({
  kind, refId, label,
}: { kind: Kind; refId: string; label: string }) {
  const cfg = CONFIG[kind];
  const supabase = createClient();
  const router = useRouter();
  const { allowed: canEdit } = usePermission(cfg.table, refId, "edit");

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [newDate, setNewDate] = useState(today);
  const [newRate, setNewRate] = useState("");
  const [newNote, setNewNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("rate_history")
      .select("id, rate, effective_from, note, created_at, creator:app_users!rate_history_created_by_fkey(full_name)")
      .eq(cfg.refColumn, refId)
      .order("effective_from", { ascending: false });
    if (error) setError(error.message);
    setRows((data ?? []) as any);
    setLoading(false);
  }, [supabase, cfg.refColumn, refId]);

  useEffect(() => { load(); }, [load]);

  // row বদলের পর master টেবিলের cached rate কলাম re-sync
  async function syncCachedRate(freshRows: RateHistoryRow[]) {
    const next = freshRows.length ? currentRate(freshRows, null) : null;
    await supabase.from(cfg.table).update({ [cfg.rateColumn]: next }).eq("id", refId);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const rate = parseFloat(newRate);
    if (!newDate || !Number.isFinite(rate)) { setError("তারিখ ও দাম দুটোই দিন।"); return; }

    setBusy(true);
    const createdBy = await getCurrentUserId(supabase);
    const { error } = await supabase.from("rate_history").insert({
      [cfg.refColumn]: refId, rate, effective_from: newDate, note: newNote.trim() || null, created_by: createdBy,
    });
    if (error) {
      setBusy(false);
      setError(error.message.includes("duplicate") ? "এই তারিখে ইতিমধ্যে একটা দাম আছে — আগে সেটা মুছুন বা অন্য তারিখ দিন।" : error.message);
      return;
    }

    const { data: fresh } = await supabase.from("rate_history").select("rate, effective_from").eq(cfg.refColumn, refId);
    await syncCachedRate((fresh ?? []) as RateHistoryRow[]);
    setNewRate(""); setNewNote(""); setNewDate(today);
    setBusy(false);
    await load();
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("এই দামের এন্ট্রি মুছে ফেলবেন?")) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.from("rate_history").delete().eq("id", id);
    if (error) { setBusy(false); setError(error.message); return; }

    const { data: fresh } = await supabase.from("rate_history").select("rate, effective_from").eq(cfg.refColumn, refId);
    await syncCachedRate((fresh ?? []) as RateHistoryRow[]);
    setBusy(false);
    await load();
    router.refresh();
  }

  const effectiveToday = rows.length ? currentRate(rows, null) : null;

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-gray-800">{label} — {cfg.rateLabel} History</h3>
        <span className="text-xs text-gray-500">
          আজকের কার্যকর: <strong>{effectiveToday ?? "—"}</strong>
        </span>
      </div>

      {canEdit ? (
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 rounded-md bg-gray-50 border p-2">
          <div className="flex flex-col">
            <label className="text-[11px] text-gray-500 mb-0.5">কার্যকর তারিখ থেকে</label>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="rounded border px-2 py-1 text-sm" />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] text-gray-500 mb-0.5">{cfg.rateLabel}</label>
            <input type="number" step="0.0001" value={newRate} onChange={(e) => setNewRate(e.target.value)} className="w-28 rounded border px-2 py-1 text-sm" />
          </div>
          <div className="flex flex-col flex-1 min-w-[160px]">
            <label className="text-[11px] text-gray-500 mb-0.5">মন্তব্য (ঐচ্ছিক)</label>
            <input value={newNote} onChange={(e) => setNewNote(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" placeholder="যেমন: রেট কমানো হলো" />
          </div>
          <button type="submit" disabled={busy} className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-40">
            {busy ? "..." : "যোগ করুন"}
          </button>
        </form>
      ) : (
        <p className="text-[11px] text-gray-400 italic">শুধু দেখা যাচ্ছে — দাম বদলাতে Edit অনুমতি লাগবে।</p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {loading ? (
        <p className="text-xs text-gray-400 italic">লোড হচ্ছে...</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-400 italic">কোনো দামের ইতিহাস নেই।</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-1 pr-4">কার্যকর তারিখ</th>
                <th className="py-1 pr-4">{cfg.rateLabel}</th>
                <th className="py-1 pr-4">মন্তব্য</th>
                <th className="py-1 pr-4">যোগ করেছেন</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-1.5 pr-4">{r.effective_from === "1900-01-01" ? "শুরু থেকে" : r.effective_from}</td>
                  <td className="py-1.5 pr-4 font-medium">{r.rate}</td>
                  <td className="py-1.5 pr-4 text-gray-500">{r.note || "-"}</td>
                  <td className="py-1.5 pr-4 text-gray-400 text-xs">
                    {r.creator?.full_name || "—"} · {r.created_at?.slice(0, 10)}
                  </td>
                  <td className="py-1.5 text-right">
                    {canEdit && (
                      <button onClick={() => handleDelete(r.id)} disabled={busy} className="text-xs text-red-600 hover:underline disabled:opacity-40">মুছুন</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Sales Invoice / PI তৈরির সময় প্রতিটি booking-এর <strong>Booking Date</strong> ধরে সেই দিনে কার্যকর দাম বসবে।
        আগে থেকে সেভ করা Invoice / PI বদলাবে না।
      </p>
    </div>
  );
}
