"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AddEmployeeForm() {
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [basicSalary, setBasicSalary] = useState("");
  const [joinDate, setJoinDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { count } = await supabase.from("employees").select("*", { count: "exact", head: true });
    const employeeCode = `EMP-${String((count ?? 0) + 1).padStart(4, "0")}`;

    const { error } = await supabase.from("employees").insert({
      employee_code: employeeCode, name, designation, department,
      basic_salary: parseFloat(basicSalary) || 0, join_date: joinDate, is_active: true,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setName(""); setDesignation(""); setDepartment(""); setBasicSalary("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-4 shadow-sm mb-6 space-y-3">
      <h2 className="font-semibold text-gray-800">নতুন Employee যোগ করুন</h2>
      <div className="flex flex-wrap gap-3">
        <input placeholder="নাম" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 min-w-[160px] rounded-lg border px-3 py-2 text-sm" required />
        <input placeholder="Designation" value={designation} onChange={(e) => setDesignation(e.target.value)} className="w-40 rounded-lg border px-3 py-2 text-sm" />
        <input placeholder="Department" value={department} onChange={(e) => setDepartment(e.target.value)} className="w-40 rounded-lg border px-3 py-2 text-sm" />
        <input type="number" step="0.01" placeholder="Basic Salary" value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} className="w-36 rounded-lg border px-3 py-2 text-sm" required />
        <input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {loading ? "সেভ হচ্ছে..." : "যোগ করুন"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}