import Link from "next/link";
import ChangePasswordForm from "./ChangePasswordForm";

export default function ChangePasswordPage() {
  return (
    <div>
      <Link href="/dashboard/settings" className="text-sm text-gray-500 hover:underline">← Settings-এ ফিরুন</Link>
      <h1 className="text-2xl font-semibold mt-2 mb-4">পাসওয়ার্ড পরিবর্তন করুন</h1>
      <ChangePasswordForm />
    </div>
  );
}