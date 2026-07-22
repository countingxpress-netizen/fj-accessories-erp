import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/supabase/getCurrentAppUser";
import { redirect } from "next/navigation";
import PrintRequestRow from "./PrintRequestRow";

export default async function PrintRequestsPage() {
  const appUser = await getCurrentAppUser();
  if (appUser?.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("print_reprint_requests")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Reprint Permission Requests</h1>
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Requested By</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Group ID</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(requests ?? []).map((r) => <PrintRequestRow key={r.id} request={r} />)}
            {(!requests || requests.length === 0) && (
              <tr><td colSpan={6} className="px-4 py-3 text-gray-400 italic">কোনো Request নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}