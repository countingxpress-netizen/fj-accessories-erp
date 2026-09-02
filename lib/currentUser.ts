import type { SupabaseClient } from "@supabase/supabase-js";

// "Created By" ট্র্যাক করার জন্য বর্তমান লগইন করা ইউজারের app_users.id বের করে —
// প্রতিটা ডকুমেন্ট তৈরির insert-এ created_by হিসেবে বসানো হয়। লগইন না থাকলে null।
export async function getCurrentUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}
