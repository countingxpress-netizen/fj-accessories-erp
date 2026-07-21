import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AddCustomerForm from "./AddCustomerForm";
import CustomerRow from "./CustomerRow";

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
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Address</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Price/Lbs</th>
              <th className="px-4 py-2">Print Rate</th>
              <th className="px-4 py-2">Adhesive Rate</th>
              <th className="px-4 py-2 text-right">Opening Balance</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(customers ?? []).map((c) => <CustomerRow key={c.id} customer={c} />)}
            {(!customers || customers.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-3 text-gray-400 italic">কোনো Customer যোগ করা হয়নি</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}