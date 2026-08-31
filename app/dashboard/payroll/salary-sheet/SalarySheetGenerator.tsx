"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  computeSalary, salaryTypeOf, effectiveMonthStart,
  effectiveBasic, daysInMonth as daysInMonthOf, daysInclusive, proratedFixedBasic,
  monthRange, type SalaryRevision,
} from "@/lib/payroll";
import { postPayrollAccrual } from "@/lib/payrollJv";

type Employee = {
  id: string; name: string; employee_code: string;
  basic_salary: number; designation: string | null; department: string | null; join_date: string | null;
};

const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type PreviewRow = {
  emp: Employee;
  exists: boolean;
  notJoined: boolean;
  attendanceCount: number;
  absentDays: number;
  otHours: number;
  salaryType: "production" | "fixed";
  effBasic: number;          // salary revision অনুযায়ী এই মাসে কার্যকর basic
  joinedMidMonth: boolean;
  employedDays: number;      // এই মাসে join থেকে মাস-শেষ পর্যন্ত দিন
  monthDays: number;
  defaultBasic: number;      // Basic ইনপুটের ডিফল্ট (Fixed + মাঝ-মাসে join হলে prorated)
};

export default function SalarySheetGenerator({ employees }: { employees: Employee[] }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [basicMap, setBasicMap] = useState<Record<string, string>>({});
  const [advance, setAdvance] = useState<Record<string, string>>({});
  const [otherDed, setOtherDed] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const { start: monthStart, end: monthEnd } = monthRange(year, month);

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setRows(null);

    try {
      const { data: revs } = await supabase
        .from("salary_revisions").select("employee_id, effective_date, basic_salary");
      const revByEmp = new Map<string, SalaryRevision[]>();
      (revs ?? []).forEach((r: any) => {
        const list = revByEmp.get(r.employee_id) ?? [];
        list.push({ effective_date: r.effective_date, basic_salary: r.basic_salary });
        revByEmp.set(r.employee_id, list);
      });

      const monthDays = daysInMonthOf(year, month);
      const out: PreviewRow[] = [];
      const initBasic: Record<string, string> = {};

      for (const emp of employees) {
        const start = effectiveMonthStart(monthStart, emp.join_date);
        const notJoined = start > monthEnd;
        const joinedMidMonth = !!emp.join_date && emp.join_date > monthStart && !notJoined;
        const employedDays = notJoined ? 0 : daysInclusive(start, monthEnd);

        const { data: existing } = await supabase
          .from("salary_sheet").select("id").eq("employee_id", emp.id).eq("month", month).eq("year", year).maybeSingle();

        const { data: att } = await supabase
          .from("attendance").select("status")
          .eq("employee_id", emp.id).gte("att_date", start).lte("att_date", monthEnd);
        const attendanceCount = (att ?? []).length;
        const absentDays = (att ?? []).filter((a) => a.status === "absent").length;

        const { data: ot } = await supabase
          .from("overtime").select("hours")
          .eq("employee_id", emp.id).gte("ot_date", start).lte("ot_date", monthEnd);
        const otHours = (ot ?? []).reduce((s, o) => s + (o.hours || 0), 0);

        const salaryType = salaryTypeOf(emp.department, emp.designation);
        const effBasic = effectiveBasic(revByEmp.get(emp.id), monthEnd, emp.basic_salary);

        const defaultBasic = (salaryType === "fixed" && joinedMidMonth)
          ? proratedFixedBasic({ basic: effBasic, daysInMonth: monthDays, employedDays, absentDays })
          : effBasic;

        initBasic[emp.id] = String(defaultBasic);
        out.push({
          emp, exists: !!existing, notJoined, attendanceCount, absentDays, otHours, salaryType,
          effBasic, joinedMidMonth, employedDays, monthDays, defaultBasic,
        });
      }
      setBasicMap(initBasic);
      setAdvance({});
      setOtherDed({});
      setRows(out);
    } catch (err: any) {
      setError(err.message || "লোড করা যায়নি");
    } finally {
      setLoading(false);
    }
  }

  const computed = useMemo(() => {
    if (!rows) return [];
    return rows.map((r) => {
      const basic = parseFloat(basicMap[r.emp.id] ?? "") || r.defaultBasic;
      const res = computeSalary({
        salaryType: r.salaryType,
        basic,
        otHours: r.salaryType === "production" ? r.otHours : 0,
        absentDays: r.salaryType === "production" ? r.absentDays : 0,
        advance: parseFloat(advance[r.emp.id] || "0") || 0,
        otherDeduction: parseFloat(otherDed[r.emp.id] || "0") || 0,
      });
      const prorated = r.salaryType === "fixed" && r.joinedMidMonth;
      return { row: r, res, prorated };
    });
  }, [rows, basicMap, advance, otherDed]);

  const toSave = computed.filter((c) => !c.row.exists && !c.row.notJoined);
  const grandNet = toSave.reduce((s, c) => s + c.res.netSalary, 0);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const monthLabel = `${monthNames[month - 1]} ${year}`;
      for (const { row, res, prorated } of toSave) {
        const countedDays = prorated
          ? Math.max(0, Math.min(row.monthDays, row.employedDays - row.absentDays))
          : null;
        const { data: inserted, error: insErr } = await supabase.from("salary_sheet").insert({
          employee_id: row.emp.id, month, year, paid: false,
          basic: res.basic,
          salary_type: res.salaryType,
          ot_hours: res.otHours,
          absent_days: res.absentDays,
          absent_hours: res.absentHours,
          hourly_rate: Math.round(res.hourlyRate * 100) / 100,
          overtime_amount: res.overtimeAmount,
          absent_deduction: res.absentDeduction,
          net_adjustment: res.netAdjustment,
          advance: res.advance,
          other_deduction: res.otherDeduction,
          deductions: res.advance + res.otherDeduction,
          net_salary: res.netSalary,
          prorated,
          counted_days: countedDays,
          days_in_month: prorated ? row.monthDays : null,
        }).select("id").single();
        if (insErr) throw new Error(`${row.emp.name}: ${insErr.message}`);

        // Accrual JV — খরচ বেতনের মাসেই বসে (payment-এর দিনে নয়), মাস-শেষের তারিখে
        const accrualId = await postPayrollAccrual(supabase, {
          date: monthEnd,
          narration: `Salary accrual — ${row.emp.employee_code} ${row.emp.name} — ${monthLabel}`,
          amount: res.netSalary,
          memo: `Salary ${monthLabel}`,
        });
        if (accrualId && inserted) {
          await supabase.from("salary_sheet").update({ accrual_voucher_id: accrualId }).eq("id", inserted.id);
        }
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
      <form onSubmit={handlePreview} className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Month</label>
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="rounded-lg border px-3 py-2 text-sm">
            {monthNames.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Year</label>
          <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="rounded-lg border px-3 py-2 text-sm w-28" />
        </div>
        <button type="submit" disabled={loading} className="rounded-lg bg-gray-700 px-5 py-2 text-sm text-white disabled:opacity-40">
          {loading ? "লোড হচ্ছে..." : "Preview / হিসাব দেখুন"}
        </button>
      </form>

      <p className="text-xs text-gray-500">
        Basic আসে Salary Revision হিস্টরি থেকে (এই মাসে কার্যকর অঙ্ক) — Basic কলাম এডিটেবল।
        Fixed কর্মী মাঝ-মাসে join করলে Basic = কার্যকর basic ÷ মাসের মোট দিন × (join থেকে মাস-শেষ দিন − absent)।
        Production: রেট = Basic ÷ 26 ÷ 8 · Net adjustment = রেট × (OT ঘণ্টা − Absent ঘণ্টা)। join_date-এর আগের attendance / OT ধরা হয় না।
        <br />সেভ করলে প্রতি কর্মীর জন্য একটা <strong>Accrual JV</strong> হয় (Dr Salary Expense 5100 / Cr Salary &amp; Bonus Payable 2100), মাস-শেষের তারিখে — বেতন খরচ সঠিক মাসেই বসে। পরে &quot;Mark Paid&quot; চাপলে Cash/Bank থেকে পরিশোধের JV হয়।
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {rows && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-2 py-2">Employee</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2 text-right">Basic</th>
                  <th className="px-2 py-2 text-right">OT hrs</th>
                  <th className="px-2 py-2 text-right">Absent (d/hr)</th>
                  <th className="px-2 py-2 text-right">Net Adj.</th>
                  <th className="px-2 py-2 text-right">Advance</th>
                  <th className="px-2 py-2 text-right">Other Ded.</th>
                  <th className="px-2 py-2 text-right">Net Salary</th>
                  <th className="px-2 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {computed.map(({ row, res, prorated }) => {
                  const disabled = row.exists || row.notJoined;
                  return (
                    <tr key={row.emp.id} className={`border-t ${disabled ? "bg-gray-50 text-gray-400" : ""}`}>
                      <td className="px-2 py-1.5 whitespace-nowrap">{row.emp.employee_code} — {row.emp.name}</td>
                      <td className="px-2 py-1.5">{res.salaryType === "production" ? "Prod" : "Fixed"}</td>
                      <td className="px-2 py-1.5 text-right">
                        <input type="number" step="1" disabled={disabled}
                          value={basicMap[row.emp.id] ?? ""} onChange={(e) => setBasicMap((p) => ({ ...p, [row.emp.id]: e.target.value }))}
                          className="w-20 rounded border px-1 py-0.5 text-right text-xs disabled:bg-gray-100" />
                      </td>
                      <td className="px-2 py-1.5 text-right">{res.salaryType === "production" ? res.otHours : "—"}</td>
                      <td className="px-2 py-1.5 text-right">{res.salaryType === "production" ? `${res.absentDays} / ${res.absentHours}` : "—"}</td>
                      <td className={`px-2 py-1.5 text-right ${res.netAdjustment < 0 ? "text-red-600" : ""}`}>{res.salaryType === "production" ? res.netAdjustment.toFixed(0) : "—"}</td>
                      <td className="px-2 py-1.5 text-right">
                        <input type="number" step="0.01" placeholder="0" disabled={disabled}
                          value={advance[row.emp.id] || ""} onChange={(e) => setAdvance((p) => ({ ...p, [row.emp.id]: e.target.value }))}
                          className="w-16 rounded border px-1 py-0.5 text-right text-xs disabled:bg-gray-100" />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input type="number" step="0.01" placeholder="0" disabled={disabled}
                          value={otherDed[row.emp.id] || ""} onChange={(e) => setOtherDed((p) => ({ ...p, [row.emp.id]: e.target.value }))}
                          className="w-16 rounded border px-1 py-0.5 text-right text-xs disabled:bg-gray-100" />
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium">{res.netSalary.toFixed(0)}</td>
                      <td className="px-2 py-1.5 text-amber-600">
                        {row.notJoined ? "এ মাসে যোগ দেয়নি" : row.exists ? "আগেই জেনারেট" :
                          prorated ? `Prorated: ${Math.max(0, row.employedDays - row.absentDays)}/${row.monthDays} দিন` :
                          row.salaryType === "production" && row.attendanceCount === 0 ? "⚠ attendance নেই" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 font-medium">
                <tr>
                  <td className="px-2 py-2" colSpan={8}>নতুন জেনারেট হবে: {toSave.length} জন</td>
                  <td className="px-2 py-2 text-right">{grandNet.toFixed(0)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <button onClick={handleSave} disabled={saving || toSave.length === 0}
            className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
            {saving ? "সেভ হচ্ছে..." : `Salary Sheet সেভ করুন (${toSave.length} জন)`}
          </button>
          <p className="text-xs text-gray-400">যাদের এই মাসের sheet আগে থেকেই আছে বা যারা এ মাসে যোগ দেয়নি — তারা স্কিপ হবে।</p>
        </div>
      )}
    </div>
  );
}
