import { createClient } from "@/lib/supabase/server";
import EditBookingForm from "./EditBookingForm";
import { notFound } from "next/navigation";
import { resolveRate } from "@/lib/rateHistory";

export default async function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: booking } = await supabase.from("bookings").select("*").eq("id", id).single();
  if (!booking) return notFound();

  // Print on/off বা color বদলালে quoted price নতুন করে হিসাব হবে — সেজন্য Booking Date
  // ধরে সেই দিনে কার্যকর Price/Lbs (rate_history → নাহলে customer master)
  const { data: customer } = await supabase
    .from("customers").select("price_per_lbs").eq("id", booking.customer_id).maybeSingle();
  const { data: rateHistory } = await supabase
    .from("rate_history").select("effective_from, rate").eq("customer_id", booking.customer_id);
  const pricePerLbs = resolveRate(rateHistory ?? [], booking.booking_date, customer?.price_per_lbs ?? 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Booking এডিট করুন — {booking.booking_no}</h1>
      <EditBookingForm booking={booking} pricePerLbs={pricePerLbs} />
    </div>
  );
}
