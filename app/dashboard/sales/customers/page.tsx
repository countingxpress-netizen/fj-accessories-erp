import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AddCustomerForm from "./AddCustomerForm";
import CustomersTable from "./CustomersTable";

export default async function CustomersPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("*").order("name");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Customers</h1>
        <Link href="/dashboard/sales" className="text-sm text-gray-500 hover:underline">← Sales-এ ফিরুন</Link>
      </div>
      <AddCustomerForm />
      <CustomersTable customers={customers ?? []} />
    </div>
  );
}
