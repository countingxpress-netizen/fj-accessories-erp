import Link from "next/link";

const links = [
  { label: "Suppliers", href: "/dashboard/purchase/suppliers", desc: "সাপ্লায়ারের তালিকা ও তথ্য পরিচালনা" },
  { label: "Purchase Entry", href: "/dashboard/purchase/entry", desc: "কাঁচামাল ক্রয় এন্ট্রি — স্টক ও অ্যাকাউন্টিং অটো আপডেট" },
  { label: "Supplier Ledger", href: "/dashboard/purchase/supplier-ledger", desc: "সাপ্লায়ার-ওয়াইজ পাওনার হিসাব" },
];

export default function PurchaseHomePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Purchase</h1>
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