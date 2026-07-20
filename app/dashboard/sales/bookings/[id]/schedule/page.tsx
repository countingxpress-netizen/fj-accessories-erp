import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";

export default async function BookingScheduleRedirect({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string }> }) {
  const { id } = await params;
  const { type } = await searchParams;
  const supabase = await createClient();

  const { data: productionOrder } = await supabase
    .from("production_orders")
    .select("id")
    .eq("booking_id", id)
    .maybeSingle();

  if (!productionOrder) return notFound();

  redirect(`/dashboard/production/orders/${productionOrder.id}/schedule-print?type=${type ?? "blowing"}`);
}