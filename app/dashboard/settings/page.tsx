import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/supabase/getCurrentAppUser";

export default async function SettingsPage() {
  const appUser = await getCurrentAppUser();

  if (appUser?.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Settings</h1>
      <p className="text-gray-600">
        শুধুমাত্র Admin (Md Masum Billah) এই পেজ দেখতে পাবেন।
        এখানে পরে Company Info Edit, User Management, Bank Info Edit ইত্যাদি যোগ হবে।
      </p>
    </div>
  );
}