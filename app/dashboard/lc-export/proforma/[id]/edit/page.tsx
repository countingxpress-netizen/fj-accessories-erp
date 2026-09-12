import { createClient } from "@/lib/supabase/server";
import EditProformaForm from "./EditProformaForm";
import { notFound } from "next/navigation";

export default async function EditProformaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: pi } = await supabase.from("proforma_invoices").select("*").eq("id", id).single();
  if (!pi) return notFound();
  const { data: items } = await supabase.from("pi_items").select("*").eq("pi_id", id).order("sl_no");

  const { data: garments } = pi.customer_id
    ? await supabase.from("garments").select("id, customer_id, name, address").eq("customer_id", pi.customer_id).order("name")
    : { data: [] };
  const { data: advisingBanks } = await supabase.from("advising_banks").select("id, name, branch, address, swift").order("name");

  // Manual PI-তে (বা যে কোনো PI-তে) পরে নতুন বুকিং যোগ করার অপশন — customer_id থাকলেই
  // (Manual PI-তেও customer বাছা থাকতে পারে) সেই কাস্টমারের বুকিং লিস্ট আনা হয়, অন্য কোনো
  // PI-তে ইতিমধ্যে ব্যবহৃত বুকিং বাদে (globally unique booking_id, /new পেজের মতোই লজিক)।
  let bookings: any[] = [];
  let buyersMaster: any[] = [];
  let buyerRateHistory: any[] = [];
  let lastUnitPriceByBooking: Record<string, number> = {};

  if (pi.customer_id) {
    const { data: allBookings } = await supabase
      .from("bookings")
      .select("id, booking_no, booking_date, quantity_pcs, product_id, customer_id, style, customer_booking_ref, garments_name, buyer_id, buyers(name), merchants(name), measurement_type, measurement_unit, length_val, width_val, flap_val, gusset_val, pillow_val, pi_thickness_mm, material_type, has_print, print_colors, rate_per_color, plain_cm_conversion, finished_goods(product_name, length_cm, width_cm, thickness)")
      .eq("customer_id", pi.customer_id)
      .order("booking_date", { ascending: false });

    const { data: usedItems } = await supabase.from("pi_items").select("booking_id").not("booking_id", "is", null);
    const usedIds = new Set((usedItems ?? []).map((it: any) => it.booking_id));
    bookings = (allBookings ?? []).filter((b: any) => !usedIds.has(b.id));

    const bookingIds = bookings.map((b: any) => b.id);
    const { data: pastInvoiceItems } = bookingIds.length
      ? await supabase.from("sales_invoice_items").select("booking_id, unit_price").in("booking_id", bookingIds)
      : { data: [] };
    (pastInvoiceItems ?? []).forEach((it: any) => { lastUnitPriceByBooking[it.booking_id] = it.unit_price; });

    const { data: bm } = await supabase.from("buyers").select("*").eq("customer_id", pi.customer_id);
    buyersMaster = bm ?? [];
    const { data: rh } = await supabase.from("rate_history").select("buyer_id, effective_from, rate").not("buyer_id", "is", null);
    buyerRateHistory = rh ?? [];
  }

  const { data: customerRow } = pi.customer_id
    ? await supabase.from("customers").select("default_print_rate").eq("id", pi.customer_id).single()
    : { data: null };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">PI এডিট করুন — {pi.pi_no}</h1>
      <EditProformaForm
        pi={pi}
        items={items ?? []}
        garments={garments ?? []}
        advisingBanks={advisingBanks ?? []}
        bookings={bookings as any}
        buyersMaster={buyersMaster}
        buyerRateHistory={buyerRateHistory as any}
        lastUnitPriceByBooking={lastUnitPriceByBooking}
        customerDefaultPrintRate={customerRow?.default_print_rate ?? null}
      />
    </div>
  );
}
