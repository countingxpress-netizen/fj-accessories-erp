import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WastageSaleForm from "../../WastageSaleForm";

export default async function EditWastageSalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: sale } = await supabase.from("wastage_sales").select("*").eq("id", id).maybeSingle();
  if (!sale) return notFound();

  const [{ data: customers }, { data: partyAccounts }, { data: warehouses }, { data: recycled }, { data: wastages }, { data: soldFromWastage }] =
    await Promise.all([
      supabase.from("customers").select("id, name").order("name"),
      supabase.from("chart_of_accounts").select("id, account_code, account_name, account_type")
        .in("account_type", ["asset", "liability", "equity", "income"]).order("account_code"),
      supabase.from("warehouses").select("id, name").order("name"),
      supabase.from("raw_materials").select("id, avg_cost_per_lbs").eq("material_name", "Recycled Chips").maybeSingle(),
      supabase.from("wastage").select("quantity_lbs, recycled"),
      supabase.from("wastage_sales").select("quantity_lbs, id").eq("source", "wastage_stock"),
    ]);

  const recordedNonRecycled = (wastages ?? []).filter((w: any) => !w.recycled)
    .reduce((s: number, w: any) => s + Number(w.quantity_lbs || 0), 0);
  // এডিট করা রেকর্ডের নিজের Lbs available-এ ফেরত ধরি
  const soldWastageLbs = (soldFromWastage ?? [])
    .filter((r: any) => r.id !== id)
    .reduce((s: number, r: any) => s + Number(r.quantity_lbs || 0), 0);
  const availableWastageLbs = Math.round((recordedNonRecycled - soldWastageLbs) * 100) / 100;

  let recycledStock: { warehouse_id: string; quantity_lbs: number }[] = [];
  if (recycled?.id) {
    const { data: stock } = await supabase
      .from("raw_material_stock").select("warehouse_id, quantity_lbs").eq("material_id", recycled.id);
    recycledStock = stock ?? [];
  }

  const party = sale.customer_id ? `cust:${sale.customer_id}` : sale.party_account_id ? `acct:${sale.party_account_id}` : "";

  return (
    <div>
      <Link href="/dashboard/production/wastage-sale" className="text-sm text-gray-500 hover:underline">← Wastage বিক্রির তালিকায় ফিরুন</Link>
      <h1 className="text-2xl font-semibold mt-2 mb-4">Wastage বিক্রি এডিট — {sale.sale_no}</h1>
      <WastageSaleForm
        customers={customers ?? []}
        partyAccounts={partyAccounts ?? []}
        warehouses={warehouses ?? []}
        availableWastageLbs={availableWastageLbs}
        recycledStockByWarehouse={Object.fromEntries(recycledStock.map((r) => [r.warehouse_id, Number(r.quantity_lbs || 0)]))}
        recycledAvgCost={Number(recycled?.avg_cost_per_lbs || 0)}
        editSale={{
          id: sale.id,
          saleDate: sale.sale_date,
          source: sale.source,
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
