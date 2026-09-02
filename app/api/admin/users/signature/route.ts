import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/supabase/getCurrentAppUser";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function POST(req: Request) {
  const appUser = await getCurrentAppUser();
  if (appUser?.role !== "admin") {
    return NextResponse.json({ error: "Admin অনুমতি নেই।" }, { status: 403 });
  }

  const form = await req.formData();
  const id = form.get("id");
  const file = form.get("file");
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "User id দরকার।" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Signature ফাইল দরকার।" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "শুধু PNG/JPG/WEBP ছবি দেওয়া যাবে।" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "ছবির সাইজ ২MB-এর বেশি হতে পারবে না।" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const ext = file.name.split(".").pop() || "png";
  const path = `${id}-${Date.now()}.${ext}`;

  const { error: uploadErr } = await admin.storage
    .from("signatures")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 400 });
  }

  const { data: publicUrlData } = admin.storage.from("signatures").getPublicUrl(path);
  const signatureUrl = publicUrlData.publicUrl;

  const { error: updateErr } = await admin.from("app_users").update({ signature_url: signatureUrl }).eq("id", id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, signature_url: signatureUrl });
}
