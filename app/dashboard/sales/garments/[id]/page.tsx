import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function GarmentViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: garment } = await supabase.from("garments").select("*, customers(name)").eq("id", id).single();
  if (!garment) return notFound();

  return (
    <div>
      <Link href="/dashboard/sales/garments" className="text-sm text-gray-500 hover:underline">← সব Garments-এর তালিকায় ফিরুন</Link>
      <h1 className="text-2xl font-semibold mt-2 mb-4">{garment.name}</h1>
      <div className="rounded-xl border bg-white p-4 shadow-sm text-sm space-y-1">
        <p><span className="text-gray-500">Customer:</span> {garment.customers?.name}</p>
        <p><span className="text-gray-500">ঠিকানা:</span> {garment.address || "-"}</p>
      </div>
      <p className="text-xs text-gray-400 mt-4">এখানে ভবিষ্যতে এই Garments-এর সব Booking/PI/Challan-এর তালিকা যোগ করা হবে।</p>
    </div>
  );
}