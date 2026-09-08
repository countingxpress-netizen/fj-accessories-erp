import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import ChallanReceivedForm from "./ChallanReceivedForm";

export default async function ChallanReceivedPage() {
  const supabase = await createClient();

  const { data: challans } = await supabase
    .from("delivery_challans")
    .select("id, challan_no, challan_date, delivery_status, received_date, received_note, received_file_url, printed_at, customers(name), delivery_challan_items(quantity_pcs)")
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
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Challan No</th>
              <th className="px-4 py-2">Challan Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2">Received Date</th>
              <th className="px-4 py-2">Note</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {received.map((c: any) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-2 font-medium">{c.challan_no}</td>
                <td className="px-4 py-2 text-gray-500">{formatDate(c.challan_date)}</td>
                <td className="px-4 py-2">{c.customers?.name ?? "-"}</td>
                <td className="px-4 py-2 text-right">{c.totalQty}</td>
                <td className="px-4 py-2 text-gray-500">{c.received_date ? formatDate(c.received_date) : "-"}</td>
                <td className="px-4 py-2 text-gray-500">{c.received_note || "-"}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <Link
                    href={`/dashboard/sales/delivery-challan/${c.id}/print`}
                    target="_blank"
                    className="text-blue-700 hover:underline text-xs mr-3"
                  >
                    View
                  </Link>
                  {c.received_file_url ? (
                    <a href={c.received_file_url} target="_blank" rel="noreferrer" className="text-gray-700 hover:underline text-xs">
                      রিসিট কপি
                    </a>
                  ) : (
                    <span className="text-gray-300 text-xs">রিসিট নেই</span>
                  )}
                </td>
              </tr>
            ))}
            {received.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-4 text-center text-gray-400 italic">এখনো কোনো চালান Received হয়নি</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
