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

export async function PATCH(req: Request) {
  const appUser = await getCurrentAppUser();
  if (appUser?.role !== "admin") {
    return NextResponse.json({ error: "Admin অনুমতি নেই।" }, { status: 403 });
  }

  const { id, password } = await req.json();
  if (!id || !password) {
    return NextResponse.json({ error: "User id ও নতুন Password দরকার।" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password অন্তত ৬ ক্যারেক্টার হতে হবে।" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const appUser = await getCurrentAppUser();
  if (appUser?.role !== "admin") {
    return NextResponse.json({ error: "Admin অনুমতি নেই।" }, { status: 403 });
  }

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "User id দরকার।" }, { status: 400 });
  }
  if (id === appUser.id) {
    return NextResponse.json({ error: "নিজেকে ডিলিট করা যাবে না।" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { count: adminCount } = await admin
    .from("app_users")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  const { data: target } = await admin.from("app_users").select("role").eq("id", id).maybeSingle();
  if (target?.role === "admin" && (adminCount ?? 0) <= 1) {
    return NextResponse.json({ error: "শেষ Admin ইউজার ডিলিট করা যাবে না।" }, { status: 400 });
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(id);
  if (delErr) {
    // journal_vouchers/sales_invoices ইত্যাদি created_by হিসেবে এই ইউজারকে রেফার করলে
    // FK constraint delete আটকে দেয় (accounting history রক্ষার জন্য ইচ্ছাকৃত) — এক্ষেত্রে
    // Inactive করার পরামর্শ দিচ্ছি delete-এর বদলে।
    const isFkViolation = /foreign key|violates|constraint/i.test(delErr.message);
    return NextResponse.json({
      error: isFkViolation
        ? "এই ইউজার আগে কোনো Invoice/JV/ডকুমেন্ট তৈরি করেছেন বলে ডিলিট করা যাচ্ছে না (হিসাবের ইতিহাস রক্ষার জন্য)। এর বদলে Active টিক তুলে Inactive করে দিন।"
        : delErr.message,
    }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
