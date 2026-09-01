import Link from "next/link";

const links = [
  { label: "Employees", href: "/dashboard/payroll/employees", desc: "কর্মচারীর তালিকা, বেসিক, join date; Type (Production/Fixed) অটো" },
  { label: "Salary Revisions", href: "/dashboard/payroll/salary-revisions", desc: "বেতন বৃদ্ধির ইতিহাস (কার্যকর তারিখসহ)" },
  { label: "Attendance", href: "/dashboard/payroll/attendance", desc: "দৈনিক উপস্থিতি + OT ঘণ্টা + মন্তব্য (এক গ্রিডে)" },
  { label: "Overtime রিপোর্ট", href: "/dashboard/payroll/overtime", desc: "মাসিক OT ঘণ্টা ও পরিমাণ (শুধু রিপোর্ট)" },
  { label: "Employee Advance", href: "/dashboard/payroll/advances", desc: "কর্মীকে অগ্রিম — অটো JV, বেতনে recover" },
  { label: "Salary Sheet", href: "/dashboard/payroll/salary-sheet", desc: "মাসিক বেতন Preview, জেনারেট ও পরিশোধ" },
  { label: "Eid Bonus", href: "/dashboard/payroll/bonus", desc: "দুই ঈদের বোনাস শিট (চাকরির বয়স অনুযায়ী প্রো-রেট)" },
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