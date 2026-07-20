import { createClient } from "@/lib/supabase/server";
import EditBookingForm from "./EditBookingForm";
import { notFound } from "next/navigation";

export default async function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: booking } = await supabase.from("bookings").select("*").eq("id", id).single();
  if (!booking) return notFound();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Booking এডিট করুন — {booking.booking_no}</h1>
      <EditBookingForm booking={booking} />
    </div>
  );
}