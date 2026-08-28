import Link from "next/link";

const links = [
  { label: "Proforma Invoice", href: "/dashboard/lc-export/proforma", desc: "একক বা একাধিক বুকিং নিয়ে PI তৈরি" },
  { label: "Advising Banks", href: "/dashboard/lc-export/advising-banks", desc: "PI-র Advising Bank master — Branch/Address/SWIFT অটো" },
  { label: "LC Register", href: "/dashboard/lc-export/lc-register", desc: "Import ও Export LC-র তালিকা ও ট্র্যাকিং" },
  { label: "Export Invoice", href: "/dashboard/lc-export/export-invoice", desc: "রপ্তানি চালান, LC-এর সাথে যুক্ত" },
  { label: "Packing List", href: "/dashboard/lc-export/packing-list", desc: "কার্টন ও ওজনের বিবরণ" },
  { label: "EXP Tracking", href: "/dashboard/lc-export/exp-tracking", desc: "EXP জমা ও রিয়েলাইজেশন ট্র্যাক" },
  { label: "Bank Charges", href: "/dashboard/lc-export/bank-charges", desc: "LC সম্পর্কিত ব্যাংক খরচ, অটো Journal Voucher" },
];

export default function LCExportHomePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">LC &amp; Export</h1>
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