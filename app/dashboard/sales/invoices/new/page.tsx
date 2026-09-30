import { createClient } from "@/lib/supabase/server";
import SalesInvoiceForm from "./SalesInvoiceForm";
import { fetchAllRows } from "@/lib/fetchAll";

export default async function NewSalesInvoicePage() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("*").order("name");
  // bookings / sales_invoice_items 1000-রো ক্যাপের কাছাকাছি — পেজ করে সব আনা
  const bookings = await fetchAllRows<any>(
    supabase, "bookings",
    "id, booking_no, booking_date, quantity_pcs, product_id, customer_id, style, garments_name, buyers(name), merchants(name), delivery_point, customer_booking_ref, has_print, print_colors, rate_per_color, rate_per_inch, measurement_type, measurement_unit, length_val, width_val, flap_val, gusset_val, pillow_val, thickness_mm, material_type, plain_cm_conversion, finished_goods(product_name, length_cm, width_cm, thickness)",
    (q) => q.order("booking_date", { ascending: false }).order("created_at", { ascending: true })
  );
  const { data: priceHistory } = await supabase
    .from("rate_history")
    .select("customer_id, effective_from, rate, material_type")
    .not("customer_id", "is", null);
  const allItems = await fetchAllRows<any>(supabase, "sales_invoice_items", "booking_id, quantity_pcs");

  const invoicedMap: Record<string, number> = {};
  (allItems ?? []).forEach((item: any) => {
    if (!item.booking_id) return;
    invoicedMap[item.booking_id] = (invoicedMap[item.booking_id] ?? 0) + item.quantity_pcs;
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">নতুন Sales Invoice</h1>
      <SalesInvoiceForm customers={customers ?? []} bookings={(bookings ?? []) as any} invoicedMap={invoicedMap} priceHistory={(priceHistory ?? []) as any} />
    </div>
  );
}