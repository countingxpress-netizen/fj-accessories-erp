import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/supabase/getCurrentAppUser";
import LogoutButton from "./LogoutButton";
import SidebarMenu from "./SidebarMenu";
import PermissionProvider from "./PermissionProvider";
import NavIcon from "./NavIcon";
import Link from "next/link";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const appUser = await getCurrentAppUser();
  const isAdmin = appUser?.role === "admin";

  return (
    <div className="flex min-h-screen">
      <aside className="print:hidden sticky top-0 h-screen w-64 shrink-0 overflow-y-auto border-r border-gray-800 bg-gray-900 text-white p-3 flex flex-col">
        <div className="flex items-center gap-2 px-2 py-2 mb-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-sm font-bold">FJ</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">F &amp; J ERP</p>
            {appUser && (
              <p className="truncate text-[11px] text-gray-400 leading-tight">
                {appUser.full_name} · {appUser.designation}
              </p>
            )}
          </div>
        </div>
        <SidebarMenu />
        <div className="mt-3 border-t border-gray-800 pt-3 space-y-0.5">
          {isAdmin && (
            <>
              <Link href="/dashboard/settings" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                <NavIcon name="settings" />
                <span>Settings</span>
              </Link>
              <Link href="/dashboard/settings/permission-requests" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                <NavIcon name="permissions" />
                <span>Permission Requests</span>
              </Link>
            </>
          )}
          <Link href="/dashboard/settings/change-password" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
            <NavIcon name="lock" />
            <span>Change Password</span>
          </Link>
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 bg-gray-50 p-6 print:p-0 print:bg-white">
        <PermissionProvider isAdmin={isAdmin} userId={appUser?.id ?? ""}>
          {children}
        </PermissionProvider>
      </main>
    </div>
  );
}