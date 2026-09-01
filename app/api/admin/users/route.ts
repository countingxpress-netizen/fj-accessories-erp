import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/supabase/getCurrentAppUser";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const appUser = await getCurrentAppUser();
  if (appUser?.role !== "admin") {
    return NextResponse.json({ error: "Admin অনুমতি নেই।" }, { status: 403 });
  }

  const { email, password, full_name, designation, role } = await req.json();
  if (!email?.trim() || !password || !full_name?.trim()) {
    return NextResponse.json({ error: "Email, Password, নাম আবশ্যক।" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password অন্তত ৬ ক্যারেক্টার হতে হবে।" }, { status: 400 });
  }
  if (role !== "admin" && role !== "full_no_edit") {
    return NextResponse.json({ error: "Role ভুল।" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    return NextResponse.json({ error: createErr?.message ?? "User তৈরি করা যায়নি।" }, { status: 400 });
  }

  const { error: insertErr } = await admin.from("app_users").insert({
    id: created.user.id,
    full_name: full_name.trim(),
    designation: designation || null,
    role,
    is_active: true,
  });
  if (insertErr) {
    // auth user তৈরি হয়ে গেছে কিন্তু app_users row insert ব্যর্থ — rollback করে দিচ্ছি,
    // নাহলে login করা যাবে কিন্তু app_users না থাকায় অ্যাপের কোথাও অ্যাক্সেস পাবে না।
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: insertErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: created.user.id });
}
