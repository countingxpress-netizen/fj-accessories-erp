import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todayDhaka } from "@/lib/salesByCustomer";
import PrintButton from "@/app/dashboard/PrintButton";
import { buildDayBook, type DbRow } from "@/lib/daybook";

// PDF-এর মতো: হাজার-গ্রুপিং (1,163,440.00), ঋণাত্মক প্যারেন্থেসিসে (133,268.00)
function fmt(n: number): string {
  const s = Math.abs(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${s})` : s;
}
const intFmt = (n: number) => Math.round(n || 0).toLocaleString("en-US");
const plain = (n: number) => String(Math.round(n || 0)); // PE- Lbs, গ্রুপিং ছাড়া

// তারিখ → DD.MM.YYYY (একদিন) / DD.MM.YYYY - DD.MM.YYYY (রেঞ্জ)
function dot(d: string) {
  const [y, m, dd] = d.split("-");
  return `${dd}.${m}.${y}`;
}

const bd = "border border-gray-500";
const cell = `${bd} px-2 py-[3px] align-top`;

function C({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`${cell} ${className}`}>{children}</td>;
}

/** জমা / খরচ কলাম — ৩ ঘর: হিসাবের নাম | বিবরন | টাকা */
function LedgerColumn({ title, rows, total, totalLabel }: { title: string; rows: DbRow[]; total: number; totalLabel: string }) {
  return (
    <table className="w-full border-collapse text-[12.5px] table-fixed">
      <colgroup>
        <col style={{ width: "40%" }} />
        <col style={{ width: "32%" }} />
        <col style={{ width: "28%" }} />
      </colgroup>
      <thead>
        <tr>
          <th colSpan={3} className={`${bd} py-1 text-center font-bold bg-gray-100`}>{title}</th>
        </tr>
        <tr className="bg-gray-50 text-gray-600">
          <th className={`${bd} px-2 py-[3px] text-left font-medium`}>হিসাবের নাম</th>
          <th className={`${bd} px-2 py-[3px] text-left font-medium`}>বিবরন</th>
          <th className={`${bd} px-2 py-[3px] text-right font-medium`}>টাকা</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <C>{r.name}</C>
            <C className="text-gray-500 text-[11px] break-words">{r.note}</C>
            <C className="text-right whitespace-nowrap">{fmt(r.amount)}</C>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <C className="text-gray-400 italic">—</C>
            <C />
            <C />
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr className="font-bold bg-gray-50">
          <C />
          <C className="text-right">{totalLabel}</C>
          <C className="text-right whitespace-nowrap">{fmt(total)}</C>
        </tr>
      </tfoot>
    </table>
  );
}

export default async function DayBookPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const from = sp.from || todayDhaka();
  const to = sp.to || from;

  const supabase = await createClient();
  const [{ data: company }, data] = await Promise.all([
    supabase.from("company_profile").select("name, address, phone, email").maybeSingle(),
    buildDayBook(supabase, from, to),
  ]);

  const dateText = data.singleDay ? dot(from) : `${dot(from)} - ${dot(to)}`;
  const subtotal = data.priorCash + data.jamaTotal + data.bikriAmount;
  const sealTotal = data.sideSealPcs + data.bottomSealPcs;

  return (
    <div className="max-w-4xl mx-auto print:max-w-none">
      {/* ── কন্ট্রোল বার (প্রিন্টে লুকানো) ── */}
      <div className="print:hidden">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">DayBook — দৈনিক জমা খরচের হিসাব</h1>
          <Link href="/dashboard/reports" className="text-sm text-gray-500 hover:underline">
            ← Reports-এ ফিরুন
          </Link>
        </div>
        <form className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">তারিখ (From)</label>
            <input type="date" name="from" defaultValue={from} className="rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To (একাধিক দিন হলে)</label>
            <input type="date" name="to" defaultValue={sp.to || ""} className="rounded-lg border px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">দেখুন</button>
          {(sp.from || sp.to) && (
            <Link href="/dashboard/reports/daybook" className="text-sm text-gray-500 hover:underline">রিসেট</Link>
          )}
        </form>
        <PrintButton />
        <p className="mb-4 text-xs text-gray-400">
          নগদ (Cash in Hand) বই। Bank ও আবু জাফর (3000) দিয়ে করা লেনদেন pass-through দেখানো —
          "ক্যাশ দেনা" = নগদ অ্যাকাউন্টের ঐ দিন শেষের ব্যালেন্স। বিক্রি = বাকিতে বিক্রি (নগদ বিক্রি জমায়)।
        </p>
      </div>

      {/* ── রিপোর্ট বডি (প্রিন্ট হয়) ── */}
      <div className="rounded-xl border bg-white shadow-sm p-6 text-gray-900 print:border-0 print:shadow-none print:p-0 print:text-[11px]">
        <div className="text-center mb-2">
          <h2 className="text-[28px] leading-tight font-bold tracking-wide">{company?.name ?? "F & J ACCESSORIES"}</h2>
          {company?.address && <p className="text-[11px] text-gray-700">{company.address}</p>}
          <p className="font-bold underline mt-1">দৈনিক জমা খরচের হিসাব</p>
        </div>

        <div className={`inline-block ${bd} px-3 py-1 text-[13px] mb-2 font-semibold`}>
          তারিখ ঃ-&nbsp;&nbsp;{dateText}
        </div>

        {/* ── জমা | খরচ ── */}
        <div className="grid grid-cols-2">
          <LedgerColumn title="জমা" rows={data.jama} total={data.jamaTotal} totalLabel="মোট জমা =" />
          <div className="-ml-px">
            <LedgerColumn title="খরচ" rows={data.khoroch} total={data.khorochTotal} totalLabel="মোট খরচ =" />
          </div>
        </div>

        {/* ── নিচের ব্লকগুলো ── */}
        <div className="grid grid-cols-2 gap-4 mt-4 items-start">
          {/* বাঁ দিক: বিক্রি → reconcile → স্টক */}
          <div className="space-y-4">
            {/* বিক্রি */}
            <table className="w-full border-collapse text-[12.5px] table-fixed">
              <colgroup>
                <col style={{ width: "40%" }} />
                <col style={{ width: "32%" }} />
                <col style={{ width: "28%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th colSpan={3} className={`${bd} py-1 text-center font-bold bg-gray-100`}>বিক্রি</th>
                </tr>
              </thead>
              <tbody>
                {data.bikri.map((b, i) => (
                  <tr key={i}>
                    <C>{b.name}</C>
                    <C className="text-gray-600">PE- {plain(b.lbs)}</C>
                    <C className="text-right whitespace-nowrap">{fmt(b.amount)}</C>
                  </tr>
                ))}
                {data.bikri.length === 0 && (
                  <tr>
                    <C className="text-gray-400 italic">—</C>
                    <C />
                    <C />
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="font-bold bg-gray-50">
                  <C className="text-right">মোট বিক্রি =</C>
                  <C>PE- {plain(data.bikriLbs)}</C>
                  <C className="text-right whitespace-nowrap">{fmt(data.bikriAmount)}</C>
                </tr>
              </tfoot>
            </table>

            {/* Reconciliation */}
            <table className="w-full border-collapse text-[12.5px] table-fixed">
              <colgroup>
                <col style={{ width: "62%" }} />
                <col style={{ width: "38%" }} />
              </colgroup>
              <tbody>
                <tr><C>মোট জমা =</C><C className="text-right whitespace-nowrap">{fmt(data.jamaTotal)}</C></tr>
                <tr><C>বিক্রি =</C><C className="text-right whitespace-nowrap">{fmt(data.bikriAmount)}</C></tr>
                <tr><C>সাবেক ক্যাশ দেনা =</C><C className="text-right whitespace-nowrap">{fmt(data.priorCash)}</C></tr>
                <tr className="font-medium"><C /><C className="text-right whitespace-nowrap">{fmt(subtotal)}</C></tr>
                <tr><C>(-) খরচ =</C><C className="text-right whitespace-nowrap">{fmt(data.khorochTotal)}</C></tr>
                <tr className="font-bold bg-yellow-50">
                  <C>ক্যাশ দেনা =</C>
                  <C className="text-right whitespace-nowrap">{fmt(data.cashPosition)}</C>
                </tr>
              </tbody>
            </table>

            {/* কাঁচামাল স্টক */}
            <table className="w-full border-collapse text-[12.5px] table-fixed">
              <colgroup>
                <col style={{ width: "44%" }} />
                <col style={{ width: "36%" }} />
                <col style={{ width: "20%" }} />
              </colgroup>
              <tbody>
                <tr><C>স্টক ছিলো</C><C className="text-right whitespace-nowrap">{fmt(data.stockOpening)}</C><C>এলবিএস</C></tr>
                <tr><C>ক্রয়</C><C className="text-right whitespace-nowrap">{data.stockPurchaseLbs ? fmt(data.stockPurchaseLbs) : ""}</C><C>এলবিএস</C></tr>
                <tr><C>খরচ</C><C className="text-right whitespace-nowrap">{data.stockSoldLbs ? fmt(data.stockSoldLbs) : ""}</C><C>এলবিএস</C></tr>
                <tr className="font-bold bg-gray-50"><C>স্টক আছে</C><C className="text-right whitespace-nowrap">{fmt(data.stockClosing)}</C><C>এলবিএস</C></tr>
              </tbody>
            </table>
          </div>

          {/* ডান দিক: সিলিং → বাঁকি */}
          <div className="space-y-4">
            {/* সিলিং */}
            <table className="w-full border-collapse text-[12.5px] table-fixed">
              <colgroup>
                <col style={{ width: "60%" }} />
                <col style={{ width: "40%" }} />
              </colgroup>
              <tbody>
                <tr><C>সাইড সিলিং</C><C className="text-right whitespace-nowrap">{intFmt(data.sideSealPcs)}</C></tr>
                <tr><C>বটম সিলিং</C><C className="text-right whitespace-nowrap">{intFmt(data.bottomSealPcs)}</C></tr>
                <tr className="font-bold bg-gray-50"><C>মোট</C><C className="text-right whitespace-nowrap">{intFmt(sealTotal)}</C></tr>
              </tbody>
            </table>

            {/* পার্টি বাঁকি */}
            <table className="w-full border-collapse text-[12.5px] table-fixed">
              <colgroup>
                <col style={{ width: "50%" }} />
                <col style={{ width: "50%" }} />
              </colgroup>
              <tbody>
                <tr><C>বাঁকি ছিলো</C><C className="text-right whitespace-nowrap">{fmt(data.arOpening)}</C></tr>
                <tr><C>বাঁকি বিক্রি</C><C className="text-right whitespace-nowrap">{fmt(data.arBikri)}</C></tr>
                <tr><C>পার্টি জমা</C><C className="text-right whitespace-nowrap">{fmt(data.arPartyJama)}</C></tr>
                <tr className="font-bold bg-gray-50"><C>বাঁকি আছে</C><C className="text-right whitespace-nowrap">{fmt(data.arClosing)}</C></tr>
              </tbody>
            </table>

            <p className="text-[10px] text-gray-400 leading-snug">
              সিলিং = ঐ দিনে cutting-সম্পন্ন Pcs · simple/gusset → বটম, বাকি → সাইড।
              বিবরন-এ "+" মানে একাধিক এন্ট্রির যোগফল।
            </p>
          </div>
        </div>

        <p className="mt-4 text-[10px] text-gray-400 print:mt-6">
          তৈরি: {dot(todayDhaka())} · উৎস: ERP journal voucher + sales invoice + stock + production
        </p>
      </div>
    </div>
  );
}
