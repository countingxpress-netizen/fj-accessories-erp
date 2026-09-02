"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { effectiveBasic, todayLocal, type SalaryRevision } from "@/lib/payroll";
import { formatDate } from "@/lib/formatDate";
import GuardedAction from "@/app/dashboard/GuardedAction";

type Employee = { id: string; name: string; employee_code: string; basic_salary: number };
type Revision = SalaryRevision & { id: string; employee_id: string; note: string | null };

export default function RevisionManager({
  employees, revisions,
}: { employees: Employee[]; revisions: Revision[] }) {
  const [employeeId, setEmployeeId] = useState("");
  const [effDate, setEffDate] = useState(todayLocal());
  const [basic, setBasic] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const today = todayLocal();

  const rowsByEmp = useMemo(() => {
    const m = new Map<string, Revision[]>();
    revisions.forEach((r) => {
      const l = m.get(r.employee_id) ?? [];
      l.push(r);
      m.set(r.employee_id, l);
    });
    for (const l of m.values()) l.sort((a, b) => (a.effective_date < b.effective_date ? 1 : -1));
    return m;
  }, [revisions]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!employeeId || !basic) { setError("Employee ও নতুন Basic দিন।"); return; }
    setLoading(true);
    const { error } = await supabase.from("salary_revisions").insert({
      employee_id: employeeId, effective_date: effDate,
      basic_salary: parseFloat(basic), note: note.trim() || null,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setBasic(""); setNote("");
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("এই revision মুছবেন?")) return;
    await supabase.from("salary_revisions").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleAdd} className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <h2 className="font-semibold text-gray-800">নতুন বেতন পরিবর্তন যোগ করুন</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Employee</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[200px]">
              <option value="">-- বাছুন --</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.employee_code} — {emp.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">কার্যকর তারিখ</label>
            <input type="date" value={effDate} onChange={(e) => setEffDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">নতুন Basic</label>
            <input type="number" step="1" value={basic} onChange={(e) => setBasic(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-gray-500 mb-1">নোট (ঐচ্ছিক)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
            {loading ? "সেভ হচ্ছে..." : "যোগ করুন"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-xs text-gray-400">Salary Sheet ঐ মাসে কার্যকর (effective_date ≤ মাস-শেষ) সর্বশেষ Basic নেবে। Revision না থাকলে Employee-এর মূল Basic।</p>
      </form>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Employee</th>
              <th className="px-4 py-2 text-right">এখনকার কার্যকর Basic</th>
              <th className="px-4 py-2">পরিবর্তনের ইতিহাস (নতুন → পুরনো)</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const hist = rowsByEmp.get(emp.id) ?? [];
              const eff = effectiveBasic(hist, today, emp.basic_salary);
              return (
                <tr key={emp.id} className="border-t align-top">
                  <td className="px-4 py-2 whitespace-nowrap">{emp.employee_code} — {emp.name}</td>
                  <td className="px-4 py-2 text-right font-medium">{eff.toFixed(2)}</td>
                  <td className="px-4 py-2">
                    {hist.length === 0 ? (
                      <span className="text-gray-400 italic">— (মূল Basic {emp.basic_salary.toFixed(2)})</span>
                    ) : (
                      <ul className="space-y-1">
                        {hist.map((r) => (
                          <li key={r.id} className="flex items-center gap-2">
                            <span className="tabular-nums">{formatDate(r.effective_date)}</span>
                            <span className="font-medium">{r.basic_salary.toFixed(2)}</span>
                            {r.note && <span className="text-gray-500">— {r.note}</span>}
                            <GuardedAction table="salary_revisions" recordId={r.id} recordLabel={`${emp.name} ${formatDate(r.effective_date)}`} action="delete"
                              onAllowed={() => handleDelete(r.id)}
                              className="text-xs text-red-600 hover:underline">মুছুন</GuardedAction>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
