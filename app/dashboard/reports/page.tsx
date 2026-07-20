import Link from "next/link";

const links = [
  { label: "Profit & Loss", href: "/dashboard/accounting/profit-loss", desc: "নির্দিষ্ট সময়ের আয়-ব্যয় ও নিট লাভ/ক্ষতি" },
  { label: "Balance Sheet", href: "/dashboard/accounting/balance-sheet", desc: "সম্পদ, দায় ও ইকুইটির অবস্থা" },
  { label: "Stock Report", href: "/dashboard/reports/stock-report", desc: "Raw Material ও Finished Goods-এর সার্বিক স্টক অবস্থা" },
  { label: "Production Report", href: "/dashboard/reports/production-report", desc: "কাঁচামাল খরচ, ওয়েস্টেজ ও উৎপাদন সারাংশ" },
  { label: "Cash Flow", href: "/dashboard/reports/cash-flow", desc: "নগদ ও ব্যাংক লেনদেনের প্রবাহ" },
  { label: "Outstanding Report", href: "/dashboard/reports/outstanding", desc: "কাস্টমার ও সাপ্লায়ারের বকেয়া/পাওনা" },
  { label: "Expense Report", href: "/dashboard/reports/expense-report", desc: "সময়ভিত্তিক খরচের বিশ্লেষণ" },
  { label: "Receivable Statement", href: "/dashboard/reports/receivable-statement", desc: "কাস্টমার-ওয়াইজ পাওনার বিস্তারিত" },
];

export default function ReportsHomePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Reports</h1>
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