import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AddGarmentForm from "./AddGarmentForm";
import GarmentsTable from "./GarmentsTable";

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

      <GarmentsTable groups={Object.values(grouped)} />
    </div>
  );
}
