"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePermission } from "@/app/dashboard/PermissionProvider";
import { measurementPriceKey, formatSize, type MeasurementPriceRow } from "@/lib/measurementPrice";

// বায়ারের মেজারমেন্ট-ভিত্তিক দাম লিস্ট (সাইজ + PI thickness → দাম)। এখানে হাতে যোগ/এডিট
// করা যায়; PI সেভ করলে সেই PI-র দামও এখানে অটো আপডেট হয় (source = 'pi')।

const TYPES = [
  { value: "simple", label: "Simple" },
  { value: "gusset", label: "Gusset" },
  { value: "adhesive", label: "Adhesive" },
  { value: "flap_gusset", label: "Flap + Gusset" },
  { value: "pillow", label: "Pillow" },
];

type Draft = {
  measurement_type: string; measurement_unit: string;
  length_val: string; width_val: string; flap_val: string; gusset_val: string; pillow_val: string;
  thickness_mm: string; price: string; currency: string; price_basis: string;
};

const EMPTY: Draft = {
  measurement_type: "simple", measurement_unit: "inch",
  length_val: "", width_val: "", flap_val: "", gusset_val: "", pillow_val: "",
  thickness_mm: "", price: "", currency: "USD", price_basis: "pcs",
};

function toDraft(r: MeasurementPriceRow): Draft {
  const s = (v: number | null) => (v == null ? "" : String(v));
  return {
    measurement_type: r.measurement_type, measurement_unit: r.measurement_unit,
    length_val: s(r.length_val), width_val: s(r.width_val), flap_val: s(r.flap_val),
    gusset_val: s(r.gusset_val), pillow_val: s(r.pillow_val), thickness_mm: s(r.thickness_mm),
    price: String(r.price), currency: r.currency, price_basis: r.price_basis,
  };
}

