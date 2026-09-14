import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RawMaterialSaleForm from "../../RawMaterialSaleForm";

export default async function EditRawMaterialSalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: sale } = await supabase.from("raw_material_sales").select("*").eq("id", id).maybeSingle();
  if (!sale) return notFound();

  const [{ data: materials }, { data: customers }, { data: partyAccounts }, { data: warehouses }, { data: stock }] =
    await Promise.all([
      supabase.from("raw_materials").select("id, material_name, avg_cost_per_lbs").order("material_name"),
      supabase.from("customers").select("id, name").order("name"),
      supabase.from("chart_of_accounts").select("id, account_code, account_name, account_type")
        .in("account_type", ["asset", "liability", "equity", "income"]).order("account_code"),
      supabase.from("warehouses").select("id, name").order("name"),
      supabase.from("raw_material_stock").select("material_id, warehouse_id, quantity_lbs"),
    ]);

  const stockMap: Record<string, Record<string, number>> = {};
  (stock ?? []).forEach((s: any) => {
    (stockMap[s.material_id] ||= {})[s.warehouse_id] = Number(s.quantity_lbs || 0);
  });
  // এডিট করা রেকর্ডের নিজের Lbs ফেরত ধরে available দেখাই (আগেই বিয়োগ হয়ে আছে)
  if (stockMap[sale.material_id]?.[sale.warehouse_id] !== undefined) {
    stockMap[sale.material_id][sale.warehouse_id] += Number(sale.quantity_lbs || 0);
  }

  const party = sale.customer_id ? `cust:${sale.customer_id}` : sale.party_account_id ? `acct:${sale.party_account_id}` : "";

  return (
    <div>
      <Link href="/dashboard/inventory/raw-material-sale" className="text-sm text-gray-500 hover:underline">← Raw Material বিক্রির তালিকায় ফিরুন</Link>
      <h1 className="text-2xl font-semibold mt-2 mb-4">Raw Material বিক্রি এডিট — {sale.sale_no}</h1>
      <RawMaterialSaleForm
        materials={materials ?? []}
        customers={customers ?? []}
        partyAccounts={partyAccounts ?? []}
        warehouses={warehouses ?? []}
        stockMap={stockMap}
        editSale={{
          id: sale.id,
          saleDate: sale.sale_date,
          materialId: sale.material_id,
          warehouseId: sale.warehouse_id ?? "",
          unit: sale.unit === "kg" ? "kg" : "lbs",
          quantity: Number(sale.quantity) || 0,
          rate: Number(sale.rate) || 0,
          party,
          paymentReceived: !!sale.payment_received,
          note: sale.note ?? "",
        }}
      />
    </div>
  );
}
