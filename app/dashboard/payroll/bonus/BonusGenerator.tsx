"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  effectiveBasic, monthsBetween, eidBonusDefault, FESTIVALS, todayLocal, type SalaryRevision,
} from "@/lib/payroll";
import { postPayrollAccrual, reversePayrollJv } from "@/lib/payrollJv";

type Employee = {
  id: string; name: string; employee_code: string;
  basic_salary: number; join_date: string | null;
};
type Revision = SalaryRevision & { employee_id: string };
type ExistingBonus = {
  id: string; employee_id: string; festival: string; year: number;
  bonus_amount: number; paid: boolean; accrual_voucher_id: string | null;
};

export default function BonusGenerator({
  employees, revisions, existing,
}: { employees: Employee[]; revisions: Revision[]; existing: ExistingBonus[] }) {
  const now = new Date();
  const [festival, setFestival] = useState<string>(FESTIVALS[0].value);
  const [year, setYear] = useState(now.getFullYear());
  const [bonusDate, setBonusDate] = useState(todayLocal());
  const [amountMap, setAmountMap] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<null | true>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const revByEmp = useMemo(() => {
    const m = new Map<string, SalaryRevision[]>();
    revisions.forEach((r) => {
      const l = m.get(r.employee_id) ?? [];
      l.push({ effective_date: r.effective_date, basic_salary: r.basic_salary });
      m.set(r.employee_id, l);
    });
    return m;
  }, [revisions]);

  const preview = useMemo(() => {
    return employees.map((emp) => {
      const exRow = existing.find(
        (b) => b.employee_id === emp.id && b.festival === festival && b.year === year
      );
      const exists = !!exRow;
      const basic = effectiveBasic(revByEmp.get(emp.id), bonusDate, emp.basic_salary);
      const tenure = emp.join_date ? monthsBetween(emp.join_date, bonusDate) : 12;
      const def = eidBonusDefault(basic, tenure);
      const base = exRow ? exRow.bonus_amount : def;
      const amount = amountMap[emp.id] !== undefined && amountMap[emp.id] !== ""
        ? parseFloat(amountMap[emp.id]) || 0 : base;
      return { emp, exists, exRow, basic, tenure, def, amount };
    });
  }, [employees, existing, festival, year, bonusDate, amountMap, revByEmp]);

  const toSave = preview.filter((p) => !p.exists);
  const toUpdate = preview.filter(
    (p) => p.exRow && !p.exRow.paid && Math.round(p.amount) !== Math.round(p.exRow.bonus_amount)
  );
  const grand = toSave.reduce((s, p) => s + p.amount, 0);

  function loadPreview(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setAmountMap({});
    setRows(true);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    const festLabel = FESTIVALS.find((f) => f.value === festival)?.label ?? festival;
    const bonusLabel = `${festLabel} ${year}`;
    try {
      for (const p of toSave) {
        const { data: inserted, error: insErr } = await supabase.from("bonus_sheet").insert({
          employee_id: p.emp.id, festival, year, bonus_date: bonusDate,
          basic: p.basic, tenure_months: Math.round(p.tenure * 100) / 100,
          bonus_amount: p.amount, paid: false,
        }).select("id").single();
        if (insErr) throw new Error(`${p.emp.name}: ${insErr.message}`);

        // Accrual JV — বোনাসের তারিখে খরচ বসে (Dr 5100 / Cr 2200)
        const accrualId = await postPayrollAccrual(supabase, {
          date: bonusDate,
          narration: `Bonus accrual — ${p.emp.employee_code} ${p.emp.name} — ${bonusLabel}`,
          memo: `Bonus ${bonusLabel}`,
          gross: p.amount,
          netSalary: p.amount,
        });
        if (accrualId && inserted) {
          await supabase.from("bonus_sheet").update({ accrual_voucher_id: accrualId }).eq("id", inserted.id);
        }
      }
      for (const p of toUpdate) {
        const { error: updErr } = await supabase.from("bonus_sheet")
          .update({ bonus_amount: p.amount })
          .eq("id", p.exRow!.id);
        if (updErr) throw new Error(`${p.emp.name}: ${updErr.message}`);

        // অঙ্ক বদলেছে — accrual JV নতুন অঙ্কে আবার বসাই
        await reversePayrollJv(supabase, p.exRow!.accrual_voucher_id);
        const accrualId = await postPayrollAccrual(supabase, {
          date: bonusDate,
          narration: `Bonus accrual — ${p.emp.employee_code} ${p.emp.name} — ${bonusLabel}`,
          memo: `Bonus ${bonusLabel}`,
          gross: p.amount,
          netSalary: p.amount,
        });
        await supabase.from("bonus_sheet")
          .update({ accrual_voucher_id: accrualId ?? null })
          .eq("id", p.exRow!.id);
      }
      setRows(null);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "সেভ করা যায়নি");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm space-y-4 mb-6">
      <form onSubmit={loadPreview} className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Festival</label>
          <select value={festival} onChange={(e) => setFestival(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            {FESTIVALS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Year</label>
          <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="rounded-lg border px-3 py-2 text-sm w-28" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Bonus Date</label>
          <input type="date" value={bonusDate} onChange={(e) => setBonusDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded-lg bg-gray-700 px-5 py-2 text-sm text-white">Preview</button>
      </form>

      <p className="text-xs text-gray-500">
        ডিফল্ট বোনাস = কার্যকর Basic × 50% × min(1, চাকরির মাস ÷ 12)। চাকরির মাস = join_date থেকে Bonus Date পর্যন্ত।
        প্রতি কর্মীর Eid Bonus অঙ্ক সব সময় এডিটেবল। আগে জেনারেট হওয়া (unpaid) কর্মীর অঙ্ক বদলালে সেভ করলে আপডেট হবে;
        পরিশোধিত হয়ে গেলে আর বদলানো যাবে না।
        <br />সেভ করলে প্রতি কর্মীর <strong>Accrual JV</strong> হয় (Dr Salary Expense 5100 / Cr Salary &amp; Bonus Payable 2100) Bonus Date-এ; &quot;Mark Paid&quot;-এ Cash/Bank থেকে পরিশোধের JV হয়।
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {rows && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-2 py-2">Employee</th>
                  <th className="px-2 py-2 text-right">Basic</th>
                  <th className="px-2 py-2 text-right">চাকরির মাস</th>
                  <th className="px-2 py-2 text-right">ডিফল্ট (50%)</th>
                  <th className="px-2 py-2 text-right">Eid Bonus</th>
                  <th className="px-2 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => {
                  const locked = !!p.exRow?.paid;
                  return (
                    <tr key={p.emp.id} className={`border-t ${locked ? "bg-gray-50 text-gray-400" : p.exists ? "bg-blue-50/40" : ""}`}>
                      <td className="px-2 py-1.5 whitespace-nowrap">{p.emp.employee_code} — {p.emp.name}</td>
                      <td className="px-2 py-1.5 text-right">{p.basic.toFixed(0)}</td>
                      <td className="px-2 py-1.5 text-right">{p.tenure.toFixed(1)}</td>
                      <td className="px-2 py-1.5 text-right">{p.def.toFixed(0)}</td>
                      <td className="px-2 py-1.5 text-right">
                        <input type="number" step="1" disabled={locked}
                          value={amountMap[p.emp.id] ?? String(Math.round(p.exRow ? p.exRow.bonus_amount : p.def))}
                          onChange={(e) => setAmountMap((m) => ({ ...m, [p.emp.id]: e.target.value }))}
                          className="w-24 rounded border px-1 py-0.5 text-right text-xs disabled:bg-gray-100" />
                      </td>
                      <td className="px-2 py-1.5 text-amber-600">
                        {locked
                          ? "পরিশোধিত — লক"
                          : p.exists
                            ? (Math.round(p.amount) !== Math.round(p.exRow!.bonus_amount) ? "আগেই জেনারেট — আপডেট হবে" : "আগেই জেনারেট")
                            : p.tenure < 12 ? `pro-rate ${Math.round(Math.min(1, p.tenure / 12) * 100)}%` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 font-medium">
                <tr>
                  <td className="px-2 py-2" colSpan={4}>নতুন জেনারেট: {toSave.length} জন · আপডেট: {toUpdate.length} জন</td>
                  <td className="px-2 py-2 text-right">{grand.toFixed(0)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <button onClick={handleSave} disabled={saving || (toSave.length === 0 && toUpdate.length === 0)}
            className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
            {saving ? "সেভ হচ্ছে..." : `Bonus Sheet সেভ করুন (নতুন ${toSave.length} · আপডেট ${toUpdate.length})`}
          </button>
        </div>
      )}
    </div>
  );
}
