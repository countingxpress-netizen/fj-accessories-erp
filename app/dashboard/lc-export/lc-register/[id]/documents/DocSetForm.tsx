"use client";
// LC ডকুমেন্ট সেট (একটা শিপমেন্ট/ডেলিভারি) — Invoice/Challan No, তারিখ, ওজন, Mushok তথ্য
// আর Master PI-র প্রতিটা লাইনে এই সেটে কত Qty যাচ্ছে (partial shipment)।
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/currentUser";
import { money } from "@/lib/format";
import { lineAmount, setTotals, type MasterItemRow } from "@/lib/lcMasterPi";

type ExistingSet = {
  id: string; set_no: number; invoice_no: string | null; invoice_date: string | null;
  challan_no: string | null; delivery_date: string | null; truck_no: string | null;
  total_net_weight_kg: number | null; total_gross_weight_kg: number | null;
  mushok_no: string | null; mushok_date: string | null; mushok_time: string | null;
  lc_document_set_items: { master_item_id: string; qty_pcs: number }[];
};

export default function DocSetForm({
  lcId, master, masterItems, otherSetsQty, nextSetNo, existing,
}: {
  lcId: string;
  master: { discount_pct: number; discount_amount: number | null; price_decimals: number };
  masterItems: MasterItemRow[];
  otherSetsQty: Record<string, number>; // অন্য সেটগুলোতে ইতিমধ্যে যাওয়া Qty (লাইনপ্রতি)
  nextSetNo: number;
  existing?: ExistingSet;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const remaining = (m: MasterItemRow) => Math.max(0, Number(m.qty_pcs) - (otherSetsQty[m.id] ?? 0));

  const [invoiceNo, setInvoiceNo] = useState(existing?.invoice_no ?? "");
  const [invoiceDate, setInvoiceDate] = useState(existing?.invoice_date ?? today);
  const [challanNo, setChallanNo] = useState(existing?.challan_no ?? "");
  const [deliveryDate, setDeliveryDate] = useState(existing?.delivery_date ?? today);
  const [truckNo, setTruckNo] = useState(existing?.truck_no ?? "");
  const [netWeight, setNetWeight] = useState(existing?.total_net_weight_kg != null ? String(existing.total_net_weight_kg) : "");
  const [grossWeight, setGrossWeight] = useState(existing?.total_gross_weight_kg != null ? String(existing.total_gross_weight_kg) : "");
  const [mushokNo, setMushokNo] = useState(existing?.mushok_no ?? "");
  const [mushokDate, setMushokDate] = useState(existing?.mushok_date ?? today);
  const [mushokTime, setMushokTime] = useState(existing?.mushok_time ?? "");
  const [qtyById, setQtyById] = useState<Record<string, string>>(() => {
    if (existing) {
      const m = new Map(existing.lc_document_set_items.map((i) => [i.master_item_id, Number(i.qty_pcs)]));
      return Object.fromEntries(masterItems.map((it) => [it.id, String(m.get(it.id) ?? 0)]));
    }
    return Object.fromEntries(masterItems.map((it) => [it.id, String(remaining(it))]));
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const setItems = masterItems.map((m) => ({ master_item_id: m.id, qty_pcs: parseFloat(qtyById[m.id]) || 0 }));
  const totals = useMemo(() => setTotals(master, masterItems, setItems), [master, masterItems, qtyById]); // eslint-disable-line react-hooks/exhaustive-deps

  function fillAll(mode: "remaining" | "zero") {
    setQtyById(Object.fromEntries(masterItems.map((m) => [m.id, mode === "zero" ? "0" : String(remaining(m))])));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (totals.totalPcs <= 0) { setError("অন্তত একটা লাইনে Qty দিন।"); return; }
    const over = masterItems.find((m) => (parseFloat(qtyById[m.id]) || 0) > remaining(m) + 0.0001);
    if (over && !window.confirm(`Sl ${over.sl_no}-এ Master PI-র বাকি Qty-র চেয়ে বেশি দেওয়া হয়েছে। তবুও সেভ করবেন?`)) return;
    setSaving(true);

    const payload = {
      invoice_no: invoiceNo || null, invoice_date: invoiceDate || null,
      challan_no: challanNo || null, delivery_date: deliveryDate || null,
      truck_no: truckNo || null,
      total_net_weight_kg: netWeight === "" ? null : parseFloat(netWeight),
      total_gross_weight_kg: grossWeight === "" ? null : parseFloat(grossWeight),
      mushok_no: mushokNo || null, mushok_date: mushokDate || null, mushok_time: mushokTime || null,
    };

    let setId = existing?.id;
    if (setId) {
      const { error } = await supabase.from("lc_document_sets").update(payload).eq("id", setId);
      if (error) { setSaving(false); setError(error.message); return; }
      const { error: delErr } = await supabase.from("lc_document_set_items").delete().eq("set_id", setId);
      if (delErr) { setSaving(false); setError(delErr.message); return; }
    } else {
      const createdBy = await getCurrentUserId(supabase);
      const { data, error } = await supabase
        .from("lc_document_sets")
        .insert({ lc_id: lcId, set_no: nextSetNo, created_by: createdBy, ...payload })
        .select("id").single();
      if (error || !data) { setSaving(false); setError(error?.message ?? "সেভ ব্যর্থ"); return; }
      setId = data.id;
    }

    const rows = setItems.filter((s) => s.qty_pcs > 0).map((s) => ({ set_id: setId, ...s }));
    const { error: itemErr } = await supabase.from("lc_document_set_items").insert(rows);
    setSaving(false);
    if (itemErr) { setError(itemErr.message); return; }
    router.push(`/dashboard/lc-export/lc-register/${lcId}/documents/${setId}/print`);
    router.refresh();
  }

  const field = "rounded-lg border px-3 py-2 text-sm";
  return (
    <form onSubmit={handleSave} className="space-y-5 rounded-xl border bg-white p-5 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Invoice No</label>
          <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="যেমন AGL-236" className={`${field} w-full`} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Invoice Date</label>
          <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={`${field} w-full`} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">TR/DC No (Challan)</label>
          <input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} placeholder="খালি = Ref নম্বর (FNJ/…/…)" className={`${field} w-full`} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Delivery Date</label>
          <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={`${field} w-full`} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Truck No</label>
          <input value={truckNo} onChange={(e) => setTruckNo(e.target.value)} placeholder="DHAKA METRO CHA-11-5767" className={`${field} w-full`} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">মোট Net Weight (Kg)</label>
          <input type="number" step="any" value={netWeight} onChange={(e) => setNetWeight(e.target.value)} className={`${field} w-full`} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">মোট Gross Weight (Kg)</label>
          <input type="number" step="any" value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)} className={`${field} w-full`} />
        </div>
        <div className="text-[11px] text-gray-400 self-end">Packing List-এ লাইনপ্রতি ওজন = মোট ওজন × লাইনের Amount ÷ মোট Amount</div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Mushok চালান নং</label>
          <input value={mushokNo} onChange={(e) => setMushokNo(e.target.value)} placeholder="খালি = LC সিরিয়াল" className={`${field} w-full`} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Mushok ইস্যুর তারিখ</label>
          <input type="date" value={mushokDate} onChange={(e) => setMushokDate(e.target.value)} className={`${field} w-full`} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Mushok ইস্যুর সময়</label>
          <input value={mushokTime} onChange={(e) => setMushokTime(e.target.value)} placeholder="যেমন 10:00 AM" className={`${field} w-full`} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">এই সেটে কোন লাইনের কত Qty</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => fillAll("remaining")} className="rounded border px-2 py-1 text-xs hover:bg-gray-50">সব বাকি Qty বসান</button>
            <button type="button" onClick={() => fillAll("zero")} className="rounded border px-2 py-1 text-xs hover:bg-gray-50">সব 0</button>
          </div>
        </div>
        <div className="max-h-[480px] overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-left text-xs text-gray-600">
              <tr>
                <th className="px-2 py-1">Sl</th><th className="px-2 py-1">Description</th><th className="px-2 py-1">Measurement</th>
                <th className="px-2 py-1 text-right">Master Qty</th><th className="px-2 py-1 text-right">অন্য সেটে</th>
                <th className="px-2 py-1 text-right w-32">এই সেটে Qty</th><th className="px-2 py-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {masterItems.map((m) => {
                const q = parseFloat(qtyById[m.id]) || 0;
                return (
                  <tr key={m.id} className={`border-t ${q > remaining(m) + 0.0001 ? "bg-amber-50" : ""}`}>
                    <td className="px-2 py-1 text-gray-500">{m.sl_no}</td>
                    <td className="px-2 py-1 whitespace-pre-line text-xs">{m.description}</td>
                    <td className="px-2 py-1 text-xs">{m.measurement}</td>
                    <td className="px-2 py-1 text-right">{Number(m.qty_pcs).toLocaleString("en-IN")}</td>
                    <td className="px-2 py-1 text-right text-gray-500">{(otherSetsQty[m.id] ?? 0).toLocaleString("en-IN")}</td>
                    <td className="px-2 py-1">
                      <input type="number" step="any" value={qtyById[m.id] ?? ""}
                        onChange={(e) => setQtyById((p) => ({ ...p, [m.id]: e.target.value }))}
                        className="w-full rounded border px-2 py-1 text-right text-sm" />
                    </td>
                    <td className="px-2 py-1 text-right">{money(lineAmount(q, Number(m.price_unit), m.price_basis))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-right text-sm">
          {totals.totalPcs.toLocaleString("en-IN")} Pcs · Subtotal ${money(totals.subtotal)} − Discount ${money(totals.discount)} = <strong>${money(totals.total)}</strong>
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={saving} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {saving ? "সেভ হচ্ছে..." : existing ? "আপডেট করুন" : "সেট সেভ করে ডকুমেন্ট দেখুন"}
      </button>
    </form>
  );
}
