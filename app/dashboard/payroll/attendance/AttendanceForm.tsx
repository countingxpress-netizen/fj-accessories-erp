"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { hourlyRate, todayLocal } from "@/lib/payroll";

type Employee = {
  id: string; name: string; employee_code: string;
  designation: string | null; department: string | null; basic_salary: number;
};

const STATUSES = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "leave", label: "Leave" },
  { value: "holiday", label: "Holiday" },
];

export default function AttendanceForm({ employees }: { employees: Employee[] }) {
  const [attDate, setAttDate] = useState(todayLocal());
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [otMap, setOtMap] = useState<Record<string, string>>({});
  const [commentMap, setCommentMap] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // তারিখ বদলালে ঐ দিনের সেভ করা attendance + overtime লোড করে দেখাও
  useEffect(() => {
    let active = true;
    setSuccess(false);
    (async () => {
      const [{ data: att }, { data: ot }] = await Promise.all([
        supabase.from("attendance").select("employee_id, status, comments").eq("att_date", attDate),
        supabase.from("overtime").select("employee_id, hours").eq("ot_date", attDate),
      ]);
      if (!active) return;
      const sm: Record<string, string> = {};
      const cm: Record<string, string> = {};
      (att ?? []).forEach((r: any) => { sm[r.employee_id] = r.status; if (r.comments) cm[r.employee_id] = r.comments; });
      const om: Record<string, string> = {};
      (ot ?? []).forEach((r: any) => { om[r.employee_id] = String(r.hours); });
      setStatusMap(sm); setOtMap(om); setCommentMap(cm);
    })();
    return () => { active = false; };
  }, [attDate]);

  function markAll(status: string) {
    const m: Record<string, string> = {};
    employees.forEach((e) => { m[e.id] = status; });
    setStatusMap(m);
  }

  const tally = employees.reduce((acc, e) => {
    const s = statusMap[e.id];
    if (s) acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const totalOt = employees.reduce((s, e) => s + (parseFloat(otMap[e.id] || "0") || 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    // OT ঘণ্টা / comment থাকলে status না দিলে present ধরা হয়
    const effective = employees.map((emp) => {
      const ot = parseFloat(otMap[emp.id] || "0") || 0;
      const comment = (commentMap[emp.id] || "").trim();
      let status = statusMap[emp.id] || "";
      if (!status && (ot > 0 || comment)) status = "present";
      return { emp, status, ot, comment };
    });

    const attRows = effective.filter((r) => r.status);
    const otRows = effective.filter((r) => r.ot > 0);
    if (attRows.length === 0 && otRows.length === 0) {
      setError("অন্তত একজনের Status বা OT ঘণ্টা দিন।");
      return;
    }

    setLoading(true);
    const allIds = employees.map((emp) => emp.id);

    // এই তারিখের পুরনো এন্ট্রি মুছে নতুন করে বসাও (duplicate এড়াতে)
    await supabase.from("attendance").delete().eq("att_date", attDate).in("employee_id", allIds);
    await supabase.from("overtime").delete().eq("ot_date", attDate).in("employee_id", allIds);

    const { error: attErr } = await supabase.from("attendance").insert(
      attRows.map((r) => ({ employee_id: r.emp.id, att_date: attDate, status: r.status, comments: r.comment || null }))
    );
    if (attErr) { setLoading(false); setError(attErr.message); return; }

    if (otRows.length > 0) {
      const { error: otErr } = await supabase.from("overtime").insert(
        otRows.map((r) => ({
          employee_id: r.emp.id, ot_date: attDate, hours: r.ot,
          rate_per_hour: Math.round(hourlyRate(r.emp.basic_salary) * 100) / 100,
        }))
      );
      if (otErr) { setLoading(false); setError(otErr.message); return; }
    }

    setLoading(false);
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Date</label>
          <input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
        <button type="button" onClick={() => markAll("present")} className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">সব Present</button>
        <button type="button" onClick={() => markAll("holiday")} className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">সব Holiday</button>
        <div className="text-xs text-gray-500">
          Present {tally.present || 0} · Absent {tally.absent || 0} · Leave {tally.leave || 0} · Holiday {tally.holiday || 0} · OT {totalOt} ঘণ্টা
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Department</th>
              <th className="px-3 py-2">Designation</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">OT Hours</th>
              <th className="px-3 py-2">Comments</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">{emp.employee_code} — {emp.name}</td>
                <td className="px-3 py-2 text-gray-500">{emp.department || "-"}</td>
                <td className="px-3 py-2 text-gray-500">{emp.designation || "-"}</td>
                <td className="px-3 py-2">
                  <select value={statusMap[emp.id] || ""} onChange={(e) => setStatusMap((p) => ({ ...p, [emp.id]: e.target.value }))} className="rounded border px-2 py-1 text-sm">
                    <option value="">-- বাছুন --</option>
                    {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input type="number" step="0.5" min="0" placeholder="0"
                    value={otMap[emp.id] || ""} onChange={(e) => setOtMap((p) => ({ ...p, [emp.id]: e.target.value }))}
                    className="w-20 rounded border px-2 py-1 text-sm" />
                </td>
                <td className="px-3 py-2">
                  <input type="text" placeholder="—"
                    value={commentMap[emp.id] || ""} onChange={(e) => setCommentMap((p) => ({ ...p, [emp.id]: e.target.value }))}
                    className="w-full min-w-[140px] rounded border px-2 py-1 text-sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-700">✅ সেভ হয়েছে (Attendance + Overtime)।</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "সেভ করুন"}
      </button>
      <p className="text-xs text-gray-400">OT ঘণ্টা বা Comment দিলে Status না বাছলেও Present ধরা হবে। এই তারিখের আগের এন্ট্রি নতুন করে বসবে।</p>
    </form>
  );
}
