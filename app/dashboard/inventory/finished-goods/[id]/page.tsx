import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function ProductStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: product } = await supabase
    .from("finished_goods")
    .select("*")
    .eq("id", id)
    .single();

  if (!product) return notFound();

  const { data: stock } = await supabase
    .from("finished_goods_stock")
    .select("*, warehouses(name)")
    .eq("product_id", id);

  const totalPcs = (stock ?? []).reduce((sum, s) => sum + (s.quantity_pcs || 0), 0);

  return (
    <div>
      <Link href="/dashboard/inventory/finished-goods" className="text-sm text-gray-500 hover:underline">
        ← সব পণ্যের তালিকায় ফিরুন
      </Link>

      <h1 className="text-2xl font-semibold mt-2 mb-1">{product.product_name}</h1>
      <p className="text-sm text-gray-500 mb-4">
        Length: {product.length_cm} cm | Width: {product.width_cm} cm | Thickness: {product.thickness}
      </p>
      <p className="text-sm font-medium text-gray-700 mb-4">
        মোট স্টক: {totalPcs.toLocaleString()} পিস
      </p>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Warehouse</th>
              <th className="px-4 py-2 text-right">Quantity (Pcs)</th>
            </tr>
          </thead>
          <tbody>
            {(stock ?? []).map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-4 py-2">{s.warehouses?.name ?? "-"}</td>
                <td className="px-4 py-2 text-right">{s.quantity_pcs.toLocaleString()}</td>
              </tr>
            ))}
            {(!stock || stock.length === 0) && (
              <tr>
                <td colSpan={2} className="px-4 py-3 text-gray-400 italic">এখনো কোনো স্টক নেই (Production শুরু হলে এখানে আসবে)</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}