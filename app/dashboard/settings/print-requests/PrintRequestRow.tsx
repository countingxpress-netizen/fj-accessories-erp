"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";

export default function PrintRequestRow({ request }: { request: any }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleAction(status: "approved" | "denied") {
    setLoading(true);
    await supabase.from("print_reprint_requests")
      .update({ status, resolved_at: new Date().toISOString() })
      .eq("id", request.id);
    setLoading(false);
    router.refresh();
  }

  const statusColors: Record<string, string> = {
    pending: "bg-orange-100 text-orange-700",
    approved: "bg-green-100 text-green-700",
    denied: "bg-red-100 text-red-700",
    fulfilled: "bg-gray-100 text-gray-600",
  };

  return (
    <tr className="border-t">
      <td className="px-4 py-2 text-gray-500">{formatDate(request.created_at?.slice(0, 10))}</td>
      <td className="px-4 py-2">{request.requested_by_name ?? "-"}</td>
      <td className="px-4 py-2 capitalize">{request.schedule_type}</td>
      <td className="px-4 py-2 text-xs text-gray-500">{request.booking_group_id}</td>
      <td className="px-4 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs ${statusColors[request.status]}`}>{request.status}</span>
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        {request.status === "pending" && (
          <>
            <button onClick={() => handleAction("approved")} disabled={loading} className="rounded bg-green-50 px-2 py-1 text-xs text-green-700 hover:bg-green-100 mr-2">Approve</button>
            <button onClick={() => handleAction("denied")} disabled={loading} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Deny</button>
          </>
        )}
      </td>
    </tr>
  );
}