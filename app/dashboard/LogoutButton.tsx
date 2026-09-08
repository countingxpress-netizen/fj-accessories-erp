"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import NavIcon from "./NavIcon";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
    >
      <NavIcon name="logout" />
      <span>Logout</span>
    </button>
  );
}
