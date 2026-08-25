export type DeleteResult = { ok: true } | { ok: false; error: string };

/** Bengali label for tables that commonly block a delete via foreign key. */
const FK_TABLE_LABELS: Record<string, string> = {
  expenses: "Expense",
  sales_invoices: "Sales Invoice",
  sales_invoice_items: "Sales Invoice",
  purchase_entries: "Purchase Entry",
  purchase_entry_items: "Purchase Entry",
  customer_payments: "Customer Payment",
  supplier_payments: "Supplier Payment",
  payment_allocations: "Payment",
  bookings: "Booking",
  booking_materials: "Booking",
  production_orders: "Production Order",
  material_consumption: "Production Order",
  finished_goods_receive: "Production Order",
  wastage: "Production/Wastage",
  delivery_challans: "Delivery Challan",
  delivery_challan_items: "Delivery Challan",
  quotations: "Quotation",
  quotation_items: "Quotation",
  journal_entry_lines: "Journal Voucher",
  journal_vouchers: "Journal Voucher",
  stock_ledger: "Stock Ledger",
  raw_material_stock: "Raw Material Stock",
  finished_goods_stock: "Finished Goods Stock",
  proforma_invoices: "Proforma Invoice (PI)",
  pi_bookings: "Proforma Invoice (PI)",
  buyers: "Buyer",
  garments: "Garments",
  finished_goods: "Product",
};

/**
 * Turns a raw Postgres error (esp. foreign-key violations, code 23503) into a
 * plain-language Bengali message naming what's still attached, instead of
 * showing the raw "violates foreign key constraint ..." text to the user.
 */
export function friendlyDeleteError(error: { code?: string; message: string; details?: string | null }): string {
  if (error.code === "23503") {
    const source = error.details || error.message;
    const match = source.match(/table "(\w+)"/);
    const table = match?.[1];
    const label = table ? (FK_TABLE_LABELS[table] ?? table) : "অন্য একটি এন্ট্রি";
    return `এটির সাথে একটি "${label}" এন্ট্রি যুক্ত আছে, তাই মুছে ফেলা যাচ্ছে না। আগে সেই সংশ্লিষ্ট এন্ট্রিটি মুছুন বা এর সংযোগ সরান।`;
  }
  return "মুছে ফেলা যায়নি: " + error.message;
}
