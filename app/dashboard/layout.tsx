import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/supabase/getCurrentAppUser";
import LogoutButton from "./LogoutButton";
import SidebarMenu from "./SidebarMenu";
import Link from "next/link";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const appUser = await getCurrentAppUser();
  const isAdmin = appUser?.role === "admin";

  return (
    <div className="flex min-h-screen">
      <aside className="print:hidden sticky top-0 h-screen w-64 shrink-0 overflow-y-auto border-r bg-gray-900 text-white p-4 flex flex-col">
        <h2 className="mb-1 text-lg font-bold">F & J ERP</h2>
        {appUser && (
          <p className="mb-4 text-xs text-gray-400">
            {appUser.full_name} ({appUser.designation})
          </p>
        )}
        <SidebarMenu />
        {isAdmin && (
          <div className="border-t border-gray-700 pt-4 mt-4 space-y-1">
            <Link href="/dashboard/settings" className="block rounded px-3 py-2 hover:bg-gray-800">
              ⚙ Settings
            </Link>
            <Link href="/dashboard/settings/print-requests" className="block rounded px-3 py-2 hover:bg-gray-800">
              🖨 Print Requests
            </Link>
          </div>
        )}
        <LogoutButton />
      </aside>
      <main className="flex-1 bg-gray-50 p-6 print:p-0 print:bg-white">{children}</main>
    </div>
  );
}