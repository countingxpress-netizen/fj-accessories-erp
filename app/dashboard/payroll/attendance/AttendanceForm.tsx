"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Employee = { id: string; name: string; employee_code: string };

export default function AttendanceForm({ employees }: { employees: Employee[] }) {
  const [attDate, setAttDate] = useState(new Date().toISOString().slice(0, 10));
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function setStatus(empId: string, status: string) {
    setStatusMap((prev) => ({ ...prev, [empId]: status }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    const rows = Object.entries(statusMap).filter(([, status]) => status);
    if (rows.length === 0) {
      setError("অন্তত একজন Employee-এর জন্য Status বাছুন।");
      return;
    }

    setLoading(true);

    // ঐ তারিখে আগের এন্ট্রি থাকলে মুছে নতুন করে বসান (duplicate এড়াতে)
    const empIds = rows.map(([id]) => id);
    await supabase.from("attendance").delete().eq("att_date", attDate).in("employee_id", empIds);

    const { error } = await supabase.from("attendance").insert(
      rows.map(([empId, status]) => ({ employee_id: empId, att_date: attDate, status }))
    );

    setLoading(false);
    if (error) { setError(error.message); return; }
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
      <div>
        <label className="block text-sm text-gray-600 mb-1">Date</label>
        <input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Status</th></tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} className="border-t">
                <td className="px-3 py-2">{emp.employee_code} — {emp.name}</td>
                <td className="px-3 py-2">
                  <select value={statusMap[emp.id] || ""} onChange={(e) => setStatus(emp.id, e.target.value)} className="rounded border px-2 py-1 text-sm">
                    <option value="">-- বাছুন --</option>
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="leave">Leave</option>
                    <option value="holiday">Holiday</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-700">✅ Attendance সেভ হয়েছে।</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Attendance সেভ করুন"}
      </button>
    </form>
  );
}