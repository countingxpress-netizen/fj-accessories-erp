import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AddSupplierForm from "./AddSupplierForm";
import SupplierRow from "./SupplierRow";

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
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Address</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(suppliers ?? []).map((s) => <SupplierRow key={s.id} supplier={s} />)}
            {(!suppliers || suppliers.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-3 text-gray-400 italic">কোনো Supplier যোগ করা হয়নি</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}