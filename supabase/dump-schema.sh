#!/usr/bin/env bash
# Docker ছাড়াই remote স্কিমা ডাম্প করে — মেশিনে `pg_dump` (PostgreSQL 17) থাকতে হবে।
#
#   Supabase CLI-র `db pull` / `db dump` একটা Docker কন্টেইনারে pg_dump চালায়।
#   Docker না থাকলে এই স্ক্রিপ্ট CLI-র `--dry-run` থেকে আসল pg_dump কমান্ডটা নিয়ে,
#   host-এর pg_dump দিয়ে সরাসরি চালায় (একটাই ফ্ল্যাগ patch করে:
#   CLI-র patched pg_dump `--quote-all-identifier` নেয়, আসলটা `--quote-all-identifiers`)।
#
# ব্যবহার:  npm run db:snapshot            # → supabase/migrations/<timestamp>_snapshot.sql
#           npm run db:snapshot baseline   # → supabase/migrations/<timestamp>_baseline.sql
#
# আগে `supabase login` + `supabase link` করা থাকতে হবে।

set -euo pipefail
cd "$(dirname "$0")/.."

name="${1:-snapshot}"
ts="$(date +%Y%m%d%H%M%S)"
out="supabase/migrations/${ts}_${name}.sql"

# PostgreSQL 17 bin PATH-এ না থাকলে সাধারণ Windows লোকেশন যোগ করি
if ! command -v pg_dump >/dev/null 2>&1; then
  export PATH="/c/Program Files/PostgreSQL/17/bin:${PATH}"
fi
command -v pg_dump >/dev/null 2>&1 || {
  echo "pg_dump পাওয়া গেল না। PostgreSQL 17 client ইনস্টল করে PATH-এ রাখুন।" >&2
  exit 1
}

echo "Fetching pg_dump script from Supabase CLI (dry-run)..." >&2
npx --yes supabase db dump --linked --dry-run 2>/dev/null \
  | sed -n '/^#!/,$p' \
  | sed 's/--quote-all-identifier /--quote-all-identifiers /' \
  > "/tmp/fj_dump_${ts}.sh"

echo "Running pg_dump → ${out}" >&2
bash "/tmp/fj_dump_${ts}.sh" > "${out}"
rm -f "/tmp/fj_dump_${ts}.sh"

lines="$(wc -l < "${out}")"
echo "Done: ${out} (${lines} lines)." >&2
echo "নতুন schema snapshot হলে পুরনো baseline migration সরিয়ে এটাকে baseline করুন," >&2
echo "নাহলে এটা delete করে শুধু ছোট incremental migration লিখুন।" >&2
