import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import ScheduleGroupClient from "./ScheduleGroupClient";

export default async function ScheduleGroupPage({
  params,
}: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const supabase = await createClient();

  let { data: bookings } = await supabase
    .from("bookings")
    .select("*, customers(name), buyers(name), production_orders(id, production_no)")
    .eq("booking_group_id", groupId);

  if (!bookings || bookings.length === 0) {
    const { data: single } = await supabase
      .from("bookings")
      .select("*, customers(name), buyers(name), production_orders(id, production_no)")
      .eq("id", groupId);
    bookings = single ?? [];
  }

  if (!bookings || bookings.length === 0) return notFound();

  const { data: company } = await supabase.from("company_profile").select("*").single();

  return <ScheduleGroupClient bookings={bookings} company={company} groupId={groupId} />;
}