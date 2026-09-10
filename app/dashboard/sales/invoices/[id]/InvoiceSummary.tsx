"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseNum(s: string): number | null {
  const t = (s || "").replace(/,/g, "").trim();
  if (t === "") return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

/** এডিটেবল সংখ্যা ঘর — না-ফোকাসে fmt() (কমা সহ), ফোকাসে raw, blur-এ commit। */
function NumCell({ value, onCommit }: { value: number; onCommit: (n: number | null) => void }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  return (
    <input
      inputMode="decimal"
      className="w-32 bg-transparent text-right outline-0 border-0 focus:bg-yellow-50 print:bg-transparent"
      value={focused ? draft : fmt(value)}
      onFocus={(e) => {
        setFocused(true);
        setDraft(value ? String(Math.round(value * 100) / 100) : "");
        requestAnimationFrame(() => e.currentTarget.select());
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setFocused(false); onCommit(parseNum(draft)); }}
    />
  );
}

/**
 * Sales Invoice প্রিন্টের নিচের শর্ট সামারি — Previous Bill Due / This Bill / Paid
 * সরাসরি এডিট করা যায়; blur-এ sales_invoices-এ সেভ হয় (খালি রাখলে অটো হিসাবে ফিরে যায়)।
 * Total Due = Prev + This Bill; Running Due = Total Due − Paid — সবসময় অটো।
 */
export default function InvoiceSummary({
  invoiceId, invoiceNo, previousLabel, lastPaymentDate,
  autoPrevDue, autoThisBill, autoPaid,
  savedPrevDue, savedThisBill, savedPaid, savedNote,
}: {
  invoiceId: string;
  invoiceNo: string;
  previousLabel: string;
  lastPaymentDate: string | null;
  autoPrevDue: number;
  autoThisBill: number;
  autoPaid: number;
  savedPrevDue: number | null;
  savedThisBill: number | null;
  savedPaid: number | null;
  savedNote: string | null;
}) {
  const [prevOv, setPrevOv] = useState<number | null>(savedPrevDue);
  const [billOv, setBillOv] = useState<number | null>(savedThisBill);
  const [paidOv, setPaidOv] = useState<number | null>(savedPaid);
  const supabase = createClient();

  const prev = prevOv ?? autoPrevDue;
  const bill = billOv ?? autoThisBill;
  const paid = paidOv ?? autoPaid;
  const totalDue = prev + bill;
  const runningDue = totalDue - paid;

  function save(field: string, n: number | null) {
    supabase.from("sales_invoices").update({ [field]: n }).eq("id", invoiceId).then(() => {});
  }

  return (
    <div className="mb-8 ml-auto max-w-sm">
      <table className="w-full border-collapse text-xs" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "52%" }} />
          <col style={{ width: "48%" }} />
        </colgroup>
        <tbody>
          <tr>
            <td className="py-1 pr-2 overflow-hidden text-ellipsis whitespace-nowrap">{previousLabel} Due =</td>
            <td className="py-1 text-right whitespace-nowrap">
              BDT <NumCell value={prev} onCommit={(n) => { setPrevOv(n); save("summary_prev_due", n); }} />
            </td>
          </tr>
          <tr>
            <td className="py-1 pr-2 overflow-hidden text-ellipsis whitespace-nowrap">This Bill-{invoiceNo} =</td>
            <td className="py-1 text-right whitespace-nowrap">
              BDT <NumCell value={bill} onCommit={(n) => { setBillOv(n); save("summary_this_bill", n); }} />
            </td>
          </tr>
          <tr className="border-t font-semibold">
            <td className="py-1 pr-2 whitespace-nowrap">Total Due =</td>
            <td className="py-1 pr-[2px] text-right whitespace-nowrap">BDT {fmt(totalDue)}</td>
          </tr>
          <tr>
            <td className="py-1 pr-2 overflow-hidden text-ellipsis whitespace-nowrap">
              Paid{lastPaymentDate ? ` on ${formatDate(lastPaymentDate)}` : ""} =
            </td>
            <td className="py-1 text-right whitespace-nowrap">
              BDT <NumCell value={paid} onCommit={(n) => { setPaidOv(n); save("summary_paid", n); }} />
            </td>
          </tr>
          <tr className="border-t-2 font-bold">
            <td className="py-1 pr-2 whitespace-nowrap">Running Due =</td>
            <td className="py-1 pr-[2px] text-right whitespace-nowrap">BDT {fmt(runningDue)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-3">
        <p className="mb-0.5 text-[11px] text-gray-500 print:hidden">Note (লিখলে ইনভয়েসে সেভ থাকবে):</p>
        <textarea
          rows={2}
          defaultValue={savedNote ?? ""}
          onBlur={(e) => {
            const v = e.target.value.trim();
            supabase.from("sales_invoices").update({ summary_note: v || null }).eq("id", invoiceId).then(() => {});
          }}
          className="w-full resize-none bg-transparent text-xs outline-0 border-b border-dashed border-gray-300 focus:bg-yellow-50 print:border-0"
          placeholder="…"
        />
      </div>
    </div>
  );
}
