import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AddBuyerForm from "./AddBuyerForm";
import BuyersTable from "./BuyersTable";

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

      <BuyersTable groups={Object.values(grouped)} />
    </div>
  );
}
