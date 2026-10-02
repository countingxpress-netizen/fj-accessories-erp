"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/currentUser";
import { money, qty } from "@/lib/format";
import PrintButton from "@/app/dashboard/PrintButton";
import {
  LBS_PER_BAG,
  topSheetTotals,
  type TopSheetData,
  type TsRow,
  type TsLbsRow,
} from "@/lib/topSheet";

const BN_MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const bnDigits = (s: string | number) => String(s).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);
const shortYear = (y: number) => bnDigits(String(y).slice(2));
const plRound = (n: number) => (Math.abs(n) < 0.005 ? 0 : n);
/** ঋণাত্মক হলে Excel-এর মতো (1,234.00) */
const signedMoney = (n: number) => (plRound(n) < 0 ? `(${money(-n)})` : money(n));

const bd = "border border-gray-700";

// ── এডিটযোগ্য সংখ্যা: ফোকাসে কাঁচা সংখ্যা, বাইরে ফরম্যাট করা; প্রিন্টে সাধারণ লেখার মতো ──
function Num({
  value,
  onChange,
  format = money,
  className = "",
}: {
  value: number;
  onChange: (n: number) => void;
  format?: (n: number) => string;
  className?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      value={text ?? format(value)}
      onFocus={(e) => { setText(String(value)); requestAnimationFrame(() => e.target.select()); }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = Number((text ?? "").replace(/[,\s]/g, ""));
        if (text !== null && text.trim() !== "" && Number.isFinite(n)) onChange(n);
        setText(null);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      inputMode="decimal"
      className={`w-full min-w-0 bg-transparent text-right outline-none hover:bg-yellow-50 focus:bg-yellow-100 print:hover:bg-transparent ${className}`}
    />
  );
}

function Txt({ value, onChange, className = "" }: { value: string; onChange: (s: string) => void; className?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full min-w-0 bg-transparent outline-none hover:bg-yellow-50 focus:bg-yellow-100 print:hover:bg-transparent ${className}`}
    />
  );
}

function C({ children, className = "", colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={`${bd} px-1.5 py-[3px] align-middle ${className}`}>{children}</td>;
}

function DelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title="সারি মুছুন" className="print:hidden ml-1 text-red-400 hover:text-red-700 text-xs leading-none">✕</button>
  );
}

function AddBtn({ onClick, label = "+ সারি" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="print:hidden text-xs text-blue-600 hover:underline">{label}</button>
  );
}

type ListKey = "parties" | "liabilities" | "otherAssets" | "expenses";
type LbsListKey = "made" | "unmade";

export default function TopSheetEditor({
  initial,
  savedAt,
  showingSaved,
  company,
}: {
  initial: TopSheetData;
  savedAt: string | null;
  showingSaved: boolean;
  company: { name?: string | null; address?: string | null; phone?: string | null; email?: string | null } | null;
}) {
  const router = useRouter();
  const [d, setD] = useState<TopSheetData>(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const t = useMemo(() => topSheetTotals(d), [d]);

  const monthName = BN_MONTHS[d.month - 1];
  const prevMonthName = BN_MONTHS[(d.month + 10) % 12];
  const prevYear = d.month === 1 ? d.year - 1 : d.year;
  const monthParam = `${d.year}-${String(d.month).padStart(2, "0")}`;

  function update(fn: (x: TopSheetData) => TopSheetData) {
    setD((x) => fn(structuredClone(x)));
    setDirty(true);
  }
  const setRow = (k: ListKey, i: number, patch: Partial<TsRow>) =>
    update((x) => { x[k][i] = { ...x[k][i], ...patch }; return x; });
  const delRow = (k: ListKey, i: number) => update((x) => { x[k].splice(i, 1); return x; });
  const addRow = (k: ListKey) => update((x) => { x[k].push({ label: "", amount: 0 }); return x; });
  const setLbsRow = (k: LbsListKey, i: number, patch: Partial<TsLbsRow>) =>
    update((x) => { x[k][i] = { ...x[k][i], ...patch }; return x; });
  const delLbsRow = (k: LbsListKey, i: number) => update((x) => { x[k].splice(i, 1); return x; });
  const addLbsRow = (k: LbsListKey) => update((x) => { x[k].push({ label: "", lbs: 0 }); return x; });

  async function save() {
    setError("");
    setSaving(true);
    const supabase = createClient();
    const savedBy = await getCurrentUserId(supabase);
    const { error: err } = await supabase.from("month_topsheets").upsert(
      { year: d.year, month: d.month, data: d, saved_by: savedBy, saved_at: new Date().toISOString() },
      { onConflict: "year,month" },
    );
    setSaving(false);
    if (err) { setError(err.message); return; }
    setDirty(false);
    router.replace(`/dashboard/reports/top-sheet?m=${monthParam}`);
    router.refresh();
  }

  function reloadFromErp() {
    if (dirty && !window.confirm("হাতে করা পরিবর্তনগুলো বাদ দিয়ে ERP থেকে নতুন করে হিসাব আনবেন?")) return;
    router.push(`/dashboard/reports/top-sheet?m=${monthParam}&fresh=1`);
  }

  const profitWord = (n: number) => (plRound(n) < 0 ? "লস" : "লাভ");

  // ── Excel ──
  const excelRows: (string | number)[][] = [
    [company?.name ?? "F & J ACCESSORIES"],
    [`চূড়ান্ত হিসাব ${monthName} - ${d.year}`],
    [],
    ["পাওনা + বাঁকি", ""],
    ...d.parties.map((r) => [r.label, r.amount]),
    ["মোট বাঁকি", t.partyTotal],
    [],
    ["দেনা", ""],
    ...d.liabilities.map((r) => [r.label, r.amount]),
    ["মোট দেনা", t.liabilityTotal],
    [],
    ["অন্যান্য পাওনা", ""],
    ["মোট বাঁকি", t.partyTotal],
    ...d.otherAssets.map((r) => [r.label, r.amount]),
    ["মোট পাওনা", t.receivableTotal],
    ["স্টক", t.stockTotal],
    ["মোট পাওনা (স্টক সহ)", t.grandReceivable],
    ["মোট দেনা", t.liabilityTotal],
    [profitWord(t.balanceProfit), t.balanceProfit],
    ["লিল্লাহ ফান্ড", t.lillah],
    [`ওমর ফারুক ${profitWord(t.omar)}`, t.omar],
    [],
    ["খরচ", ""],
    ...d.expenses.map((r) => [r.label, r.amount]),
    ["মোট খরচ", t.expenseTotal],
    [],
    ["বিবরণ", "এল বি এস", "টাকা"],
    [`${prevMonthName}-${shortYear(prevYear)} স্টক`, d.opening.lbs, d.opening.amount],
    [`${monthName}-${shortYear(d.year)} ক্রয়`, d.purchase.lbs, d.purchase.amount],
    ["মোট ক্রয়", t.inLbs, t.inAmount],
    [`${monthName}-${shortYear(d.year)} স্টক (বর্তমান)`, t.closingLbs, t.closingValue],
    [`${monthName} মাসের বিক্রি`, d.sales.lbs, d.sales.amount],
    ["কাঁচামাল সরাসরি বিক্রি", d.rmSale.lbs, d.rmSale.amount],
    [`${monthName} মাসের ওয়েস্টেজ বিক্রি`, t.wastageLbs, d.wastageSaleAmount],
    ["মোট", t.outLbs, t.outAmount],
    ["প্রাথমিক লাভ", "", t.grossProfit],
    ["মোট খরচ", "", t.expenseTotal],
    [`মোট ${profitWord(t.netProfit)}`, "", t.netProfit],
    [`পাওনা দেনা হিসেবে ${profitWord(t.balanceProfit)}`, "", t.balanceProfit],
    [],
    ["স্টক বিবরণ", "আছে (ব্যাগ)", "এম কে (ব্যাগ)", "মোট ব্যাগ", "এল বি এস"],
    ...d.materials.map((m) => [m.name, m.ownBags, m.mkBags, m.ownBags + m.mkBags, Math.round((m.ownBags + m.mkBags) * LBS_PER_BAG)]),
    ...d.made.map((r) => [`বানানো আছে — ${r.label}`, "", "", "", r.lbs]),
    ...d.unmade.map((r) => [`বানানো বাকি — ${r.label}`, "", "", "", -r.lbs]),
    ["মোট", "", "", "", t.closingLbs],
    ["প্রতি এল বি এস ক্রয় মূল্য", t.ratePerLbs],
    ["স্টক মূল্য", t.closingValue],
    ["এডহেসিভ (কার্টুন × দর)", d.adhesiveCartons, d.adhesiveRate, t.adhesiveValue],
    ["মোট স্টক", t.stockTotal],
  ];

  return (
    <div>
      {/* ── অবস্থা + বাটন (প্রিন্ট হয় না) ── */}
      <div className="print:hidden mb-3 flex flex-wrap items-center gap-3 text-sm">
        {showingSaved ? (
          <span className="rounded-full bg-green-100 px-3 py-1 text-green-800">
            ✔ সেভ করা শীট — {savedAt ? new Date(savedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : ""}
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">
            {savedAt ? "ERP থেকে নতুন হিসাব (আগের সেভ করা শীট এখনো বহাল — সেভ করলে প্রতিস্থাপিত হবে)" : "ERP থেকে হিসাব — এখনো সেভ করা হয়নি"}
          </span>
        )}
        {dirty && <span className="text-amber-700">● সেভ না করা পরিবর্তন আছে</span>}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={reloadFromErp} className="rounded-lg border px-4 py-2 hover:bg-gray-50">↻ ERP থেকে নতুন করে</button>
          <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-blue-700 px-5 py-2 text-white disabled:opacity-50">
            {saving ? "সেভ হচ্ছে..." : "💾 সেভ (মাস ক্লোজ)"}
          </button>
        </div>
      </div>
      {error && <p className="print:hidden mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <p className="print:hidden mb-3 text-xs text-gray-500">
        হলুদ হয়ে ওঠা যেকোনো ঘরে ক্লিক করে নাম/সংখ্যা বদলানো যায়। সেভ করলে পুরো শীট এই মাসের জন্য জমা থাকে, আর পরের মাসের
        &quot;আগের মাসের স্টক&quot; এখান থেকে আসে।
      </p>
      <PrintButton excelFilename={`TopSheet-${monthParam}`} excelSheets={[{ name: "TopSheet", rows: excelRows }]} />

      <div className="bg-white text-gray-900 text-[12px] leading-tight print:text-[10.5px]">
        {/* ══════════ পেজ ১ ══════════ */}
        <div className="text-center mb-1">
          <div className="flex items-center justify-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/branding/logo.png" alt="" className="h-12 w-12 object-contain" />
            <h2 className="text-[30px] font-bold tracking-[0.15em] text-[#1f3a5f] font-mono">{company?.name ?? "F & J ACCESSORIES"}</h2>
          </div>
          {company?.address && <p className="font-mono text-[11px]">{company.address}</p>}
          {(company?.phone || company?.email) && (
            <p className="font-mono text-[11px]">
              {company?.phone && <>Contact No: - {company.phone}</>}
              {company?.phone && company?.email && <>&nbsp;&nbsp;&nbsp;&nbsp;</>}
              {company?.email && <>Email: - {company.email}</>}
            </p>
          )}
        </div>
        <div className={`${bd} border-2 text-center font-bold text-[14px] py-0.5`}>
          চূড়ান্ত হিসাব {monthName} - {bnDigits(d.year)}
        </div>

        <div className="grid grid-cols-[36%_34%_30%] items-start">
          {/* ── পাওনা + বাঁকি ── */}
          <table className="w-full border-collapse table-fixed">
            <colgroup><col style={{ width: "58%" }} /><col style={{ width: "42%" }} /></colgroup>
            <thead><tr><th colSpan={2} className={`${bd} border-2 py-0.5`}>পাওনা + বাঁকি</th></tr></thead>
            <tbody>
              {d.parties.map((r, i) => (
                <tr key={i}>
                  <C><div className="flex"><Txt value={r.label} onChange={(v) => setRow("parties", i, { label: v })} /><DelBtn onClick={() => delRow("parties", i)} /></div></C>
                  <C><Num value={r.amount} onChange={(v) => setRow("parties", i, { amount: v })} /></C>
                </tr>
              ))}
              <tr className="print:hidden"><C colSpan={2}><AddBtn onClick={() => addRow("parties")} /></C></tr>
              <tr className="font-bold">
                <C className="text-center border-2">মোট বাঁকি =</C>
                <C className="text-right border-2">{money(t.partyTotal)}</C>
              </tr>
            </tbody>
          </table>

          {/* ── দেনা + পাওনা-দেনা সারাংশ ── */}
          <table className="w-full border-collapse table-fixed -ml-px">
            <colgroup><col style={{ width: "56%" }} /><col style={{ width: "44%" }} /></colgroup>
            <thead><tr><th colSpan={2} className={`${bd} border-2 py-0.5`}>দেনা</th></tr></thead>
            <tbody>
              {d.liabilities.map((r, i) => (
                <tr key={i}>
                  <C><div className="flex"><Txt value={r.label} onChange={(v) => setRow("liabilities", i, { label: v })} /><DelBtn onClick={() => delRow("liabilities", i)} /></div></C>
                  <C><Num value={r.amount} onChange={(v) => setRow("liabilities", i, { amount: v })} /></C>
                </tr>
              ))}
              <tr className="print:hidden"><C colSpan={2}><AddBtn onClick={() => addRow("liabilities")} /></C></tr>
              <tr className="font-bold">
                <C className="text-right border-2">মোট দেনা =</C>
                <C className="text-right border-2 bg-yellow-200">{money(t.liabilityTotal)}</C>
              </tr>
              <tr><td colSpan={2} className="h-3" /></tr>
              <tr className="font-bold">
                <C className="text-center border-2">মোট বাঁকি =</C>
                <C className="text-right border-2">{money(t.partyTotal)}</C>
              </tr>
              {d.otherAssets.map((r, i) => (
                <tr key={i}>
                  <C><div className="flex"><Txt value={r.label} onChange={(v) => setRow("otherAssets", i, { label: v })} /><DelBtn onClick={() => delRow("otherAssets", i)} /></div></C>
                  <C><Num value={r.amount} onChange={(v) => setRow("otherAssets", i, { amount: v })} /></C>
                </tr>
              ))}
              <tr className="print:hidden"><C colSpan={2}><AddBtn onClick={() => addRow("otherAssets")} /></C></tr>
              <tr className="font-bold">
                <C className="text-right">মোট পাওনা =</C>
                <C className="text-right bg-yellow-200">{money(t.receivableTotal)}</C>
              </tr>
              <tr className="font-bold">
                <C>স্টক =</C>
                <C className="text-right bg-yellow-200">{money(t.stockTotal)}</C>
              </tr>
              <tr className="font-bold">
                <C className="text-right">মোট পাওনা =</C>
                <C className="text-right bg-yellow-200">{money(t.grandReceivable)}</C>
              </tr>
              <tr className="font-bold">
                <C className="text-right">মোট দেনা =</C>
                <C className="text-right bg-yellow-200">{money(t.liabilityTotal)}</C>
              </tr>
              <tr className="font-bold">
                <C className="text-right">{profitWord(t.balanceProfit)} =</C>
                <C className="text-right bg-yellow-200">{signedMoney(t.balanceProfit)}</C>
              </tr>
              <tr className="font-bold">
                <C>
                  <span className="whitespace-nowrap">লিল্লাহ ফান্ড</span>
                  <span className="print:hidden ml-1 inline-flex w-12 align-middle text-[10px] font-normal text-gray-500">
                    <Num value={d.lillahPct} format={(n) => `${qty(n)}%`} onChange={(v) => update((x) => { x.lillahPct = v; return x; })} />
                  </span>
                </C>
                <C className="text-right bg-yellow-200">{t.lillah ? money(t.lillah) : "-"}</C>
              </tr>
              <tr className="font-bold">
                <C className="text-right">ওমর ফারুক {profitWord(t.omar)} =</C>
                <C className="text-right bg-yellow-200">{signedMoney(t.omar)}</C>
              </tr>
            </tbody>
          </table>

          {/* ── খরচ ── */}
          <table className="w-full border-collapse table-fixed -ml-px">
            <colgroup><col style={{ width: "54%" }} /><col style={{ width: "46%" }} /></colgroup>
            <thead><tr><th colSpan={2} className={`${bd} border-2 py-0.5`}>খরচ</th></tr></thead>
            <tbody>
              {d.expenses.map((r, i) => (
                <tr key={i}>
                  <C><div className="flex"><Txt value={r.label} onChange={(v) => setRow("expenses", i, { label: v })} /><DelBtn onClick={() => delRow("expenses", i)} /></div></C>
                  <C><Num value={r.amount} onChange={(v) => setRow("expenses", i, { amount: v })} /></C>
                </tr>
              ))}
              <tr className="print:hidden"><C colSpan={2}><AddBtn onClick={() => addRow("expenses")} /></C></tr>
              <tr className="font-bold">
                <C className="border-2">মোট খরচ =</C>
                <C className="text-right border-2">{money(t.expenseTotal)}</C>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── প্রাথমিক লাভ টেবিল ── */}
        {d.opening.source === "erp" && (
          <p className="print:hidden mt-4 mx-auto w-[64%] rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ⚠ আগের মাসের কোনো সেভ করা টপশীট নেই — &quot;{prevMonthName} স্টক&quot;-এর Lbs ও টাকা ERP-র স্টক লেজার ও
            হিসাব-খাতা থেকে নেওয়া। হাতের আগের শীটের সাথে একবার মিলিয়ে নিন (সেভ করার পর পরের মাস থেকে আর লাগবে না)।
          </p>
        )}
        <table className="mt-4 mx-auto w-[64%] border-collapse table-fixed">
          <colgroup><col style={{ width: "46%" }} /><col style={{ width: "24%" }} /><col style={{ width: "30%" }} /></colgroup>
          <thead>
            <tr className="font-bold">
              <th className={`${bd} border-2 py-0.5`}>বিবরণ</th>
              <th className={`${bd} border-2 py-0.5`}>এল বি এস</th>
              <th className={`${bd} border-2 py-0.5`}>টাকা</th>
            </tr>
          </thead>
          <tbody className="font-bold">
            <tr>
              <C>{prevMonthName}-{shortYear(prevYear)} স্টক =</C>
              <C><Num value={d.opening.lbs} format={qty} onChange={(v) => update((x) => { x.opening.lbs = v; return x; })} className="bg-yellow-200" /></C>
              <C><Num value={d.opening.amount} onChange={(v) => update((x) => { x.opening.amount = v; return x; })} className="bg-yellow-200" /></C>
            </tr>
            <tr>
              <C>{monthName}-{shortYear(d.year)} ক্রয় =</C>
              <C><Num value={d.purchase.lbs} format={qty} onChange={(v) => update((x) => { x.purchase.lbs = v; return x; })} /></C>
              <C><Num value={d.purchase.amount} onChange={(v) => update((x) => { x.purchase.amount = v; return x; })} /></C>
            </tr>
            <tr>
              <C>মোট ক্রয় =</C>
              <C className="text-right">{qty(t.inLbs)} LBS</C>
              <C className="text-right">{money(t.inAmount)}</C>
            </tr>
            <tr>
              <C>{monthName}-{shortYear(d.year)} স্টক (বর্তমান) =</C>
              <C className="text-right">{qty(t.closingLbs)} LBS</C>
              <C className="text-right">{money(t.closingValue)}</C>
            </tr>
            <tr>
              <C>{monthName} মাসের বিক্রি =</C>
              <C><Num value={d.sales.lbs} format={qty} onChange={(v) => update((x) => { x.sales.lbs = v; return x; })} /></C>
              <C><Num value={d.sales.amount} onChange={(v) => update((x) => { x.sales.amount = v; return x; })} /></C>
            </tr>
            <tr>
              <C>কাঁচামাল সরাসরি বিক্রি =</C>
              <C><Num value={d.rmSale.lbs} format={qty} onChange={(v) => update((x) => { x.rmSale.lbs = v; return x; })} /></C>
              <C><Num value={d.rmSale.amount} onChange={(v) => update((x) => { x.rmSale.amount = v; return x; })} /></C>
            </tr>
            <tr>
              <C className="text-[11px]">{monthName} মাসের ওয়েস্টেজ বিক্রি =</C>
              <C className="text-right">{qty(t.wastageLbs)} LBS</C>
              <C><Num value={d.wastageSaleAmount} onChange={(v) => update((x) => { x.wastageSaleAmount = v; return x; })} /></C>
            </tr>
            <tr>
              <C className="text-right">মোট =</C>
              <C className="text-right">{qty(t.outLbs)} LBS</C>
              <C className="text-right">{money(t.outAmount)}</C>
            </tr>
            <tr><C className="text-right">প্রাথমিক লাভ =</C><C /><C className="text-right bg-yellow-200">{signedMoney(t.grossProfit)}</C></tr>
            <tr><C className="text-right">মোট খরচ =</C><C /><C className="text-right bg-yellow-200">{money(t.expenseTotal)}</C></tr>
            <tr><C className="text-right">মোট {profitWord(t.netProfit)} =</C><C /><C className="text-right bg-yellow-200">{signedMoney(t.netProfit)}</C></tr>
            <tr><td colSpan={3} className="h-2" /></tr>
            <tr>
              <C colSpan={2} className="text-center border-2">পাওনা দেনা হিসেবে {profitWord(t.balanceProfit)} =</C>
              <C className="text-right border-2 bg-yellow-200">{signedMoney(t.balanceProfit)}</C>
            </tr>
            {Math.abs(t.difference) >= 1 && (
              <tr className="text-red-700">
                <C colSpan={2} className="text-center">দুই হিসাবের পার্থক্য =</C>
                <C className="text-right">{signedMoney(t.difference)}</C>
              </tr>
            )}
          </tbody>
        </table>
        <p className="print:hidden mt-1 mx-auto w-[64%] text-[11px] text-gray-500">
          তুলনা: ERP-এর নিজস্ব হিসাবে (Income − Expense, moving-average COGS) এই মাসের {profitWord(d.erpNetProfit)} = {signedMoney(d.erpNetProfit)}
        </p>

        {/* ══════════ পেজ ২ — স্টক বিবরণ ══════════ */}
        <div className="mt-10 print:mt-0 print:break-before-page">
          <div className={`${bd} border-2 text-center font-bold text-[14px] py-0.5 underline`}>স্টক বিবরণ</div>
          <table className="w-full border-collapse table-fixed -mt-px">
            <colgroup>
              <col style={{ width: "30%" }} /><col style={{ width: "17%" }} /><col style={{ width: "17%" }} />
              <col style={{ width: "17%" }} /><col style={{ width: "19%" }} />
            </colgroup>
            <thead>
              <tr className="font-bold">
                <th className={`${bd} py-0.5`}>কাঁচামাল</th>
                <th className={`${bd} py-0.5`}>আছে (ব্যাগ)</th>
                <th className={`${bd} py-0.5`}>+ এম কে (ব্যাগ)</th>
                <th className={`${bd} py-0.5`}>মোট (ব্যাগ)</th>
                <th className={`${bd} py-0.5`}>এল বি এস</th>
              </tr>
            </thead>
            <tbody>
              {d.materials.map((m, i) => (
                <tr key={i}>
                  <C>
                    <div className="flex">
                      <Txt value={m.name} onChange={(v) => update((x) => { x.materials[i].name = v; return x; })} />
                      <DelBtn onClick={() => update((x) => { x.materials.splice(i, 1); return x; })} />
                    </div>
                  </C>
                  <C><Num value={m.ownBags} format={qty} onChange={(v) => update((x) => { x.materials[i].ownBags = v; return x; })} className="bg-yellow-200" /></C>
                  <C><Num value={m.mkBags} format={qty} onChange={(v) => update((x) => { x.materials[i].mkBags = v; return x; })} /></C>
                  <C className="text-right">{qty(m.ownBags + m.mkBags)}</C>
                  <C className="text-right">{qty(Math.round((m.ownBags + m.mkBags) * LBS_PER_BAG))}</C>
                </tr>
              ))}
              <tr className="print:hidden">
                <C colSpan={5}><AddBtn onClick={() => update((x) => { x.materials.push({ name: "", ownBags: 0, mkBags: 0 }); return x; })} /></C>
              </tr>
              <tr className="font-bold">
                <C className="text-right">মোট =</C>
                <C className="text-right">{qty(t.ownBags)}</C>
                <C className="text-right">{qty(t.mkBags)}</C>
                <C className="text-right">{qty(t.ownBags + t.mkBags)}</C>
                <C className="text-right bg-yellow-200">{qty(Math.round((t.ownBags + t.mkBags) * LBS_PER_BAG))}</C>
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-[11px]">এম কে থেকে পাওনা = {qty(Math.round(t.mkBags * LBS_PER_BAG))} এল বি এস</p>

          <div className="mt-4 grid grid-cols-2 gap-6 items-start">
            {(["made", "unmade"] as const).map((k) => (
              <table key={k} className="w-full border-collapse table-fixed">
                <colgroup><col style={{ width: "60%" }} /><col style={{ width: "40%" }} /></colgroup>
                <thead>
                  <tr><th colSpan={2} className={`${bd} py-0.5`}>{k === "made" ? "বানানো আছে (+ এল বি এস)" : "বানানো বাকি (− এল বি এস)"}</th></tr>
                </thead>
                <tbody>
                  {d[k].map((r, i) => (
                    <tr key={i}>
                      <C><div className="flex"><Txt value={r.label} onChange={(v) => setLbsRow(k, i, { label: v })} /><DelBtn onClick={() => delLbsRow(k, i)} /></div></C>
                      <C><Num value={r.lbs} format={qty} onChange={(v) => setLbsRow(k, i, { lbs: v })} /></C>
                    </tr>
                  ))}
                  <tr className="print:hidden"><C colSpan={2}><AddBtn onClick={() => addLbsRow(k)} /></C></tr>
                  <tr className="font-bold">
                    <C className="text-right">মোট =</C>
                    <C className="text-right">{qty(k === "made" ? t.madeLbs : t.unmadeLbs)}</C>
                  </tr>
                </tbody>
              </table>
            ))}
          </div>

          <table className="mt-4 w-[60%] border-collapse table-fixed">
            <colgroup><col style={{ width: "40%" }} /><col style={{ width: "20%" }} /><col style={{ width: "15%" }} /><col style={{ width: "25%" }} /></colgroup>
            <thead>
              <tr className="font-bold">
                <th className={`${bd} py-0.5`} /><th className={`${bd} py-0.5`}>পরিমাণ</th>
                <th className={`${bd} py-0.5`}>দর</th><th className={`${bd} py-0.5`}>মূল্য</th>
              </tr>
            </thead>
            <tbody className="font-bold">
              <tr>
                <C>কাঁচামাল (ব্যাগ) =</C>
                <C className="text-right">{qty(Math.round((t.ownBags + t.mkBags) * LBS_PER_BAG))}</C><C /><C />
              </tr>
              <tr>
                <C>বানানো আছে − বাকি =</C>
                <C className="text-right">{qty(t.madeLbs - t.unmadeLbs)}</C><C /><C />
              </tr>
              <tr className="bg-yellow-100">
                <C>মোট এল বি এস =</C>
                <C className="text-right">{qty(t.closingLbs)}</C>
                <C className="text-right">{money(t.ratePerLbs)}</C>
                <C className="text-right">{money(t.closingValue)}</C>
              </tr>
              <tr>
                <C>এডহেসিভ (কার্টুন) =</C>
                <C><Num value={d.adhesiveCartons} format={qty} onChange={(v) => update((x) => { x.adhesiveCartons = v; return x; })} className="bg-yellow-200" /></C>
                <C><Num value={d.adhesiveRate} onChange={(v) => update((x) => { x.adhesiveRate = v; return x; })} /></C>
                <C className="text-right">{money(t.adhesiveValue)}</C>
              </tr>
              <tr>
                <C colSpan={3} className="text-center">মোট স্টক =</C>
                <C className="text-right">{money(t.stockTotal)}</C>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-[12px] font-semibold">
            প্রতি এল বি এস ক্রয় মূল্য <span className="ml-2 bg-yellow-200 px-3">{money(t.ratePerLbs)}</span>
            <span className="ml-2 font-normal text-[11px] text-gray-500">= (আগের স্টক + ক্রয়) টাকা ÷ (আগের স্টক + ক্রয়) এল বি এস</span>
          </p>
        </div>
      </div>
    </div>
  );
}
