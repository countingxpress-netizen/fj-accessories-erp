# Legacy migrations (CLI চালুর আগে)

এই `Doc*.sql` ফাইলগুলো `Doc2` → `Doc14` ক্রমে **হাতে** Supabase Dashboard → SQL Editor-এ
চালানো হয়েছিল (2026-08-26 → 2026-08-29)। সবগুলো **প্রোডাকশনে প্রয়োগ করা** — আর চালাবেন না।

এখন থেকে স্কিমা পরিবর্তন `../migrations/` + Supabase CLI দিয়ে হবে — `../README.md` দেখুন।

| ফাইল | কী করেছিল |
|---|---|
| `Doc2_migration_2026-08-26.sql` | Purchase Entry: cash/credit, import/local + LC ফিল্ড, Bags/Lbs ইউনিট; `warehouse_transfers` টেবিল; `buyers.markup_percentage` |
| `Doc3_rls_fix_warehouse_transfers.sql` | `warehouse_transfers`-এর RLS policy ঠিক করা |
| `Doc4_pi_markup_pricing_rule.sql` | PI pricing rule: "rate/Lbs + markup%" |
| `Doc5_pi_form_enhancements_2026-08-28.sql` | PI ফর্মের অতিরিক্ত ফিল্ড |
| `Doc6_pi_item_description_2026-08-28.sql` | `pi_items.description` |
| `Doc7_customer_code_2026-08-28.sql` | `customers.code` (PI নম্বরের জন্য) + case-insensitive unique index |
| `Doc8_at_buyer_pi_rules_2026-08-28.sql` | AT Accessories buyer-দের PI rule (batch 1) |
| `Doc9_pi_items_thickness_2026-08-28.sql` | `pi_items`-এ thickness কলাম |
| `Doc10_at_buyer_pi_rules_batch2_2026-08-29.sql` | AT buyer PI rule (batch 2) |
| `Doc11_hm_masud_recycled_surcharge_2026-08-29.sql` | HM Masud recycled surcharge |
| `Doc12_pi_price_decimals_2026-08-29.sql` | PI দামে দশমিক নির্ভুলতা |
| `Doc13_payroll_salary_engine_2026-08-29.sql` | `salary_sheet` কলাম (salary engine); attendance `comments`; overtime rate optional |
| `Doc14_payroll_revisions_bonus_2026-08-29.sql` | `salary_revisions` টেবিল; `bonus_sheet` টেবিল (`voucher_id` → journal_vouchers); `salary_sheet` proration কলাম |
