"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";

export default function EmployeeRow({ employee }: { employee: any }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(employee.name);
  const [designation, setDesignation] = useState(employee.designation ?? "");
  const [department, setDepartment] = useState(employee.department ?? "");
  const [basicSalary, setBasicSalary] = useState(String(employee.basic_salary));
  const [isActive, setIsActive] = useState(employee.is_active);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSave() {
    setLoading(true);
    const { error } = await supabase.from("employees")
      .update({ name, designation, department, basic_salary: parseFloat(basicSalary), is_active: isActive })
      .eq("id", employee.id);
    setLoading(false);
    if (error) { setError(error.message); return; }
    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm(`"${employee.name}" মুছে ফেলতে চান?`)) return;
    setLoading(true);
    const { error } = await supabase.from("employees").delete().eq("id", employee.id);
    setLoading(false);
    if (error) { alert("মুছে ফেলা যায়নি (সম্ভবত Attendance/Salary রেকর্ড আছে): " + error.message); return; }
    router.refresh();
  }

  if (editing) {
    return (
      <tr className="border-t bg-yellow-50">
        <td className="px-4 py-2 text-gray-400">{employee.employee_code}</td>
        <td className="px-4 py-2"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2"><input value={designation} onChange={(e) => setDesignation(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2"><input value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2"><input type="number" step="0.01" value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} className="w-24 rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /></td>
        <td className="px-4 py-2 text-right whitespace-nowrap">
          <button onClick={handleSave} disabled={loading} className="rounded bg-green-600 px-3 py-1 text-xs text-white mr-1">সেভ</button>
          <button onClick={() => setEditing(false)} className="rounded bg-gray-200 px-3 py-1 text-xs text-gray-700">বাতিল</button>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2 text-gray-400">{employee.employee_code}</td>
      <td className="px-4 py-2 font-medium">{employee.name}</td>
      <td className="px-4 py-2 text-gray-500">{employee.designation || "-"}</td>
      <td className="px-4 py-2 text-gray-500">{employee.department || "-"}</td>
      <td className="px-4 py-2 text-right">{employee.basic_salary?.toFixed(2)}</td>
      <td className="px-4 py-2">
        {employee.is_active ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Active</span> : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Inactive</span>}
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <button onClick={() => setEditing(true)} className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 mr-2 hover:bg-blue-100">Edit</button>
        <button onClick={handleDelete} disabled={loading} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Delete</button>
      </td>
    </tr>
  );
}