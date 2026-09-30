import { createClient } from "@/lib/supabase/server";
import BookingForm, { type BookingEditContext } from "./BookingForm";
import { fetchAllRows } from "@/lib/fetchAll";
import { buildBookingItems, bookingHeader, BOOKING_GROUP_SELECT } from "@/lib/bookingEditContext";

// ?clone=<booking id> — Zoho-র মতো Clone: সেই booking group-এর হেডার + সব প্রোডাক্ট ভরা নতুন ফর্ম
// (তারিখ আজকের, নতুন Booking No / Production Order / auto Invoice সেভের সময়)।
export default async function NewBookingPage({ searchParams }: { searchParams: Promise<{ clone?: string }> }) {
  const { clone } = await searchParams;
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("*").order("name");
  const { data: warehouses } = await supabase.from("warehouses").select("id, name").order("name");
  const { data: materials } = await supabase.from("raw_materials").select("id, material_name").order("material_name");
  const { data: buyersMaster } = await supabase
    .from("buyers")
    .select("id, customer_id, name, booking_thickness_mm, production_thickness_mm, pi_thickness_mm, print_colors_default, adhesive_rate_per_inch")
    .order("name");
  const { data: garmentsMaster } = await supabase.from("garments").select("id, customer_id, name, address").order("name");
  const { data: merchantsMaster } = await supabase.from("merchants").select("id, name").order("name");
  const bookingMerchantLinks = await fetchAllRows<any>(
    supabase, "bookings", "customer_id, merchant_id", (q) => q.not("merchant_id", "is", null)
  );
  const { data: priceHistory } = await supabase
    .from("rate_history")
    .select("customer_id, effective_from, rate, material_type")
    .not("customer_id", "is", null);

  let cloneContext: BookingEditContext | undefined;
  if (clone) {
    const { data: src } = await supabase.from("bookings").select("id, booking_group_id").eq("id", clone).maybeSingle();
    if (src) {
      const q = supabase.from("bookings").select(BOOKING_GROUP_SELECT).order("created_at", { ascending: true });
      const { data: bookings } = src.booking_group_id ? await q.eq("booking_group_id", src.booking_group_id) : await q.eq("id", src.id);
      if (bookings && bookings.length > 0) {
        const first: any = bookings[0];
        const items = buildBookingItems(bookings, {
          warehouses: warehouses ?? [],
          customer: (customers ?? []).find((c: any) => c.id === first.customer_id) ?? null,
          priceHistory: (priceHistory ?? []) as any,
        }).map((it) => ({ ...it, sourceBookingId: null, progress: undefined })); // নতুন booking — পুরনোর সাথে কোনো লিংক নয়
        cloneContext = {
          groupId: "",
          ...bookingHeader(first),
          paymentReceived: false,
          priceOverride: "",
          items: items as BookingEditContext["items"],
        };
      }
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">নতুন Booking</h1>
      <BookingForm
        key={clone ?? "new"}
        customers={customers ?? []} warehouses={warehouses ?? []} materials={materials ?? []}
        buyersMaster={buyersMaster ?? []} garmentsMaster={garmentsMaster ?? []} merchantsMaster={merchantsMaster ?? []}
        bookingMerchantLinks={(bookingMerchantLinks ?? []) as any}
        priceHistory={(priceHistory ?? []) as any}
        cloneContext={cloneContext}
      />
    </div>
  );
}
