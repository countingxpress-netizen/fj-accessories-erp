"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (newPassword.length < 6) {
      setError("নতুন পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("নতুন পাসওয়ার্ড ও Confirm Password মিলছে না।");
      return;
    }

    setLoading(true);

    // আগে বর্তমান পাসওয়ার্ড দিয়ে যাচাই করুন (re-authenticate)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      setLoading(false);
      setError("ইউজার তথ্য পাওয়া যায়নি।");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email, password: currentPassword,
    });

    if (signInError) {
      setLoading(false);
      setError("বর্তমান পাসওয়ার্ড ভুল হয়েছে।");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-md">
      <div>
        <label className="block text-sm text-gray-600 mb-1">বর্তমান পাসওয়ার্ড</label>
        <input
          type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm" required
        />
      </div>
      <div>
        <label className="block text-sm text-gray-600 mb-1">নতুন পাসওয়ার্ড</label>
        <input
          type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm" required minLength={6}
        />
      </div>
      <div>
        <label className="block text-sm text-gray-600 mb-1">নতুন পাসওয়ার্ড আবার লিখুন</label>
        <input
          type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm" required minLength={6}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-700">✅ পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে।</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "পরিবর্তন হচ্ছে..." : "পাসওয়ার্ড পরিবর্তন করুন"}
      </button>
    </form>
  );
}