"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";

type RmRow = { id: string; name: string; qtyLbs: number; avgCost: number; accountCode: string };
type FgRow = { id: string; name: string; qtyPcs: number; avgCost: number };
type WipRow = { id: string; bookingNo: string; stage: string; consumedLbs: number; value: number };
type Account = { id: string; account_code: string; account_name: string };

const FG_CODE = "1210";
const WIP_CODE = "1220";
const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n: number) => Math.round(n * 100) / 100;

export default function OpeningInventoryForm({
  rmRows, fgRows, wipRows, balanceByCode, accountsByCode, equityAccounts,
}: {
  rmRows: RmRow[];
  fgRows: FgRow[];
  wipRows: WipRow[];
  balanceByCode: Record<string, number>;
  accountsByCode: Record<string, { id: string; name: string }>;
  equityAccounts: Account[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rmCost, setRmCost] = useState<Record<string, string>>({});
  const [fgCost, setFgCost] = useState<Record<string, string>>({});
  const [wipVal, setWipVal] = useState<Record<string, string>>({});
  const [equityId, setEquityId] = useState(
    equityAccounts.find((a) => a.account_code === "3900")?.id ?? equityAccounts[0]?.id ?? ""
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const rmCostOf = (r: RmRow) => (rmCost[r.id] !== undefined && rmCost[r.id] !== "" ? parseFloat(rmCost[r.id]) || 0 : r.avgCost);
  const fgCostOf = (r: FgRow) => (fgCost[r.id] !== undefined && fgCost[r.id] !== "" ? parseFloat(fgCost[r.id]) || 0 : r.avgCost);
  const wipValOf = (r: WipRow) => (wipVal[r.id] !== undefined && wipVal[r.id] !== "" ? parseFloat(wipVal[r.id]) || 0 : r.value);

  const plan = useMemo(() => {
    // target value per raw-material inventory account (grouped by account code)
    const rmTargetByCode: Record<string, number> = {};
    rmRows.forEach((r) => {
      rmTargetByCode[r.accountCode] = round2((rmTargetByCode[r.accountCode] ?? 0) + r.qtyLbs * rmCostOf(r));
    });

    const lines: { code: string; name: string; debit: number; credit: number; note: string }[] = [];

    // RM accounts — reconcile to target (current balance may be inflated by years of purchases)
    Object.entries(rmTargetByCode).forEach(([code, target]) => {
      const cur = balanceByCode[code] ?? 0;
      const delta = round2(target - cur);
      if (Math.abs(delta) < 0.005) return;
      lines.push({
        code, name: accountsByCode[code]?.name ?? code,
        debit: delta > 0 ? delta : 0, credit: delta < 0 ? -delta : 0,
        note: `target ${money(target)} − বর্তমান ${money(cur)}`,
      });
    });

    // Finished Goods Inventory (1210)
    const fgTarget = round2(fgRows.reduce((s, r) => s + r.qtyPcs * fgCostOf(r), 0));
    const fgCur = balanceByCode[FG_CODE] ?? 0;
    const fgDelta = round2(fgTarget - fgCur);
    if (Math.abs(fgDelta) >= 0.005) {
      lines.push({
        code: FG_CODE, name: accountsByCode[FG_CODE]?.name ?? "Finished Goods Inventory",
        debit: fgDelta > 0 ? fgDelta : 0, credit: fgDelta < 0 ? -fgDelta : 0,
        note: `target ${money(fgTarget)} − বর্তমান ${money(fgCur)}`,
      });
    }

    // WIP (1220) — শুধু পুরনো in-production order যোগ হয় (perpetual balance অক্ষত)
    const wipAdd = round2(wipRows.reduce((s, r) => s + wipValOf(r), 0));
    if (wipAdd >= 0.005) {
      lines.push({
        code: WIP_CODE, name: accountsByCode[WIP_CODE]?.name ?? "Work-in-Process Inventory",
        debit: wipAdd, credit: 0, note: `${wipRows.length}টি পুরনো production order`,
      });
    }

    const net = round2(lines.reduce((s, l) => s + l.debit - l.credit, 0));
    const equity = equityAccounts.find((a) => a.id === equityId);
    if (Math.abs(net) >= 0.005 && equity) {
      lines.push({
        code: equity.account_code, name: equity.account_name,
        debit: net < 0 ? -net : 0, credit: net > 0 ? net : 0,
        note: "balancing",
      });
    }

    const totalDr = round2(lines.reduce((s, l) => s + l.debit, 0));
    const totalCr = round2(lines.reduce((s, l) => s + l.credit, 0));
    return { lines, totalDr, totalCr, balanced: Math.abs(totalDr - totalCr) < 0.01 && totalDr > 0, rmTargetByCode, fgTarget, wipAdd };
  }, [rmRows, fgRows, wipRows, rmCost, fgCost, wipVal, equityId, balanceByCode, accountsByCode, equityAccounts]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!equityId) { setError("Balancing (equity) অ্যাকাউন্ট বাছুন।"); return; }
    if (!plan.balanced) { setError("কোনো পরিবর্তন নেই বা JV ব্যালেন্স হচ্ছে না।"); return; }

    // প্রতিটা line-এর account id দরকার
    const missing = plan.lines.find((l) => !accountsByCode[l.code]?.id);
    if (missing) { setError(`অ্যাকাউন্ট ${missing.code} খুঁজে পাওয়া যায়নি — migration চালানো হয়েছে কি?`); return; }

    setLoading(true);

    const voucherNo = await generateNextDocNo(supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", date);
    const { data: voucher, error: vErr } = await supabase
      .from("journal_vouchers")
      .insert({ voucher_no: voucherNo, voucher_date: date, narration: "Opening inventory reconciliation" })
      .select("id").single();
    if (vErr || !voucher) { setLoading(false); setError(vErr?.message ?? "Voucher তৈরি ব্যর্থ।"); return; }

    const { error: lErr } = await supabase.from("journal_entry_lines").insert(
      plan.lines.map((l) => ({
        voucher_id: voucher.id,
        account_id: accountsByCode[l.code].id,
        debit: l.debit, credit: l.credit,
        memo: "Opening inventory",
      }))
    );
    if (lErr) { setLoading(false); setError(lErr.message); return; }

    // খরচ / WIP cost বসিয়ে দিন যাতে পরের লেনদেন সঠিক দরে চলে
    for (const r of rmRows) {
      await supabase.from("raw_materials").update({ avg_cost_per_lbs: rmCostOf(r) }).eq("id", r.id);
    }
    for (const r of fgRows) {
      await supabase.from("finished_goods").update({ avg_cost_per_pc: fgCostOf(r) }).eq("id", r.id);
    }
    for (const r of wipRows) {
      const v = wipValOf(r);
      if (v > 0) await supabase.from("production_orders").update({ wip_cost: v }).eq("id", r.id);
    }

    setLoading(false);
    router.push("/dashboard/accounting/journal");
    router.refresh();
  }

  const sectionCard = "rounded-xl border bg-white shadow-sm overflow-hidden";
  const th = "px-3 py-2 text-left text-gray-600 font-medium text-xs";
  const td = "px-3 py-2 border-t";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Reconciliation Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Balancing Account (Equity)</label>
          <select value={equityId} onChange={(e) => setEquityId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[220px]">
            {equityAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
          </select>
        </div>
      </div>

      {/* Raw Materials */}
      <div className={sectionCard}>
        <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">Raw Material Stock</div>
        <table className="w-full text-sm">
          <thead><tr>
            <th className={th}>Material</th><th className={th + " text-right"}>Stock (Lbs)</th>
            <th className={th + " w-32"}>Cost / Lb</th><th className={th + " text-right"}>Value</th><th className={th}>Account</th>
          </tr></thead>
          <tbody>
            {rmRows.map((r) => (
              <tr key={r.id}>
                <td className={td}>{r.name}</td>
                <td className={td + " text-right num"}>{money(r.qtyLbs)}</td>
                <td className={td}>
                  <input type="number" step="0.0001" placeholder={String(r.avgCost)} value={rmCost[r.id] ?? ""} onChange={(e) => setRmCost((p) => ({ ...p, [r.id]: e.target.value }))} className="w-28 rounded border px-2 py-1 text-sm" />
                </td>
                <td className={td + " text-right num"}>{money(round2(r.qtyLbs * rmCostOf(r)))}</td>
                <td className={td + " text-gray-500"}>{r.accountCode}</td>
              </tr>
            ))}
            {rmRows.length === 0 && <tr><td className={td + " text-gray-400 italic"} colSpan={5}>স্টকে কোনো কাঁচামাল নেই</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Finished Goods */}
      <div className={sectionCard}>
        <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">Finished Goods Stock → 1210</div>
        <table className="w-full text-sm">
          <thead><tr>
            <th className={th}>Product</th><th className={th + " text-right"}>Stock (Pcs)</th>
            <th className={th + " w-32"}>Unit Cost</th><th className={th + " text-right"}>Value</th>
          </tr></thead>
          <tbody>
            {fgRows.map((r) => (
              <tr key={r.id}>
                <td className={td}>{r.name}</td>
                <td className={td + " text-right num"}>{money(r.qtyPcs)}</td>
                <td className={td}>
                  <input type="number" step="0.0001" placeholder={String(r.avgCost)} value={fgCost[r.id] ?? ""} onChange={(e) => setFgCost((p) => ({ ...p, [r.id]: e.target.value }))} className="w-28 rounded border px-2 py-1 text-sm" />
                </td>
                <td className={td + " text-right num"}>{money(round2(r.qtyPcs * fgCostOf(r)))}</td>
              </tr>
            ))}
            {fgRows.length === 0 && <tr><td className={td + " text-gray-400 italic"} colSpan={4}>স্টকে কোনো finished goods নেই</td></tr>}
          </tbody>
        </table>
      </div>

      {/* WIP */}
      {wipRows.length > 0 && (
        <div className={sectionCard}>
          <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">চলমান Production Order (পুরনো, perpetual-এর আগের) → 1220</div>
          <table className="w-full text-sm">
            <thead><tr>
              <th className={th}>Booking</th><th className={th}>Stage</th><th className={th + " text-right"}>Consumed (Lbs)</th><th className={th + " w-36"}>WIP Value</th>
            </tr></thead>
            <tbody>
              {wipRows.map((r) => (
                <tr key={r.id}>
                  <td className={td}>{r.bookingNo}</td>
                  <td className={td + " text-gray-500"}>{r.stage}</td>
                  <td className={td + " text-right num"}>{money(r.consumedLbs)}</td>
                  <td className={td}>
                    <input type="number" step="0.01" placeholder={String(r.value)} value={wipVal[r.id] ?? ""} onChange={(e) => setWipVal((p) => ({ ...p, [r.id]: e.target.value }))} className="w-32 rounded border px-2 py-1 text-sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* JV preview */}
      <div className={sectionCard}>
        <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">Journal Voucher (auto)</div>
        <table className="w-full text-sm">
          <thead><tr>
            <th className={th}>Account</th><th className={th + " text-right"}>Debit</th><th className={th + " text-right"}>Credit</th><th className={th}>Note</th>
          </tr></thead>
          <tbody>
            {plan.lines.map((l, i) => (
              <tr key={i}>
                <td className={td}>{l.code} — {l.name}</td>
                <td className={td + " text-right num"}>{l.debit ? money(l.debit) : ""}</td>
                <td className={td + " text-right num"}>{l.credit ? money(l.credit) : ""}</td>
                <td className={td + " text-gray-400 text-xs"}>{l.note}</td>
              </tr>
            ))}
            {plan.lines.length === 0 && <tr><td className={td + " text-gray-400 italic"} colSpan={4}>কোনো সমন্বয় দরকার নেই</td></tr>}
          </tbody>
          {plan.lines.length > 0 && (
            <tfoot className="bg-gray-50 border-t-2 font-semibold">
              <tr><td className={td}>Total</td><td className={td + " text-right num"}>{money(plan.totalDr)}</td><td className={td + " text-right num"}>{money(plan.totalCr)}</td><td /></tr>
            </tfoot>
          )}
        </table>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading || !plan.balanced} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Opening JV তৈরি করুন ও খরচ বসান"}
      </button>
    </form>
  );
}
