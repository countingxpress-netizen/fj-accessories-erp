import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/supabase/getCurrentAppUser";
import CompanyProfileForm from "./CompanyProfileForm";
import BanksManager from "./BanksManager";

export default async function SettingsPage() {
  const appUser = await getCurrentAppUser();
  if (appUser?.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const { data: company } = await supabase.from("company_profile").select("*").limit(1).maybeSingle();
  const { data: banks } = await supabase.from("banks").select("*").order("bank_name");

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Link href="/dashboard/settings/change-password" className="text-sm text-blue-700 hover:underline">🔒 পাসওয়ার্ড পরিবর্তন</Link>
      </div>
      <p className="text-sm text-gray-500 mb-6">শুধুমাত্র Admin এই পেজ দেখতে পান।</p>

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">Company Info</h2>
        <p className="text-xs text-gray-500 mb-3">Invoice, Challan, PI ইত্যাদির হেডারে এই তথ্য ছাপা হয়।</p>
        <CompanyProfileForm company={company ?? null} />
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">Company Bank Accounts</h2>
        <p className="text-xs text-gray-500 mb-3">LC Register ও রপ্তানি কাগজপত্রে ব্যবহৃত ব্যাংক অ্যাকাউন্ট।</p>
        <BanksManager banks={banks ?? []} />
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">User Management</h2>
        <p className="text-sm text-gray-500">
          নতুন ইউজার যোগ / role পরিবর্তন এখনো এখানে নেই — Supabase Dashboard → Authentication থেকে ইউজার তৈরি করে
          <span className="font-mono text-xs"> app_users</span> টেবিলে <span className="font-mono text-xs">role</span> (<span className="font-mono text-xs">admin</span> / staff) বসাতে হয়।
        </p>
      </section>
    </div>
  );
}
