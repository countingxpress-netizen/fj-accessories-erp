// Dashboard widget — "Sales by Customer" (Production LBS সহ)।
// Dashboard-এর উপরের ফিল্টার বার (Date Range / Customer) অনুযায়ী সার্ভারেই হিসাব হয়ে সারি আসে —
// এই কম্পোনেন্ট শুধু টেবিল দেখায়, নিজের আলাদা ফিল্টার নেই।
// পূর্ণ প্রিন্টযোগ্য রিপোর্ট: /dashboard/reports/sales-by-customer
//
// হিসাবের নিয়ম lib/salesByCustomer.ts-এ (Reports পেজের সাথে শেয়ার করা)।

import Link from "next/link";
import { money, qty } from "@/lib/format";
import { ledgerHref } from "@/lib/customerGroups";
import type { SalesByCustomerRow } from "@/lib/salesByCustomer";

export default function SalesByCustomer({
  rows, periodText, reportHref, ledgerQuery,
}: {
  rows: SalesByCustomerRow[];
  periodText: string;
  reportHref: string;
  /** লেজার লিংকে একই তারিখ-সীমা পাঠাতে, যেমন "range=this_month" */
  ledgerQuery: string;
}) {
  const totAmt = rows.reduce((s, r) => s + r.amount, 0);
  const totLbs = rows.reduce((s, r) => s + r.lbs, 0);

  return (
    <div className="lg:col-span-2 rounded-xl border bg-white shadow-sm overflow-x-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h2 className="text-sm font-semibold uppercase text-gray-500">Sales by Customer</h2>
          <p className="text-[11px] text-gray-400">{periodText}</p>
        </div>
        <Link href={reportHref} className="text-xs text-blue-700 hover:underline">
          পূর্ণ রিপোর্ট / প্রিন্ট →
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2 text-right">Invoices</th>
              <th className="px-4 py-2 text-right">Production LBS</th>
              <th className="px-4 py-2 text-right">Sales Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-3 text-gray-400 italic">এই সময়সীমায় কোনো বিক্রি নেই</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.key} className="border-t">
                <td className="px-4 py-2">
                  <Link href={`${ledgerHref(r)}?${ledgerQuery}`} className="hover:underline hover:text-blue-700">{r.name}</Link>
                  {r.isGroup && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">গ্রুপ</span>}
                </td>
                <td className="px-4 py-2 text-right text-gray-500">{r.count}</td>
                <td className="px-4 py-2 text-right">{qty(r.lbs)}</td>
                <td className="px-4 py-2 text-right font-medium">{money(r.amount)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 font-semibold bg-gray-50">
              <tr>
                <td className="px-4 py-2 text-right" colSpan={2}>Total</td>
                <td className="px-4 py-2 text-right">{qty(totLbs)}</td>
                <td className="px-4 py-2 text-right">{money(totAmt)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
