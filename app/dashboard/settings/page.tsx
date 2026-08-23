import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/supabase/getCurrentAppUser";
import Link from "next/link";

export default async function SettingsPage() {
  const appUser = await getCurrentAppUser();

  if (appUser?.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Settings</h1>
      <div className="mt-4">
        <Link href="/dashboard/settings/change-password" className="inline-block rounded-lg border border-gray-900 px-4 py-2 text-sm text-gray-900">
          🔒 পাসওয়ার্ড পরিবর্তন করুন
        </Link>
      </div>
      <p className="text-gray-600">
        শুধুমাত্র Admin (Md Masum Billah) এই পেজ দেখতে পাবেন।
        এখানে পরে Company Info Edit, User Management, Bank Info Edit ইত্যাদি যোগ হবে।
      </p>
    </div>
  );
}