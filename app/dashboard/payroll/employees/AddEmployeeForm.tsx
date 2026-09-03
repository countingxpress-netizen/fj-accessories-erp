"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { salaryTypeOf } from "@/lib/payroll";

const DEPARTMENTS = ["Blowing", "Cutting", "Printing", "Production", "Admin", "Accounts", "Marketing", "Commercial", "Management", "Security", "Transport", "Other"];

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

  const previewType = salaryTypeOf(department, designation);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // MAX-based (not count-based) — count breaks after deletions: reused codes hit the
    // employees_employee_code_key unique constraint and the insert fails.
    const { data: existing } = await supabase.from("employees").select("employee_code").ilike("employee_code", "EMP-%");
    let maxNum = 0;
    (existing ?? []).forEach((r) => {
      const m = (r.employee_code as string)?.match(/^EMP-(\d+)$/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    });
    const employeeCode = `EMP-${String(maxNum + 1).padStart(4, "0")}`;

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
        <input list="dept-list" placeholder="Department" value={department} onChange={(e) => setDepartment(e.target.value)} className="w-40 rounded-lg border px-3 py-2 text-sm" />
        <input type="number" step="0.01" placeholder="Basic Salary" value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} className="w-36 rounded-lg border px-3 py-2 text-sm" required />
        <input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {loading ? "সেভ হচ্ছে..." : "যোগ করুন"}
        </button>
      </div>
      <datalist id="dept-list">
        {DEPARTMENTS.map((d) => <option key={d} value={d} />)}
      </datalist>
      <p className="text-xs text-gray-500">
        Salary Type:{" "}
        {previewType === "production"
          ? <span className="text-indigo-700 font-medium">Production</span>
          : <span className="text-slate-600 font-medium">Fixed</span>}
        {" "}— Department / Designation থেকে অটো ঠিক হয় (Blowing / Cutting / Printing / Operator ⇒ Production, বাকি সব ⇒ Fixed)।
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
