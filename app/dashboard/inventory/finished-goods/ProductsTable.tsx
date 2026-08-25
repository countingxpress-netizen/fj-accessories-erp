"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import { BulkActionBar } from "@/components/BulkActionBar";
import { deleteSimpleRow } from "@/lib/simpleDelete";
import ProductRow from "./ProductRow";

export default function ProductsTable({ products }: { products: any[] }) {
  const router = useRouter();
  const supabase = createClient();

  const {
    selectedIds, selectedCount, isSelected, toggle, toggleAll, isAllSelected, isSomeSelected, clear,
  } = useBulkSelect(products, (p: any) => p.id);

  async function handleBulkDelete() {
    const errors: string[] = [];
    for (const id of selectedIds) {
      const product = products.find((p: any) => p.id === id);
      const result = await deleteSimpleRow(supabase, "finished_goods", id);
      if (!result.ok) errors.push(`${product?.product_name ?? id}: ${result.error}`);
    }
    clear();
    router.refresh();
    if (errors.length > 0) {
      alert(`${errors.length}টি Product মুছা যায়নি (সম্ভবত বুকিং/স্টক এন্ট্রি যুক্ত আছে):\n\n${errors.join("\n")}`);
    }
  }

  return (
    <div>
      <BulkActionBar count={selectedCount} itemLabel="Product" onDeleteSelected={handleBulkDelete} onClear={clear} />
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2 w-10">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => { if (el) el.indeterminate = isSomeSelected; }}
                  onChange={toggleAll}
                  aria-label="Select all products"
                />
              </th>
              <th className="px-4 py-2">Product Name</th>
              <th className="px-4 py-2">Length (cm)</th>
              <th className="px-4 py-2">Width (cm)</th>
              <th className="px-4 py-2">Thickness</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p: any) => (
              <ProductRow key={p.id} product={p} selected={isSelected(p.id)} onToggleSelect={() => toggle(p.id)} />
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-3 text-gray-400 italic">কোনো পণ্য যোগ করা হয়নি</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
