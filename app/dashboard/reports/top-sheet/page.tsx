import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/payroll";
import { getCurrentAppUser } from "@/lib/supabase/getCurrentAppUser";
import { buildTopSheetFromErp, type TopSheetData } from "@/lib/topSheet";
import TopSheetEditor from "./TopSheetEditor";
import AutoSubmitForm from "@/components/AutoSubmitForm";

// মাসিক টপশীট (চূড়ান্ত হিসাব) — হিসাবের নিয়ম lib/topSheet.ts-এ।
// সেভ করা শীট থাকলে সেটাই দেখায় (পরে ERP বদলালেও বদলায় না); ?fresh=1 দিলে ERP থেকে নতুন করে হিসাব —
// Confirm করা মাসে সবসময় সেভ করা শীট (Confirm / Un-confirm: lib/topSheetConfirm.ts)।
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

  const [{ data: savedRow, error: savedErr }, { data: company }, appUser] = await Promise.all([
    supabase.from("month_topsheets").select("data, saved_at, confirmed_at").eq("year", year).eq("month", month).maybeSingle(),
    supabase.from("company_profile").select("name, address, phone, email").limit(1).maybeSingle(),
    getCurrentAppUser(),
  ]);
  // confirm কলামের migration (20261004100000) চলার আগে — আগের মতো শুধু সেভ করা শীট
  const saved: { data: unknown; saved_at: string; confirmed_at?: string | null } | null = savedErr
    ? (await supabase.from("month_topsheets").select("data, saved_at").eq("year", year).eq("month", month).maybeSingle()).data
    : savedRow;

  const confirmedAt: string | null = saved?.confirmed_at ?? null;
  const useSaved = !!saved && (fresh !== "1" || !!confirmedAt);
  const data: TopSheetData = useSaved
    ? (saved!.data as TopSheetData)
    : await buildTopSheetFromErp(supabase, year, month);

  return (
    <div>
      <div className="print:hidden flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold">মাসিক টপশীট (চূড়ান্ত হিসাব)</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/dashboard/reports/top-sheet/confirmed" className="text-blue-700 hover:underline">Confirmed চূড়ান্ত হিসাব →</Link>
          <Link href="/dashboard/reports" className="text-gray-500 hover:underline">← Reports-এ ফিরুন</Link>
        </div>
      </div>
      <AutoSubmitForm className="print:hidden mb-3 flex items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">মাস</label>
          <input type="month" name="m" defaultValue={monthValue} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
      </AutoSubmitForm>

      <TopSheetEditor
        key={`${monthValue}-${useSaved ? saved!.saved_at : "fresh"}-${confirmedAt ?? ""}`}
        initial={data}
        savedAt={saved?.saved_at ?? null}
        showingSaved={useSaved}
        confirmedAt={confirmedAt}
        isAdmin={appUser?.role === "admin"}
        company={company ?? null}
      />
    </div>
  );
}
