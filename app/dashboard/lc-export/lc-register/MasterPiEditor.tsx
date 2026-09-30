"use client";
// Master PI এডিটর — New LC ফর্মের "View & Edit" মডাল আর LC-র Master PI এডিট পেজ দুই
// জায়গাতেই একই কম্পোনেন্ট (controlled — state প্যারেন্টে থাকে)।
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { lineAmount, masterTotals, type MasterPiHeader, type MasterPiLine } from "@/lib/lcMasterPi";
import { money } from "@/lib/format";

type AdvisingBank = { id: string; name: string; branch: string | null; address: string | null; swift: string | null };

const inputCls = "w-full rounded border px-2 py-1 text-sm";

export default function MasterPiEditor({
  header, lines, onHeaderChange, onLinesChange, piNoById,
}: {
  header: MasterPiHeader;
  lines: MasterPiLine[];
  onHeaderChange: (h: MasterPiHeader) => void;
  onLinesChange: (l: MasterPiLine[]) => void;
  piNoById?: Record<string, string>;
}) {
  const totals = masterTotals(header, lines);
  const [advisingBanks, setAdvisingBanks] = useState<AdvisingBank[]>([]);
  useEffect(() => {
    createClient().from("advising_banks").select("id, name, branch, address, swift").order("name")
      .then(({ data }) => setAdvisingBanks((data ?? []) as AdvisingBank[]));
  }, []);
  const setH = <K extends keyof MasterPiHeader>(k: K, v: MasterPiHeader[K]) => onHeaderChange({ ...header, [k]: v });

  function setLine(idx: number, patch: Partial<MasterPiLine>) {
    onLinesChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function removeLine(idx: number) {
    onLinesChange(lines.filter((_, i) => i !== idx));
  }
  function moveLine(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= lines.length) return;
    const next = [...lines];
    [next[idx], next[j]] = [next[j], next[idx]];
    onLinesChange(next);
  }
  function addLine() {
    onLinesChange([...lines, {
      key: `new-${Date.now()}`, source_pi_id: null, source_pi_item_id: null,
      description: "", measurement: "", qty_pcs: 0, price_unit: 0, price_basis: "pcs",
    }]);
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-gray-500 mb-1">PI No লাইন (হেডারে যা ছাপা হবে)</label>
        <textarea value={header.pi_ref_text} onChange={(e) => setH("pi_ref_text", e.target.value)} rows={3} className={inputCls} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-600">BUYER / APPLICANT</p>
          <input value={header.buyer_name} onChange={(e) => setH("buyer_name", e.target.value)} placeholder="নাম" className={inputCls} />
          <textarea value={header.buyer_address} onChange={(e) => setH("buyer_address", e.target.value)} rows={3} placeholder="ঠিকানা" className={inputCls} />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-600">ADVISING BANK</p>
          {advisingBanks.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const b = advisingBanks.find((x) => x.id === e.target.value);
                if (b) onHeaderChange({
                  ...header, advising_bank_name: b.name, advising_bank_branch: b.branch ?? "",
                  advising_bank_address: b.address ?? "", advising_bank_swift: b.swift ?? "",
                });
              }}
              className="w-full rounded border px-2 py-1 text-sm text-gray-600"
            >
              <option value="">— Advising Banks তালিকা থেকে বসান —</option>
              {advisingBanks.map((b) => <option key={b.id} value={b.id}>{b.name}{b.branch ? ` — ${b.branch}` : ""}</option>)}
            </select>
          )}
          <input value={header.advising_bank_name} onChange={(e) => setH("advising_bank_name", e.target.value)} placeholder="Bank Name" className={inputCls} />
          <input value={header.advising_bank_branch} onChange={(e) => setH("advising_bank_branch", e.target.value)} placeholder="Branch" className={inputCls} />
          <input value={header.advising_bank_address} onChange={(e) => setH("advising_bank_address", e.target.value)} placeholder="Address" className={inputCls} />
          <input value={header.advising_bank_swift} onChange={(e) => setH("advising_bank_swift", e.target.value)} placeholder="SWIFT" className={inputCls} />
        </div>
      </div>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-600">
            <tr>
              <th className="px-2 py-1 w-8">Sl</th>
              <th className="px-2 py-1 min-w-[200px]">Description</th>
              <th className="px-2 py-1 min-w-[160px]">Measurement</th>
              <th className="px-2 py-1 w-28 text-right">Qty (Pcs)</th>
              <th className="px-2 py-1 w-20 text-right">Dzn</th>
              <th className="px-2 py-1 w-28 text-right">Price</th>
              <th className="px-2 py-1 w-20">Per</th>
              <th className="px-2 py-1 w-28 text-right">Amount</th>
              <th className="px-2 py-1 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => (
              <tr key={l.key} className="border-t align-top">
                <td className="px-2 py-1 text-gray-500">
                  {idx + 1}
                  {l.source_pi_id && piNoById?.[l.source_pi_id] && (
                    <div className="text-[10px] text-gray-400 whitespace-nowrap">{piNoById[l.source_pi_id]}</div>
                  )}
                </td>
                <td className="px-2 py-1">
                  <textarea value={l.description} onChange={(e) => setLine(idx, { description: e.target.value })} rows={1} className={inputCls} />
                </td>
                <td className="px-2 py-1">
                  <input value={l.measurement} onChange={(e) => setLine(idx, { measurement: e.target.value })} className={inputCls} />
                </td>
                <td className="px-2 py-1">
                  <input type="number" step="any" value={l.qty_pcs} onChange={(e) => setLine(idx, { qty_pcs: parseFloat(e.target.value) || 0 })} className={`${inputCls} text-right`} />
                </td>
                <td className="px-2 py-1 text-right text-gray-500">{money(l.qty_pcs / 12)}</td>
                <td className="px-2 py-1">
                  <input type="number" step="any" value={l.price_unit} onChange={(e) => setLine(idx, { price_unit: parseFloat(e.target.value) || 0 })} className={`${inputCls} text-right`} />
                </td>
                <td className="px-2 py-1">
                  <select value={l.price_basis} onChange={(e) => setLine(idx, { price_basis: e.target.value as "pcs" | "dzn" })} className="rounded border px-1 py-1 text-sm">
                    <option value="pcs">Pcs</option>
                    <option value="dzn">Dzn</option>
                  </select>
                </td>
                <td className="px-2 py-1 text-right">{money(lineAmount(l.qty_pcs, l.price_unit, l.price_basis))}</td>
                <td className="px-2 py-1 whitespace-nowrap text-right">
                  <button type="button" onClick={() => moveLine(idx, -1)} className="px-1 text-gray-500 hover:text-gray-900" title="উপরে">↑</button>
                  <button type="button" onClick={() => moveLine(idx, 1)} className="px-1 text-gray-500 hover:text-gray-900" title="নিচে">↓</button>
                  <button type="button" onClick={() => removeLine(idx)} className="px-1 text-red-600 hover:text-red-800" title="মুছুন">✕</button>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td colSpan={9} className="px-2 py-3 text-center text-gray-400 italic">কোনো লাইন নেই — PI বাছুন বা লাইন যোগ করুন</td></tr>
            )}
          </tbody>
          <tfoot className="border-t bg-gray-50 font-semibold">
            <tr>
              <td colSpan={3} className="px-2 py-1 text-right">Total =</td>
              <td className="px-2 py-1 text-right">{totals.totalPcs.toLocaleString("en-IN")}</td>
              <td className="px-2 py-1 text-right">{money(totals.totalDzn)}</td>
              <td colSpan={2}></td>
              <td className="px-2 py-1 text-right">{money(totals.subtotal)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <button type="button" onClick={addLine} className="rounded border px-3 py-1 text-sm text-gray-700 hover:bg-gray-50">+ লাইন যোগ</button>

      <div className="flex flex-wrap items-end justify-end gap-4 text-sm">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Discount %</label>
          <input type="number" step="any" value={header.discount_pct}
            onChange={(e) => setH("discount_pct", parseFloat(e.target.value) || 0)} className="w-24 rounded border px-2 py-1 text-right" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Discount Amount (খালি = অটো)</label>
          <input type="number" step="0.01"
            value={header.discount_amount ?? ""}
            placeholder={money(totals.subtotal * (header.discount_pct || 0) / 100)}
            onChange={(e) => setH("discount_amount", e.target.value === "" ? null : parseFloat(e.target.value))}
            className="w-32 rounded border px-2 py-1 text-right" />
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Discount: {money(totals.discount)}</p>
          <p className="text-base font-bold">Total = ${money(totals.total)}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">H.S Code</label>
          <input value={header.hs_code} onChange={(e) => setH("hs_code", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">BIN No. (PI-তে)</label>
          <input value={header.bin_no} onChange={(e) => setH("bin_no", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Beneficiary&apos;s BIN (ডকুমেন্টে)</label>
          <input value={header.beneficiary_bin} onChange={(e) => setH("beneficiary_bin", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Price দশমিক</label>
          <input type="number" min={2} max={6} value={header.price_decimals}
            onChange={(e) => setH("price_decimals", parseInt(e.target.value) || 4)} className={inputCls} />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Terms &amp; Conditions</label>
        <textarea value={header.terms_conditions} onChange={(e) => setH("terms_conditions", e.target.value)} rows={6} className={`${inputCls} font-mono text-xs`} />
      </div>
    </div>
  );
}
