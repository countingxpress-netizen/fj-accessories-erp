"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Employee = { id: string; name: string; employee_code: string };

export default function OvertimeForm({ employees }: { employees: Employee[] }) {
  const [employeeId, setEmployeeId] = useState("");
  const [otDate, setOtDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("");
  const [rate, setRate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!employeeId || !hours || !rate) { setError("সব ফিল্ড পূরণ করুন।"); return; }
    setLoading(true);
    const { error } = await supabase.from("overtime").insert({
      employee_id: employeeId, ot_date: otDate, hours: parseFloat(hours), rate_per_hour: parseFloat(rate),
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setHours(""); setRate("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-4 shadow-sm mb-6 space-y-3">
      <h2 className="font-semibold text-gray-800">Overtime এন্ট্রি</h2>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Employee</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[180px]">
            <option value="">-- বাছুন --</option>
            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.employee_code} — {emp.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Date</label>
          <input type="date" value={otDate} onChange={(e) => setOtDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Hours</label>
          <input type="number" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-28" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Rate/Hour</label>
          <input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-28" />
        </div>
        <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {loading ? "সেভ হচ্ছে..." : "সেভ করুন"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}