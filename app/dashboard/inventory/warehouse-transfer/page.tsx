import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TransferRow from "./TransferRow";

export default async function WarehouseTransferPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; from?: string; to?: string }>;
}) {
  const { type, from, to } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("warehouse_transfers")
    .select("*, raw_materials(material_name), from_warehouse:warehouses!from_warehouse_id(name), to_warehouse:warehouses!to_warehouse_id(name), creator:app_users!warehouse_transfers_created_by_fkey(full_name)")
    .order("transfer_date", { ascending: false });

  if (type) query = query.eq("transfer_type", type);
  if (from) query = query.gte("transfer_date", from);
  if (to) query = query.lte("transfer_date", to);

  const { data: transfers } = await query;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Warehouse Transfer Register</h1>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/inventory" className="text-sm text-gray-500 hover:underline">
            ← Inventory-এ ফিরুন
          </Link>
          <Link href="/dashboard/inventory/warehouse-transfer/new" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
            + নতুন Transfer
          </Link>
        </div>
      </div>

      <form className="mb-4 flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select name="type" defaultValue={type} className="rounded-lg border px-3 py-2 text-sm">
            <option value="">সব</option>
            <option value="stock">Stock Transfer</option>
            <option value="wastage">Wastage Transfer</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" name="from" defaultValue={from} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" name="to" defaultValue={to} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
          ফিল্টার করুন
        </button>
        {(type || from || to) && (
          <Link href="/dashboard/inventory/warehouse-transfer" className="text-sm text-gray-500 hover:underline">
            রিসেট করুন
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Transfer No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Material</th>
              <th className="px-4 py-2">From</th>
              <th className="px-4 py-2">To</th>
              <th className="px-4 py-2 text-right">Quantity</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(transfers ?? []).map((t: any) => (
              <TransferRow key={t.id} transfer={t} />
            ))}
            {(!transfers || transfers.length === 0) && (
              <tr>
                <td colSpan={8} className="px-4 py-3 text-gray-400 italic">
                  এই ফিল্টারে কোনো Transfer নেই
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
