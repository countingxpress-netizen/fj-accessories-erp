-- In-app User Management: শুধুমাত্র admin role-এর app_users যেন অন্য app_users
-- row-এর role/full_name/designation/is_active এডিট বা নতুন row insert করতে পারে
-- (service_role key ছাড়া নতুন auth login তৈরি করা যাচ্ছে না — Supabase Dashboard →
-- Authentication থেকে auth user তৈরি করার পর admin এখানে তার role/নাম বসাবে)।
--
-- Self-referencing EXISTS subquery নিরাপদ: authenticated_read_app_users (SELECT
-- policy) শুধু auth.role()='authenticated' চেক করে, app_users-এর ওপর রিকার্সিভ
-- নির্ভরতা নেই, তাই ইনফিনিট রিকার্সন হবে না।

CREATE POLICY "admin_write_app_users" ON "public"."app_users"
  FOR UPDATE TO "authenticated"
  USING (EXISTS (SELECT 1 FROM "public"."app_users" au WHERE au."id" = "auth"."uid"() AND au."role" = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM "public"."app_users" au WHERE au."id" = "auth"."uid"() AND au."role" = 'admin'));

CREATE POLICY "admin_insert_app_users" ON "public"."app_users"
  FOR INSERT TO "authenticated"
  WITH CHECK (EXISTS (SELECT 1 FROM "public"."app_users" au WHERE au."id" = "auth"."uid"() AND au."role" = 'admin'));
