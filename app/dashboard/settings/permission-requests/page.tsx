import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/supabase/getCurrentAppUser";
import { redirect } from "next/navigation";
import PermissionRequestRow from "./PermissionRequestRow";

export default async function PermissionRequestsPage() {
  const appUser = await getCurrentAppUser();
  if (appUser?.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("permission_requests")
    .select("*, requester:app_users!permission_requests_requested_by_fkey(full_name)")
    .order("created_at", { ascending: false });

  const pending = (requests ?? []).filter((r: any) => r.status === "pending");
  const resolved = (requests ?? []).filter((r: any) => r.status !== "pending");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Permission Requests</h1>
        <a href="/dashboard/settings" className="text-sm text-gray-500 hover:underline">← Settings-এ ফিরুন</a>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Staff (Admin নন এমন ইউজার) কোনো রেকর্ড Edit/Delete করতে চাইলে এখানে অনুরোধ আসবে। Approve করলে সেই ইউজার
        শুধু ঐ একটা রেকর্ড একবার Edit/Delete করতে পারবেন — ব্যবহারের পর অনুরোধটি নিজে থেকেই "fulfilled" হয়ে যাবে।
      </p>

      <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">অপেক্ষমাণ ({pending.length})</h2>
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm mb-8">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Requested By</th>
              <th className="px-4 py-2">Module</th>
              <th className="px-4 py-2">Record</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2 text-right">Decision</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((r: any) => <PermissionRequestRow key={r.id} request={r} />)}
            {pending.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-3 text-gray-400 italic">কোনো অপেক্ষমাণ অনুরোধ নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">পুরনো ({resolved.length})</h2>
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Requested By</th>
              <th className="px-4 py-2">Module</th>
              <th className="px-4 py-2">Record</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {resolved.slice(0, 50).map((r: any) => <PermissionRequestRow key={r.id} request={r} />)}
            {resolved.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-3 text-gray-400 italic">কোনো পুরনো অনুরোধ নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
