import { createClient } from "@/lib/supabase/server";
import SalesInvoiceForm from "./SalesInvoiceForm";

export default async function NewSalesInvoicePage() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name, price_per_lbs").order("name");
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, booking_no, quantity_pcs, product_id, customer_id, style, buyers(name), merchants(name), delivery_point, customer_booking_ref, has_print, print_colors, rate_per_color, rate_per_inch, measurement_type, width_val, measurement_unit, finished_goods(product_name, length_cm, width_cm, thickness)")
    .order("booking_date", { ascending: false });
  const { data: allItems } = await supabase.from("sales_invoice_items").select("booking_id, quantity_pcs");

  const invoicedMap: Record<string, number> = {};
  (allItems ?? []).forEach((item: any) => {
    if (!item.booking_id) return;
    invoicedMap[item.booking_id] = (invoicedMap[item.booking_id] ?? 0) + item.quantity_pcs;
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">নতুন Sales Invoice</h1>
      <SalesInvoiceForm customers={customers ?? []} bookings={(bookings ?? []) as any} invoicedMap={invoicedMap} />
    </div>
  );
}