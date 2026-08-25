import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AddProductForm from "./AddProductForm";
import ProductsTable from "./ProductsTable";

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

      <ProductsTable products={products ?? []} />
    </div>
  );
}
