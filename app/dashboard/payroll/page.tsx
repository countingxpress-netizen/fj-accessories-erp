import Link from "next/link";

const links = [
  { label: "Employees", href: "/dashboard/payroll/employees", desc: "কর্মচারীর তালিকা ও তথ্য পরিচালনা" },
  { label: "Attendance", href: "/dashboard/payroll/attendance", desc: "প্রতিদিনের উপস্থিতি রেকর্ড" },
  { label: "Overtime", href: "/dashboard/payroll/overtime", desc: "ওভারটাইম ঘণ্টা ও হার এন্ট্রি" },
  { label: "Salary Sheet", href: "/dashboard/payroll/salary-sheet", desc: "মাসিক বেতন জেনারেট ও পরিশোধ" },
];

export default function PayrollHomePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Payroll</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
            <h2 className="font-semibold text-gray-800 mb-1">{l.label}</h2>
            <p className="text-sm text-gray-500">{l.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}