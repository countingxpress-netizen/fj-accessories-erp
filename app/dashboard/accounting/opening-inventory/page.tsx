import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import OpeningInventoryForm from "./OpeningInventoryForm";

export default async function OpeningInventoryPage() {
  const supabase = await createClient();

  const [
    { data: materials },
    { data: rmStock },
    { data: products },
    { data: fgStock },
    { data: openOrders },
    { data: accounts },
    { data: jeLines },
    { data: existingOpeningJv },
  ] = await Promise.all([
    supabase.from("raw_materials").select("id, material_name, avg_cost_per_lbs, inventory_account_code").order("material_name"),
    supabase.from("raw_material_stock").select("material_id, quantity_lbs"),
    supabase.from("finished_goods").select("id, product_name, avg_cost_per_pc").order("product_name"),
    supabase.from("finished_goods_stock").select("product_id, quantity_pcs"),
    supabase
      .from("production_orders")
      .select("id, wip_cost, required_lbs, stage, bookings(booking_no), material_consumption(quantity_lbs, raw_materials(material_name, avg_cost_per_lbs))")
      .neq("stage", "finished"),
    supabase.from("chart_of_accounts").select("id, account_code, account_name, account_type").eq("is_active", true).order("account_code"),
    supabase.from("journal_entry_lines").select("account_id, debit, credit"),
    supabase.from("journal_vouchers").select("id").ilike("narration", "%Opening inventory reconciliation%").limit(1),
  ]);

  // per-material stock (lbs) across all warehouses
  const rmQty: Record<string, number> = {};
  (rmStock ?? []).forEach((s: any) => {
    if (!s.material_id) return;
    rmQty[s.material_id] = (rmQty[s.material_id] ?? 0) + (Number(s.quantity_lbs) || 0);
  });

  const fgQty: Record<string, number> = {};
  (fgStock ?? []).forEach((s: any) => {
    if (!s.product_id) return;
    fgQty[s.product_id] = (fgQty[s.product_id] ?? 0) + (Number(s.quantity_pcs) || 0);
  });

  // current balance per account (debit − credit)
  const acctBalance: Record<string, number> = {};
  (jeLines ?? []).forEach((l: any) => {
    if (!l.account_id) return;
    acctBalance[l.account_id] = (acctBalance[l.account_id] ?? 0) + (Number(l.debit) || 0) - (Number(l.credit) || 0);
  });
  const balanceByCode: Record<string, number> = {};
  const accountsByCode: Record<string, { id: string; name: string }> = {};
  (accounts ?? []).forEach((a: any) => {
    balanceByCode[a.account_code] = acctBalance[a.id] ?? 0;
    accountsByCode[a.account_code] = { id: a.id, name: a.account_name };
  });

  const rmRows = (materials ?? [])
    .map((m: any) => ({
      id: m.id,
      name: m.material_name,
      qtyLbs: Number((rmQty[m.id] ?? 0).toFixed(2)),
      avgCost: Number(m.avg_cost_per_lbs) || 0,
      accountCode: m.inventory_account_code || "1299",
    }))
    .filter((r) => r.qtyLbs !== 0);

  const fgRows = (products ?? [])
    .map((p: any) => ({
      id: p.id,
      name: p.product_name,
      qtyPcs: Number((fgQty[p.id] ?? 0).toFixed(2)),
      avgCost: Number(p.avg_cost_per_pc) || 0,
    }))
    .filter((r) => r.qtyPcs !== 0);

  // in-production orders that perpetual hasn't costed yet (wip_cost == 0)
  const wipRows = (openOrders ?? [])
    .filter((o: any) => (Number(o.wip_cost) || 0) === 0)
    .map((o: any) => {
      const consumedValue = (o.material_consumption ?? []).reduce(
        (s: number, c: any) => s + (Number(c.quantity_lbs) || 0) * (Number(c.raw_materials?.avg_cost_per_lbs) || 0),
        0
      );
      const consumedLbs = (o.material_consumption ?? []).reduce((s: number, c: any) => s + (Number(c.quantity_lbs) || 0), 0);
      return {
        id: o.id,
        bookingNo: o.bookings?.booking_no ?? "-",
        stage: o.stage,
        consumedLbs: Number(consumedLbs.toFixed(2)),
        value: Number(consumedValue.toFixed(2)),
      };
    })
    .filter((r) => r.value > 0);

  const equityAccounts = (accounts ?? []).filter((a: any) => a.account_type === "equity");

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Opening Inventory Reconciliation</h1>
        <Link href="/dashboard/accounting" className="text-sm text-gray-500 hover:underline">← Accounting-এ ফিরুন</Link>
      </div>
      <p className="text-sm text-gray-500 mb-4 max-w-3xl">
        Perpetual inventory চালুর সময় একবার চালান — বর্তমান কাঁচামাল / WIP / finished goods স্টককে খরচে মূল্যায়ন করে
        inventory অ্যাকাউন্টগুলো (1200–1203, 1210, 1220, 1299) ঠিক মানে বসিয়ে দেয়, বাকিটা Opening Balance Equity-তে।
        এটাই ভিত্তি — এর পরের সব লেনদেন অটো JV করবে।
      </p>

      {existingOpeningJv && existingOpeningJv.length > 0 && (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ একটা &quot;Opening inventory reconciliation&quot; Journal Voucher আগেই আছে। আবার চালালে দ্বিগুণ হয়ে যেতে পারে —
          নিশ্চিত না হলে আগে সেটা দেখে নিন।
        </p>
      )}

      <OpeningInventoryForm
        rmRows={rmRows}
        fgRows={fgRows}
        wipRows={wipRows}
        balanceByCode={balanceByCode}
        accountsByCode={accountsByCode}
        equityAccounts={equityAccounts}
      />
    </div>
  );
}
