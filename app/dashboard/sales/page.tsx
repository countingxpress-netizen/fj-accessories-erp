import Link from "next/link";

const links = [
  { label: "Customers", href: "/dashboard/sales/customers", desc: "কাস্টমারের তালিকা ও দর (Price/Lbs) পরিচালনা" },
  { label: "Booking Received", href: "/dashboard/sales/bookings", desc: "নতুন বুকিং — প্রয়োজনীয় কাঁচামাল অটো ক্যালকুলেট" },
  { label: "Quotation", href: "/dashboard/sales/quotations", desc: "কোটেশন তৈরি ও পাঠানো" },
  { label: "Sales Invoice", href: "/dashboard/sales/invoices", desc: "বিক্রয় চালান, কাস্টমার-ওয়াইজ দর অনুযায়ী" },
  { label: "Delivery Challan", href: "/dashboard/sales/delivery-challan", desc: "ডেলিভারি চালান, আংশিক শিপমেন্ট সহ" },
  { label: "Customer Ledger", href: "/dashboard/sales/customer-ledger", desc: "কাস্টমার-ওয়াইজ পাওনার হিসাব" },
];

export default function SalesHomePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Sales</h1>
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