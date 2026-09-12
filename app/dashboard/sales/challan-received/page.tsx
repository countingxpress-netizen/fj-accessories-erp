import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ChallanReceivedForm from "./ChallanReceivedForm";
import ChallanReceivedTable from "./ChallanReceivedTable";

export default async function ChallanReceivedPage() {
  const supabase = await createClient();

  const { data: challans } = await supabase
    .from("delivery_challans")
    .select("id, challan_no, challan_date, customer_id, delivery_status, received_date, received_note, received_file_url, printed_at, customers(name), delivery_challan_items(quantity_pcs)")
    .in("delivery_status", ["delivery_done", "challan_received"])
    .order("challan_date", { ascending: false })
    .order("created_at", { ascending: false });

  const rows = (challans ?? []).map((c: any) => ({
    ...c,
    totalQty: (c.delivery_challan_items ?? []).reduce((s: number, i: any) => s + Number(i.quantity_pcs || 0), 0),
  }));

  const pending = rows.filter((c: any) => c.delivery_status === "delivery_done");
  const received = rows.filter((c: any) => c.delivery_status === "challan_received");

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Challan Received</h1>
        <Link href="/dashboard/sales/delivery-challan" className="text-sm text-gray-500 hover:underline">
          ← Delivery Challans
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Print করা (Delivery Done) চালানের কাস্টমার-স্বাক্ষরিত কপি ফেরত এলে এখানে সিলেক্ট করে
        &quot;Received&quot; দিন — চাইলে স্ক্যান কপি/ছবি আপলোড করুন। Delivery Challans লিস্টে স্ট্যাটাস
        &quot;Challan Received&quot; হয়ে যাবে।
      </p>

      <ChallanReceivedForm pending={pending} />

      <h2 className="text-lg font-semibold mt-8 mb-2">Received চালান</h2>
      <ChallanReceivedTable received={received} />
    </div>
  );
}
