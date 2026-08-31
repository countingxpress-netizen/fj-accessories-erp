# Database schema & migrations

এতদিন ডেটাবেজ স্কিমা শুধু Supabase ড্যাশবোর্ডে ছিল — version control ছিল না।
এখন স্কিমার **source of truth** = `supabase/migrations/`।

| ফাইল / ফোল্ডার | কী |
|---|---|
| `config.toml` | লোকাল CLI কনফিগ (প্রজেক্ট `fj-accessories-erp`, Postgres 17) |
| `migrations/00000000000000_baseline.sql` | **বর্তমান পুরো স্কিমার স্ন্যাপশট** — ৫৮ টেবিল, ৫১ RLS policy, function, constraint, default সব। যেকোনো নতুন DB এখান থেকে হুবহু বানানো যায়। |
| `seed.sql` | শুধু ডেভ/টেস্ট DB-র জন্য ন্যূনতম ডেটা |
| `dump-schema.sh` | Docker ছাড়া স্কিমা ডাম্প করার হেল্পার (`npm run db:snapshot`) |
| `legacy-migrations/` | CLI চালুর আগের `Doc2`–`Doc14` (প্রোডাকশনে **ইতিমধ্যে প্রয়োগ করা**, শুধু ইতিহাস) |

## অবস্থা (2026-08-31)

- ✅ `supabase login` + `supabase link` — প্রজেক্ট linked (ref `kwsdvehjqzgmxlqevxjl`)
- ✅ baseline স্কিমা ডাম্প করা ও `supabase/migrations/`-এ রাখা
- ✅ baseline প্রোডাকশন migration history-তে `applied` হিসেবে রেজিস্টার করা
  (`migration list` লোকাল ও remote দুই দিকেই `00000000000000` দেখায়)
- ✅ `npm run db:push --dry-run` → *"Remote database is up to date"*

মানে schema এখন সম্পূর্ণ version-controlled ও reproducible।

## এরপর থেকে স্কিমা বদলানোর নিয়ম

ড্যাশবোর্ডের SQL editor-এ সরাসরি `ALTER TABLE` চালানো **বন্ধ**। এর বদলে:

```bash
npm run migration:new add_salary_payable_account
# → supabase/migrations/<timestamp>_add_salary_payable_account.sql-এ SQL লিখুন
npm run db:push          # শুধু নতুন migration প্রোডাকশনে প্রয়োগ করে
```

`db:push` সরাসরি remote-এ কানেক্ট করে — **Docker লাগে না**।

## npm scripts

| script | কাজ | Docker লাগে? |
|---|---|---|
| `npm run migration:new <name>` | খালি timestamped migration ফাইল | না |
| `npm run db:push` | pending migration প্রোডাকশনে প্রয়োগ | না |
| `npm run migration:list` | লোকাল vs remote migration history | না |
| `npm run db:snapshot [name]` | পুরো remote স্কিমা → নতুন migration ফাইল (`dump-schema.sh`, host pg_dump দিয়ে) | না (pg_dump লাগে) |
| `npm run db:pull` | remote আর local-এর পার্থক্য → migration ফাইল (auto-diff) | **হ্যাঁ** |
| `npm run db:diff` | লোকাল shadow-এর সাথে diff | **হ্যাঁ** |

`db:pull` / `db:diff` একটা shadow database বানায় (Docker Desktop দরকার)। Docker না থাকলে:
হাতে `migration:new` + SQL লিখুন, অথবা drift ধরতে `db:snapshot` দিয়ে নতুন পুরো ডাম্প নিন।

## নতুন environment / DB scratch থেকে বানাতে

```bash
supabase link --project-ref <new-ref>
supabase db push        # baseline + সব migration প্রয়োগ করবে
```

## legacy Doc*.sql

`legacy-migrations/`-এর ফাইলগুলো `Doc2` → `Doc14` ক্রমে হাতে চালানো হয়েছিল, সব
প্রোডাকশনে প্রয়োগ করা — **আর চালাবেন না**। এদের সব পরিবর্তন baseline-এ ধরা আছে।
বিস্তারিত: `legacy-migrations/README.md`।