export default function MeasurementPricePanel({ buyerId, label }: { buyerId: string; label: string }) {
  const supabase = createClient();
  const { allowed: canEdit } = usePermission("buyers", buyerId, "edit");
  const [rows, setRows] = useState<MeasurementPriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("buyer_measurement_prices").select("*").eq("buyer_id", buyerId)
      .order("measurement_type").order("width_val").order("length_val");
    if (error) setError(error.message);
    setRows((data ?? []) as MeasurementPriceRow[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyerId]);

  useEffect(() => { load(); }, [load]);

  const t = draft.measurement_type;
  const needsFlap = t === "adhesive" || t === "flap_gusset";
  const needsGusset = t === "gusset" || t === "flap_gusset";
  const needsPillow = t === "pillow";

  async function handleSave() {
    setError("");
    const num = (v: string) => (v === "" ? null : parseFloat(v));
    const price = parseFloat(draft.price);
    if (!(parseFloat(draft.length_val) > 0) || !(parseFloat(draft.width_val) > 0)) { setError("L আর W দিন"); return; }
    if (!(price > 0)) { setError("দাম দিন"); return; }
    const size = {
      measurement_type: draft.measurement_type, measurement_unit: draft.measurement_unit,
      length_val: parseFloat(draft.length_val) || 0, width_val: parseFloat(draft.width_val) || 0,
      flap_val: needsFlap ? num(draft.flap_val) : null,
      gusset_val: needsGusset ? num(draft.gusset_val) : null,
      pillow_val: needsPillow ? num(draft.pillow_val) : null,
    };
    const thickness = num(draft.thickness_mm);
    const payload = {
      buyer_id: buyerId, match_key: measurementPriceKey(size, thickness), ...size,
      thickness_mm: thickness, price, currency: draft.currency, price_basis: draft.price_basis,
      source: "manual", updated_at: new Date().toISOString(),
    };
    setBusy(true);
    // এডিটে সাইজ বদলালে key বদলায় — পুরনো row মুছে নতুন key-তে upsert
    if (editingId) {
      const old = rows.find((r) => r.id === editingId);
      if (old && old.match_key !== payload.match_key) {
        await supabase.from("buyer_measurement_prices").delete().eq("id", editingId);
      }
    }
    const { error } = await supabase.from("buyer_measurement_prices").upsert(payload, { onConflict: "buyer_id,match_key" });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setDraft(EMPTY);
    setEditingId(null);
    load();
  }

  async function handleDelete(r: MeasurementPriceRow) {
    if (!window.confirm(`${formatSize(r)} (${r.thickness_mm ?? "-"} mm) — এই দাম মুছবেন?`)) return;
    setBusy(true);
    const { error } = await supabase.from("buyer_measurement_prices").delete().eq("id", r.id);
    setBusy(false);
    if (error) { setError(error.message); return; }
    load();
  }

  const input = (key: keyof Draft, placeholder: string, w = "w-16") => (
    <input
      type="number" step="0.0001" value={draft[key]} placeholder={placeholder}
      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
      className={`${w} rounded border px-2 py-1 text-xs`}
    />
  );

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label} — মেজারমেন্ট অনুযায়ী দাম (সাইজ + PI Thickness)</div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {loading ? (
        <div className="text-xs text-gray-400">লোড হচ্ছে…</div>
      ) : (
        <table className="text-xs">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="pr-4 py-1">Measurement</th>
              <th className="pr-4 py-1">PI Thick (mm)</th>
              <th className="pr-4 py-1 text-right">দাম</th>
              <th className="pr-4 py-1">উৎস</th>
              <th className="pr-4 py-1">আপডেট</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-t ${editingId === r.id ? "bg-yellow-50" : ""}`}>
                <td className="pr-4 py-1">{formatSize(r)}</td>
                <td className="pr-4 py-1">{r.thickness_mm ?? "-"}</td>
                <td className="pr-4 py-1 text-right font-medium">{r.price} {r.currency}/{r.price_basis === "dzn" ? "dzn" : "pc"}</td>
                <td className="pr-4 py-1 text-gray-500">{r.source === "pi" ? "PI থেকে" : "হাতে লেখা"}</td>
                <td className="pr-4 py-1 text-gray-500">{r.updated_at?.slice(0, 10) ?? "-"}</td>
                <td className="py-1 whitespace-nowrap">
                  {canEdit && (
                    <>
                      <button onClick={() => { setEditingId(r.id); setDraft(toDraft(r)); }} className="text-blue-600 hover:underline mr-2">Edit</button>
                      <button onClick={() => handleDelete(r)} disabled={busy} className="text-red-600 hover:underline">Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-1 text-gray-400 italic">এখনও কোনো দাম নেই — নিচে যোগ করুন, বা PI সেভ করলে অটো যোগ হবে</td></tr>
            )}
          </tbody>
        </table>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <select value={draft.measurement_type} onChange={(e) => setDraft((d) => ({ ...d, measurement_type: e.target.value }))} className="rounded border px-1 py-1 text-xs">
            {TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={draft.measurement_unit} onChange={(e) => setDraft((d) => ({ ...d, measurement_unit: e.target.value }))} className="rounded border px-1 py-1 text-xs">
            <option value="inch">inch</option>
            <option value="cm">cm</option>
          </select>
          {input("length_val", "L")}
          {input("width_val", "W")}
          {needsFlap && input("flap_val", "Flap")}
          {needsGusset && input("gusset_val", "Gusset")}
          {needsPillow && input("pillow_val", "Pillow")}
          {input("thickness_mm", "Thick mm", "w-20")}
          {input("price", "দাম", "w-20")}
          <select value={draft.currency} onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value }))} className="rounded border px-1 py-1 text-xs">
            <option value="USD">USD</option>
            <option value="BDT">BDT</option>
          </select>
          <select value={draft.price_basis} onChange={(e) => setDraft((d) => ({ ...d, price_basis: e.target.value }))} className="rounded border px-1 py-1 text-xs">
            <option value="pcs">Per Pc</option>
            <option value="dzn">Per Dzn</option>
          </select>
          <button onClick={handleSave} disabled={busy} className="rounded bg-green-600 px-3 py-1 text-xs text-white">
            {editingId ? "আপডেট" : "যোগ করুন"}
          </button>
          {editingId && (
            <button onClick={() => { setEditingId(null); setDraft(EMPTY); }} className="rounded bg-gray-200 px-3 py-1 text-xs text-gray-700">বাতিল</button>
          )}
        </div>
      )}
    </div>
  );
}
