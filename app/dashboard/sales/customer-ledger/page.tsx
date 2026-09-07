import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";
import { loadGroupMap, foldNumbers, ledgerHref } from "@/lib/customerGroups";

export default async function CustomerLedgerListPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name").order("name");
  const { data: invoices } = await supabase
    .from("sales_invoices")
    .select("customer_id, sales_invoice_items(amount)");

  const totals: Record<string, number> = {};
  (invoices ?? []).forEach((inv: any) => {
    const amount = (inv.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
    totals[inv.customer_id] = (totals[inv.customer_id] ?? 0) + amount;
  });

  const gm = await loadGroupMap(supabase);
  const rows = foldNumbers(gm, customers ?? [], totals)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Customer Ledger</h1>
        <Link href="/dashboard/sales" className="text-sm text-gray-500 hover:underline">← Sales-এ ফিরুন</Link>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm divide-y">
        {rows.map((r) => (
          <Link key={r.key} href={ledgerHref(r)} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-50">
            <span className="font-medium text-gray-800">
              {r.name}
              {r.isGroup && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-500">গ্রুপ</span>}
            </span>
            <span className="text-gray-500">মোট বিক্রয়: {money(r.value)} →</span>
          </Link>
        ))}
        {rows.length === 0 && (
          <p className="px-4 py-3 text-gray-400 italic text-sm">কোনো Customer যোগ করা হয়নি</p>
        )}
      </div>
    </div>
  );
}
