import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money, qty } from "@/lib/format";
import { formatDate } from "@/lib/formatDate";
import { MATERIAL_EXPENSE_SOURCE } from "@/lib/materialExpense";
import MaterialExpenseForm from "./MaterialExpenseForm";
import DeleteMaterialExpense from "./DeleteMaterialExpense";

// Material খরচ — কাঁচামাল (যেমন Adhesive) খরচ হিসেবে লেখা: স্টক কমে + Expense JV
export default async function MaterialExpensePage() {
  const supabase = await createClient();

  const [{ data: materials }, { data: warehouses }, { data: stock }, { data: expenseAccounts }] = await Promise.all([
    supabase.from("raw_materials").select("id, material_name, unit, avg_cost_per_lbs, inventory_account_code").order("material_name"),
    supabase.from("warehouses").select("id, name").order("name"),
    supabase.from("raw_material_stock").select("material_id, warehouse_id, quantity_lbs"),
    supabase.from("chart_of_accounts").select("id, account_code, account_name").eq("account_type", "expense").order("account_code"),
  ]);

  const stockMap: Record<string, Record<string, number>> = {};
  (stock ?? []).forEach((s: any) => {
    (stockMap[s.material_id] ||= {})[s.warehouse_id] = Number(s.quantity_lbs || 0);
  });

  // এন্ট্রি = stock_ledger (material_expense) + তার JV
  const { data: ledgers } = await supabase
    .from("stock_ledger")
    .select("reference_id, item_id, warehouse_id, quantity, txn_date")
    .eq("reference_type", MATERIAL_EXPENSE_SOURCE)
    .order("txn_date", { ascending: false });
  const voucherIds = [...new Set((ledgers ?? []).map((l: any) => l.reference_id).filter(Boolean))];
  const { data: vouchers } = voucherIds.length
    ? await supabase.from("journal_vouchers")
        .select("id, voucher_no, narration, journal_entry_lines(debit, chart_of_accounts(account_code, account_name))")
        .in("id", voucherIds)
    : { data: [] as any[] };
  const vById = new Map((vouchers ?? []).map((v: any) => [v.id, v]));
  const matById = new Map((materials ?? []).map((m: any) => [m.id, m]));
  const whById = new Map((warehouses ?? []).map((w: any) => [w.id, w.name]));

  const entries = (ledgers ?? []).map((l: any) => {
    const v: any = vById.get(l.reference_id);
    const dr = (v?.journal_entry_lines ?? []).find((x: any) => Number(x.debit) > 0);
    const amount = Number(dr?.debit || 0);
    const quantity = Number(l.quantity);
    return {
      voucherId: l.reference_id as string, date: l.txn_date as string, voucherNo: v?.voucher_no ?? "",
      material: matById.get(l.item_id), warehouse: whById.get(l.warehouse_id) ?? "",
      quantity, amount, rate: quantity ? amount / quantity : 0,
      head: dr?.chart_of_accounts ? `${dr.chart_of_accounts.account_code} ${dr.chart_of_accounts.account_name}` : "",
      narration: v?.narration ?? "",
    };
  });
  const total = entries.reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Material খরচ</h1>
        <Link href="/dashboard/inventory/raw-material" className="text-sm text-gray-500 hover:underline">Raw Material Stock →</Link>
      </div>
      <p className="mb-4 text-sm text-gray-600">
        মাস শেষে গুনে দেখে যত খরচ হলো (যেমন এডহেসিভ কত কার্টন) এখানে লিখুন — স্টক কমবে আর টাকাটা Expense-এ যাবে
        (Dr খরচের হেড / Cr Material-এর Inventory)।
      </p>

      <MaterialExpenseForm
        materials={(materials ?? []) as any}
        warehouses={warehouses ?? []}
        stockMap={stockMap}
        expenseAccounts={expenseAccounts ?? []}
      />

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">তারিখ</th>
              <th className="px-4 py-2">JV</th>
              <th className="px-4 py-2">Material</th>
              <th className="px-4 py-2">গুদাম</th>
              <th className="px-4 py-2 text-right">পরিমাণ</th>
              <th className="px-4 py-2 text-right">রেট</th>
              <th className="px-4 py-2 text-right">টাকা</th>
              <th className="px-4 py-2">খরচের হেড</th>
              <th className="px-4 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.voucherId} className="border-t">
                <td className="px-4 py-2 whitespace-nowrap">{formatDate(e.date)}</td>
                <td className="px-4 py-2 text-gray-500">{e.voucherNo}</td>
                <td className="px-4 py-2">{e.material?.material_name ?? "-"}</td>
                <td className="px-4 py-2 text-gray-500">{e.warehouse}</td>
                <td className="px-4 py-2 text-right">{qty(e.quantity)} {e.material?.unit === "carton" ? "কার্টন" : "Lbs"}</td>
                <td className="px-4 py-2 text-right">{money(e.rate)}</td>
                <td className="px-4 py-2 text-right font-medium">{money(e.amount)}</td>
                <td className="px-4 py-2 text-gray-600">{e.head}</td>
                <td className="px-4 py-2 text-right"><DeleteMaterialExpense voucherId={e.voucherId} label={e.narration} /></td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-3 italic text-gray-400">এখনো কোনো Material খরচ লেখা হয়নি</td></tr>
            )}
          </tbody>
          {entries.length > 0 && (
            <tfoot className="bg-gray-50 font-semibold">
              <tr>
                <td className="px-4 py-2" colSpan={6}>মোট</td>
                <td className="px-4 py-2 text-right">{money(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
