import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AddBuyerForm from "./AddBuyerForm";
import BuyerRow from "./BuyerRow";

export default async function BuyersPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name").order("name");
  const { data: buyers } = await supabase.from("buyers").select("*, customers(name)").order("name");

  const grouped: Record<string, { customerName: string; items: any[] }> = {};
  (buyers ?? []).forEach((b: any) => {
    const key = b.customer_id;
    if (!grouped[key]) grouped[key] = { customerName: b.customers?.name ?? "-", items: [] };
    grouped[key].items.push(b);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Buyers</h1>
        <Link href="/dashboard/sales" className="text-sm text-gray-500 hover:underline">← Sales-এ ফিরুন</Link>
      </div>

      <AddBuyerForm customers={customers ?? []} />

      {Object.values(grouped).map((group, gi) => (
        <div key={gi} className="mb-6">
          <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">{group.customerName}</h2>
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-2">Buyer</th>
                  <th className="px-4 py-2">PI Pricing Rule Value</th>
                  <th className="px-4 py-2">PI Thickness (mm)</th>
                  <th className="px-4 py-2">Booking Thickness (mm)</th>
                  <th className="px-4 py-2">Production Thickness (mm)</th>
                  <th className="px-4 py-2">Adhesive Rate/Inch</th>
                  <th className="px-4 py-2">Print/Color/Pc</th>
                  <th className="px-4 py-2">Color Quantity</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((b) => <BuyerRow key={b.id} buyer={b} />)}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {Object.keys(grouped).length === 0 && (
        <p className="text-gray-400 italic text-sm">কোনো Buyer যোগ করা হয়নি</p>
      )}
    </div>
  );
}