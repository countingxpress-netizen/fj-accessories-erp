import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AddSupplierForm from "./AddSupplierForm";
import SuppliersTable from "./SuppliersTable";

export default async function SuppliersPage() {
  const supabase = await createClient();
  const { data: suppliers } = await supabase.from("suppliers").select("*").order("name");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Suppliers</h1>
        <Link href="/dashboard/purchase" className="text-sm text-gray-500 hover:underline">← Purchase-এ ফিরুন</Link>
      </div>
      <AddSupplierForm />
      <SuppliersTable suppliers={suppliers ?? []} />
    </div>
  );
}
