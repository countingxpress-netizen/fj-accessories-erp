import { createClient as createAdminClient } from "@supabase/supabase-js";

// Service-role client — server-side only, never import from a "use client" file.
// Bypasses RLS entirely, so every caller MUST verify admin access itself first.
export function createAdminSupabaseClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
