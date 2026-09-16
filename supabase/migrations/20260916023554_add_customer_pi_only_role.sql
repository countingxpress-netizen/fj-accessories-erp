-- নতুন role: 'customer_pi_only' — এই role-এর ইউজার শুধু নির্দিষ্ট এক কাস্টমারের
-- Proforma Invoice দেখতে ও এডিট করতে পারবে (নতুন PI তৈরি বা অন্য কোনো মডিউল না)।
-- restricted_customer_id বলে দেয় কোন কাস্টমারে সীমাবদ্ধ (admin/full_no_edit-এ NULL থাকবে)।
-- আসল restriction লজিক app কোডে (proxy.ts + PI পেজগুলো) — এটা শুধু ডেটা রাখার কলাম।

ALTER TABLE "public"."app_users" DROP CONSTRAINT "app_users_role_check";

ALTER TABLE "public"."app_users"
  ADD CONSTRAINT "app_users_role_check"
  CHECK (("role" = ANY (ARRAY['admin'::"text", 'full_no_edit'::"text", 'customer_pi_only'::"text"])));

ALTER TABLE "public"."app_users"
  ADD COLUMN "restricted_customer_id" "uuid" REFERENCES "public"."customers"("id");
