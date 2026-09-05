import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import PurchaseEntryForm from "../../new/PurchaseEntryForm";

export default async function EditPurchaseEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: suppliers } = await supabase.from("suppliers").select("id, name").order("name");
  const { data: warehouses } = await supabase.from("warehouses").select("id, name").order("name");
  const { data: materials } = await supabase.from("raw_materials").select("id, material_name, inventory_account_code").order("material_name");

  const { data: entry } = await supabase.from("purchase_entries").select("*").eq("id", id).single();
  if (!entry) return notFound();

  const { data: items } = await supabase
    .from("purchase_entry_items")
    .select("material_id, unit, entered_quantity, rate_per_lbs")
    .eq("entry_id", id);

  // purchase_entries/items-এ warehouse_id নেই — এই entry-র stock_ledger থেকে উদ্ধার করা হয়
  const { data: ledgerRows } = await supabase
    .from("stock_ledger")
    .select("warehouse_id")
    .eq("reference_type", "purchase")
    .eq("reference_id", id)
    .limit(1);
  const warehouseId = ledgerRows?.[0]?.warehouse_id ?? "";

  let paymentSource: "cash" | "md_jafor" | "credit" = entry.payment_type === "cash" ? "cash" : "credit";
  if (entry.payment_type !== "cash" && entry.voucher_id) {
    const { data: creditLine } = await supabase
      .from("journal_entry_lines")
      .select("credit, chart_of_accounts(account_code)")
      .eq("voucher_id", entry.voucher_id)
      .gt("credit", 0)
      .maybeSingle();
    const code = (creditLine as any)?.chart_of_accounts?.account_code;
    if (code === "3000") paymentSource = "md_jafor";
  }

  const initialLines = (items ?? []).map((it: any) => ({
    material_id: it.material_id,
    quantity: String(it.entered_quantity ?? 0),
    unit: it.unit as "lbs" | "bags",
    rate: it.unit === "bags"
      ? String(Math.round(Number(it.rate_per_lbs) * 55 * 100) / 100)
      : String(Number(it.rate_per_lbs)),
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Purchase Entry এডিট করুন — {entry.entry_no}</h1>
      <PurchaseEntryForm
        suppliers={suppliers ?? []}
        warehouses={warehouses ?? []}
        materials={materials ?? []}
        mode="edit"
        entryId={entry.id}
        initialVoucherId={entry.voucher_id}
        initialSupplierId={entry.supplier_id ?? ""}
        initialWarehouseId={warehouseId}
        initialEntryDate={entry.entry_date}
        initialInvoiceNo={entry.invoice_no ?? ""}
        initialPaymentSource={paymentSource}
        initialPurchaseSource={entry.purchase_source ?? "local"}
        initialLcNo={entry.lc_no ?? ""}
        initialLcDate={entry.lc_date ?? ""}
        initialBillOfEntryNo={entry.bill_of_entry_no ?? ""}
        initialLines={initialLines.length ? initialLines : undefined}
      />
    </div>
  );
}
