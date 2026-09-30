import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ProformaForm from "./ProformaForm";
import { getCurrentAppUser } from "@/lib/supabase/getCurrentAppUser";
import { fetchAllRows, fetchAllRowsIn } from "@/lib/fetchAll";

export default async function NewProformaPage() {
  const appUser = await getCurrentAppUser();
  // role='customer_pi_only' — নতুন PI তৈরির অনুমতি নেই (proxy.ts-এও ব্লক করা আছে, এটা defense-in-depth)
  if (appUser?.role === "customer_pi_only") redirect("/dashboard/lc-export/proforma");

  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name, code, price_per_lbs, default_print_rate").order("name");

  // bookings / pi_items দুটোই 1000-রো ক্যাপের কাছাকাছি/বেশি — পেজ করে সব আনা
  const allBookings = await fetchAllRows<any>(
    supabase, "bookings",
    "id, booking_no, booking_date, quantity_pcs, product_id, customer_id, style, customer_booking_ref, garments_name, buyer_id, buyers(name), merchants(name), measurement_type, measurement_unit, length_val, width_val, flap_val, gusset_val, pillow_val, pi_thickness_mm, material_type, has_print, print_colors, rate_per_color, plain_cm_conversion, finished_goods(product_name, length_cm, width_cm, thickness)",
    (q) => q.order("booking_date", { ascending: false }).order("created_at", { ascending: true })
  );

  const usedItems = await fetchAllRows<any>(supabase, "pi_items", "booking_id", (q) => q.not("booking_id", "is", null));
  const usedIds = new Set((usedItems ?? []).map((pi: any) => pi.booking_id));
  const availableBookings = (allBookings ?? []).filter((b: any) => !usedIds.has(b.id));

  const bookingIds = availableBookings.map((b: any) => b.id);
  const pastInvoiceItems = await fetchAllRowsIn<any>(supabase, "sales_invoice_items", "booking_id, unit_price", "booking_id", bookingIds);
  const lastUnitPriceByBooking: Record<string, number> = {};
  (pastInvoiceItems ?? []).forEach((it: any) => { lastUnitPriceByBooking[it.booking_id] = it.unit_price; });

  const { data: buyersMaster } = await supabase.from("buyers").select("*");
  const { data: buyerRateHistory } = await supabase
    .from("rate_history")
    .select("buyer_id, effective_from, rate")
    .not("buyer_id", "is", null);
  const { data: measurementPrices } = await supabase.from("buyer_measurement_prices").select("*");
  const { data: garments } = await supabase.from("garments").select("id, customer_id, name, address").order("name");
  const { data: advisingBanks } = await supabase.from("advising_banks").select("id, name, branch, address, swift").order("name");

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">নতুন Proforma Invoice</h1>
      <ProformaForm
        customers={customers ?? []}
        bookings={availableBookings as any}
        buyersMaster={buyersMaster ?? []}
        garments={garments ?? []}
        advisingBanks={advisingBanks ?? []}
        lastUnitPriceByBooking={lastUnitPriceByBooking}
        buyerRateHistory={(buyerRateHistory ?? []) as any}
        measurementPrices={(measurementPrices ?? []) as any}
      />
    </div>
  );
}