-- Settings পেজের দুইটা silent bug ঠিক করা হলো (RLS-এ write policy না থাকায়
-- UPDATE/INSERT কোনো error ছাড়াই ০ rows affected হয়ে সেভ না হয়ে যাচ্ছিল):
--
-- 1) company_profile: শুধু SELECT policy ছিল (authenticated_read_company),
--    INSERT/UPDATE policy কখনোই ছিল না — Company Info ফর্ম কখনো সেভ হতোই না।
-- 2) banks: RLS enabled কিন্তু কোনো policy-ই ছিল না (SELECT-ও ব্লক ছিল) —
--    Company Bank Accounts লিস্ট সবসময় খালি দেখাতো এবং যোগ করা যেত না।
--
-- বাকি টেবিলের established pattern (auth.role() = 'authenticated') অনুসরণ করা হলো।

CREATE POLICY "auth_write_company_profile" ON "public"."company_profile"
  FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = 'authenticated'::"text"));

CREATE POLICY "auth_update_company_profile" ON "public"."company_profile"
  FOR UPDATE TO "authenticated"
  USING (("auth"."role"() = 'authenticated'::"text"))
  WITH CHECK (("auth"."role"() = 'authenticated'::"text"));

CREATE POLICY "auth_full_access_banks" ON "public"."banks"
  USING (("auth"."role"() = 'authenticated'::"text"))
  WITH CHECK (("auth"."role"() = 'authenticated'::"text"));
