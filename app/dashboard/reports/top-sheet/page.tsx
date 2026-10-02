import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/payroll";
import { buildTopSheetFromErp, type TopSheetData } from "@/lib/topSheet";
import TopSheetEditor from "./TopSheetEditor";

// মাসিক টপশীট (চূড়ান্ত হিসাব) — হিসাবের নিয়ম lib/topSheet.ts-এ।
// সেভ করা শীট থাকলে সেটাই দেখায় (পরে ERP বদলালেও বদলায় না); ?fresh=1 দিলে ERP থেকে নতুন করে হিসাব।
export default async function TopSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; fresh?: string }>;
}) {
  const { m, fresh } = await searchParams;
  const supabase = await createClient();

  const [ty, tm] = todayLocal().split("-").map(Number);
  // ডিফল্ট = আগের মাস (মাস শেষ হওয়ার পর টপশীট বানানো হয়)
  const defYear = tm === 1 ? ty - 1 : ty;
  const defMonth = tm === 1 ? 12 : tm - 1;
  const [year, month] = m && /^\d{4}-\d{2}$/.test(m) ? m.split("-").map(Number) : [defYear, defMonth];
  const monthValue = `${year}-${String(month).padStart(2, "0")}`;

  const [{ data: saved }, { data: company }] = await Promise.all([
    supabase.from("month_topsheets").select("data, saved_at").eq("year", year).eq("month", month).maybeSingle(),
    supabase.from("company_profile").select("name, address, phone, email").limit(1).maybeSingle(),
  ]);

  const useSaved = !!saved && fresh !== "1";
  const data: TopSheetData = useSaved
    ? (saved!.data as TopSheetData)
    : await buildTopSheetFromErp(supabase, year, month);

  return (
    <div>
      <div className="print:hidden flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold">মাসিক টপশীট (চূড়ান্ত হিসাব)</h1>
        <Link href="/dashboard/reports" className="text-sm text-gray-500 hover:underline">← Reports-এ ফিরুন</Link>
      </div>
      <form className="print:hidden mb-3 flex items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">মাস</label>
          <input type="month" name="m" defaultValue={monthValue} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">দেখুন</button>
      </form>

      <TopSheetEditor
        key={`${monthValue}-${useSaved ? saved!.saved_at : "fresh"}`}
        initial={data}
        savedAt={saved?.saved_at ?? null}
        showingSaved={useSaved}
        company={company ?? null}
      />
    </div>
  );
}
