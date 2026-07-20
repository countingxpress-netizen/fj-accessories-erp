import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AddProductForm from "./AddProductForm";
import ProductRow from "./ProductRow";

export default async function FinishedGoodsPage() {
  const supabase = await createClient();
  const { data: products } = await supabase
    .from("finished_goods")
    .select("*")
    .order("product_name");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Finished Goods</h1>
        <Link href="/dashboard/inventory" className="text-sm text-gray-500 hover:underline">
          ← Inventory-এ ফিরুন
        </Link>
      </div>

      <AddProductForm />

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Product Name</th>
              <th className="px-4 py-2">Length (cm)</th>
              <th className="px-4 py-2">Width (cm)</th>
              <th className="px-4 py-2">Thickness</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(products ?? []).map((p) => (
              <ProductRow key={p.id} product={p} />
            ))}
            {(!products || products.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-3 text-gray-400 italic">কোনো পণ্য যোগ করা হয়নি</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}