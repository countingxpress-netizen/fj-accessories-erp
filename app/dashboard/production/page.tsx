import Link from "next/link";

const links = [
  { label: "Production Orders", href: "/dashboard/production/orders", desc: "বুকিং থেকে প্রোডাকশন অর্ডার — কাঁচামাল অটো খরচ" },
  { label: "Finished Goods Receive", href: "/dashboard/production/finished-goods-receive", desc: "তৈরি হওয়া পণ্য স্টকে জমা" },
  { label: "Wastage", href: "/dashboard/production/wastage", desc: "উৎপাদনের সময় নষ্ট হওয়া মালামাল ট্র্যাক" },
];

export default function ProductionHomePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Production</h1>
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