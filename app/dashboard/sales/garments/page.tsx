import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AddGarmentForm from "./AddGarmentForm";
import GarmentRow from "./GarmentRow";

export default async function GarmentsPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name").order("name");
  const { data: garments } = await supabase.from("garments").select("*, customers(name)").order("name");

  const grouped: Record<string, { customerName: string; items: any[] }> = {};
  (garments ?? []).forEach((g: any) => {
    const key = g.customer_id;
    if (!grouped[key]) grouped[key] = { customerName: g.customers?.name ?? "-", items: [] };
    grouped[key].items.push(g);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Garments</h1>
        <Link href="/dashboard/sales" className="text-sm text-gray-500 hover:underline">← Sales-এ ফিরুন</Link>
      </div>

      <AddGarmentForm customers={customers ?? []} />

      {Object.values(grouped).map((group, gi) => (
        <div key={gi} className="mb-6">
          <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">{group.customerName}</h2>
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-3">Garment Name</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((g) => <GarmentRow key={g.id} garment={g} />)}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {Object.keys(grouped).length === 0 && (
        <p className="text-gray-400 italic text-sm">কোনো Garments যোগ করা হয়নি</p>
      )}
    </div>
  );
}