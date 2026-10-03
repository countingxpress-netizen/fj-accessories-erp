import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money, qty } from "@/lib/format";
import { topSheetTotals, confirmedSheetName, type TopSheetData } from "@/lib/topSheetCalc";
import PrintButton from "@/app/dashboard/PrintButton";

// Confirmed চূড়ান্ত হিসাব — confirm করা প্রতিটা মাসিক টপশীট এক সারিতে ("09.September-2026"):
// লাভ/লস, কাঁচামাল স্টক (Lbs, প্রতি Lbs দর, মূল্য) ও Adhesive (কার্টন, মূল্য) — আলাদা কলামে।
// নাম-এ ক্লিক করলে ঐ মাসের টপশীট খোলে। Confirm / Un-confirm টপশীট পেজ থেকে (lib/topSheetConfirm.ts)।
export default async function ConfirmedTopSheetsPage() {
  const supabase = await createClient();
  const [{ data: rows, error }, { data: users }] = await Promise.all([
    supabase
      .from("month_topsheets")
      .select("year, month, data, confirmed_at, confirmed_by")
      .not("confirmed_at", "is", null)
      .order("year", { ascending: false })
      .order("month", { ascending: false }),
    supabase.from("app_users").select("id, full_name"),
  ]);
  const nameOf = new Map<string, string>((users ?? []).map((u: { id: string; full_name: string }) => [u.id, u.full_name]));

  const list = (rows ?? []).map((r) => {
    const t = topSheetTotals(r.data as TopSheetData);
    return {
      key: `${r.year}-${String(r.month).padStart(2, "0")}`,
      name: confirmedSheetName(r.year, r.month),
      profit: t.netProfit,
      lbs: t.closingLbs,
      rate: t.ratePerLbs,
      value: t.closingValue,
      adhCartons: Number((r.data as TopSheetData).adhesiveCartons) || 0,
      adhValue: t.adhesiveValue,
      confirmedAt: r.confirmed_at as string,
      confirmedBy: r.confirmed_by ? nameOf.get(r.confirmed_by) ?? "" : "",
    };
  });

  const excelRows: (string | number)[][] = [
    ["Confirmed চূড়ান্ত হিসাব"],
    [],
    ["মাস", "লাভ/লস", "স্টক Lbs", "প্রতি Lbs দর", "কাঁচামাল স্টক মূল্য", "Adhesive কার্টন", "Adhesive মূল্য", "Confirm তারিখ"],
    ...list.map((r) => [r.name, r.profit, r.lbs, r.rate, r.value, r.adhCartons, r.adhValue, r.confirmedAt.slice(0, 10)]),
  ];

  return (
    <div>
      <div className="print:hidden mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Confirmed চূড়ান্ত হিসাব</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/dashboard/reports/top-sheet" className="text-blue-700 hover:underline">মাসিক টপশীট →</Link>
          <Link href="/dashboard/reports" className="text-gray-500 hover:underline">← Reports-এ ফিরুন</Link>
        </div>
      </div>
      <p className="print:hidden mb-3 text-sm text-gray-500">
        Confirm করা মাসিক টপশীট — পরের মাসের Opening স্টক ও কাঁচামালের দর এখান থেকে আসে।
      </p>
      <PrintButton excelFilename="Confirmed-TopSheets" excelSheets={[{ name: "Confirmed", rows: excelRows }]} />

      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error.message}</p>}

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">মাস</th>
              <th className="px-4 py-2 text-right">লাভ / লস</th>
              <th className="px-4 py-2 text-right">স্টক Lbs</th>
              <th className="px-4 py-2 text-right">প্রতি Lbs দর</th>
              <th className="px-4 py-2 text-right">কাঁচামাল স্টক মূল্য</th>
              <th className="px-4 py-2 text-right">Adhesive (কার্টন)</th>
              <th className="px-4 py-2 text-right">Adhesive মূল্য</th>
              <th className="px-4 py-2">Confirm</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-3 text-gray-400 italic">এখনো কোনো মাস Confirm করা হয়নি — মাসিক টপশীট পেজে &quot;✔ Confirm (চূড়ান্ত)&quot; চাপুন।</td></tr>
            )}
            {list.map((r) => (
              <tr key={r.key} className="border-t">
                <td className="px-4 py-2 font-medium">
                  <Link href={`/dashboard/reports/top-sheet?m=${r.key}`} className="text-blue-700 hover:underline">{r.name}</Link>
                </td>
                <td className={`px-4 py-2 text-right font-semibold ${r.profit < 0 ? "text-red-700" : "text-green-700"}`}>
                  {r.profit < 0 ? `(${money(-r.profit)})` : money(r.profit)}
                </td>
                <td className="px-4 py-2 text-right">{qty(r.lbs)}</td>
                <td className="px-4 py-2 text-right">{money(r.rate)}</td>
                <td className="px-4 py-2 text-right">{money(r.value)}</td>
                <td className="px-4 py-2 text-right">{qty(r.adhCartons)}</td>
                <td className="px-4 py-2 text-right">{money(r.adhValue)}</td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {new Date(r.confirmedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                  {r.confirmedBy && <div>{r.confirmedBy}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
