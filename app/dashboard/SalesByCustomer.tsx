"use client";

// Dashboard widget — "Sales by Customer" (Production LBS সহ)।
// আগের "সাম্প্রতিক Sales Invoice" কার্ডের জায়গায় বসে।
// পূর্ণ প্রিন্টযোগ্য রিপোর্ট: /dashboard/reports/sales-by-customer
//
// হিসাবের নিয়ম lib/salesByCustomer.ts-এ (Reports পেজের সাথে শেয়ার করা)।

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { money, qty } from "@/lib/format";
import { type GroupMap, ledgerHref } from "@/lib/customerGroups";
import {
  aggregateSalesByCustomer,
  salesEntityOptions,
  resolveSalesRange,
  SALES_RANGE_OPTIONS,
  type SalesByCustomerRow,
} from "@/lib/salesByCustomer";

type Cust = { id: string; name: string };

export default function SalesByCustomer({ customers, groupMap }: { customers: Cust[]; groupMap: GroupMap }) {
  const supabase = useMemo(() => createClient(), []);
  const [range, setRange] = useState("this_month");
  const [cf, setCf] = useState("");
  const [ct, setCt] = useState("");
  const [entityKey, setEntityKey] = useState("");
  const [rows, setRows] = useState<SalesByCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const { from, to } = resolveSalesRange(range, cf, ct);
  const customIncomplete = range === "custom" && (!cf || !ct);

  useEffect(() => {
    if (customIncomplete) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr("");
      let q = supabase
        .from("sales_invoices")
        .select("customer_id, sales_invoice_items(amount, required_lbs, bookings(required_lbs))");
      if (from) q = q.gte("invoice_date", from);
      if (to) q = q.lte("invoice_date", to);
      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        setErr(error.message);
        setRows([]);
        setLoading(false);
        return;
      }
      const agg = aggregateSalesByCustomer((data as any) ?? [], customers, groupMap).sort(
        (a, b) => b.amount - a.amount,
      );
      setRows(agg);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, from, to, customIncomplete, customers, groupMap]);

  const entityOptions = useMemo(() => salesEntityOptions(customers, groupMap), [customers, groupMap]);

  const shown = entityKey ? rows.filter((r) => r.key === entityKey) : rows;
  const totAmt = shown.reduce((s, r) => s + r.amount, 0);
  const totLbs = shown.reduce((s, r) => s + r.lbs, 0);

  return (
    <div className="lg:col-span-2 rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="text-sm font-semibold uppercase text-gray-500">Sales by Customer</h2>
        <Link href="/dashboard/reports/sales-by-customer" className="text-xs text-blue-700 hover:underline">
          পূর্ণ রিপোর্ট / প্রিন্ট →
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-2 px-4 py-3 border-b bg-gray-50/60">
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Date Range</label>
          <select value={range} onChange={(e) => setRange(e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm">
            {SALES_RANGE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        {range === "custom" && (
          <>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">From</label>
              <input type="date" value={cf} onChange={(e) => setCf(e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">To</label>
              <input type="date" value={ct} onChange={(e) => setCt(e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm" />
            </div>
          </>
        )}
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Customer</label>
          <select
            value={entityKey}
            onChange={(e) => setEntityKey(e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-sm max-w-[200px]"
          >
            <option value="">সব Customer</option>
            {entityOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
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
            {loading && (
              <tr><td colSpan={4} className="px-4 py-3 text-gray-400 italic">লোড হচ্ছে…</td></tr>
            )}
            {!loading && customIncomplete && (
              <tr><td colSpan={4} className="px-4 py-3 text-gray-400 italic">From ও To তারিখ দিন</td></tr>
            )}
            {!loading && err && (
              <tr><td colSpan={4} className="px-4 py-3 text-red-600">{err}</td></tr>
            )}
            {!loading && !err && !customIncomplete && shown.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-3 text-gray-400 italic">এই সময়সীমায় কোনো বিক্রি নেই</td></tr>
            )}
            {!loading && !err && shown.map((r) => (
              <tr key={r.key} className="border-t">
                <td className="px-4 py-2">
                  <Link href={ledgerHref(r)} className="hover:underline hover:text-blue-700">{r.name}</Link>
                  {r.isGroup && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">গ্রুপ</span>}
                </td>
                <td className="px-4 py-2 text-right text-gray-500">{r.count}</td>
                <td className="px-4 py-2 text-right">{qty(r.lbs)}</td>
                <td className="px-4 py-2 text-right font-medium">{money(r.amount)}</td>
              </tr>
            ))}
          </tbody>
          {!loading && !err && shown.length > 0 && (
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
