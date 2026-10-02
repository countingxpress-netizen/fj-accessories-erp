"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { hourlyRate, monthRange, todayLocal } from "@/lib/payroll";
import { postPayrollAccrual, postPayrollPayment, reversePayrollJv } from "@/lib/payrollJv";
import { money } from "@/lib/format";
import { formatDate } from "@/lib/formatDate";
import { amountInWordsLac } from "@/lib/numberToWords";
import { downloadExcel } from "@/lib/exportExcel";
import GuardedAction from "@/app/dashboard/GuardedAction";

// এক মাসের Salary Sheet — Excel salary sheet-এর মতো টেবিল।
//   দেখা   : Sl | Name | Joining | Designation | Basic | Absent(ঘণ্টা) | OT(ঘণ্টা) | OT/সমন্বয় ৳ | অন্যান্য | Total | Advance | Payable
//            ("অন্যান্য" = হাতে বসানো অতিরিক্ত টাকা, যেমন হাজিরা বোনাস — DB কলাম attendance_bonus।
//             other_deduction কলাম আর দেখানো/এডিট হয় না, তবে হিসাবে এখনো বাদ যায়।)
//   এডিট   : Unpaid সারির Basic / Absent / OT / সমন্বয় / অন্যান্য / Advance বদলানো যায়।
//            Total = Basic + সমন্বয় + অন্যান্য।
//            Production কর্মীর Absent/OT/Basic বদলালে সমন্বয় নিজে হিসাব হয়:
//            round(Basic/26/8 × (OT − Absent)), তারপর Total নিকটতম ১০ টাকায় রাউন্ড।
//            সেভে salary_sheet আপডেট + পুরনো accrual JV মুছে নতুন accrual JV।
//   প্রিন্ট : A4 landscape, স্বাক্ষরের কলাম + নিচে স্বাক্ষরের লাইন।

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type Row = any;
type Account = { id: string; account_code: string; account_name: string };
type Edit = { basic: string; absH: string; otH: string; adj: string; bonus: string; advance: string; other: string };

const num = (v: unknown) => Number(v) || 0;

function autoAdj(basic: number, otH: number, absH: number): number {
  const total = Math.round((basic + Math.round(hourlyRate(basic) * (otH - absH))) / 10) * 10;
  return total - basic;
}

export default function SalarySheetView({
  year, month, rows, company, cashBankAccounts,
}: {
  year: number; month: number; rows: Row[]; company: any; cashBankAccounts: Account[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const label = `${monthNames[month]} ${year}`;
  const { end: monthEnd } = monthRange(year, month);

  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [payAccountId, setPayAccountId] = useState(cashBankAccounts[0]?.id ?? "");
  const [payDate, setPayDate] = useState(todayLocal());
  const [busyId, setBusyId] = useState<string | null>(null);

  const initEdit = (r: Row): Edit => ({
    basic: String(num(r.basic)), absH: String(num(r.absent_hours)), otH: String(num(r.ot_hours)),
    adj: String(num(r.net_adjustment)), bonus: String(num(r.attendance_bonus)),
    advance: String(num(r.advance)), other: String(num(r.other_deduction)),
  });

  // সারির বর্তমান মান (এডিট চললে এডিটের মান)
  const view = (r: Row) => {
    const e = editing ? edits[r.id] : undefined;
    const basic = e ? num(e.basic) : num(r.basic);
    const absH = e ? num(e.absH) : num(r.absent_hours);
    const otH = e ? num(e.otH) : num(r.ot_hours);
    const adj = e ? num(e.adj) : num(r.net_adjustment);
    const bonus = e ? num(e.bonus) : num(r.attendance_bonus);
    const advance = e ? num(e.advance) : num(r.advance);
    const other = e ? num(e.other) : num(r.other_deduction);
    const total = basic + adj + bonus;
    return { basic, absH, otH, adj, bonus, advance, other, total, payable: total - advance - other };
  };

  const isDirty = (r: Row) => {
    const e = edits[r.id];
    if (!e) return false;
    const o = initEdit(r);
    return (Object.keys(o) as (keyof Edit)[]).some((k) => num(e[k]) !== num(o[k]));
  };
  const dirtyCount = editing ? rows.filter(isDirty).length : 0;

  const totals = useMemo(() => {
    const t = { basic: 0, absH: 0, otH: 0, adj: 0, bonus: 0, total: 0, advance: 0, other: 0, payable: 0 };
    rows.forEach((r) => {
      const v = view(r);
      t.basic += v.basic; t.absH += v.absH; t.otH += v.otH; t.adj += v.adj; t.bonus += v.bonus;
      t.total += v.total; t.advance += v.advance; t.other += v.other; t.payable += v.payable;
    });
    return t;
  }, [rows, edits, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit() {
    const m: Record<string, Edit> = {};
    rows.forEach((r) => { m[r.id] = initEdit(r); });
    setEdits(m);
    setMessage("");
    setEditing(true);
  }
  function cancelEdit() {
    if (dirtyCount > 0 && !window.confirm(`${dirtyCount}টা সারির পরিবর্তন বাদ দেবেন?`)) return;
    setEditing(false);
    setEdits({});
  }
  function change(r: Row, field: keyof Edit, value: string) {
    setEdits((prev) => {
      const e = { ...prev[r.id], [field]: value };
      // Production: Basic / Absent / OT বদলালে সমন্বয় নতুন করে হিসাব
      if (r.salary_type === "production" && (field === "basic" || field === "absH" || field === "otH")) {
        e.adj = String(autoAdj(num(e.basic), num(e.otH), num(e.absH)));
      }
      return { ...prev, [r.id]: e };
    });
  }

  async function saveEdits() {
    const changed = rows.filter((r) => !r.paid && isDirty(r));
    if (changed.length === 0) { setEditing(false); return; }
    setSaving(true);
    setError("");
    try {
      for (const r of changed) {
        const v = view(r);
        const prod = r.salary_type === "production";
        const rate = prod ? hourlyRate(v.basic) : 0;
        const { error: upErr } = await supabase.from("salary_sheet").update({
          basic: v.basic,
          ot_hours: prod ? v.otH : 0,
          absent_hours: prod ? v.absH : 0,
          absent_days: prod ? Math.ceil(v.absH / 8) : 0,
          hourly_rate: Math.round(rate * 100) / 100,
          overtime_amount: Math.round(rate * (prod ? v.otH : 0)),
          absent_deduction: Math.round(rate * (prod ? v.absH : 0)),
          net_adjustment: v.adj,
          attendance_bonus: v.bonus,
          advance: v.advance,
          other_deduction: v.other,
          deductions: v.advance + v.other,
          net_salary: v.payable,
        }).eq("id", r.id);
        if (upErr) throw new Error(`${r.employees?.name}: ${upErr.message}`);

        // accrual JV নতুন করে
        await reversePayrollJv(supabase, r.accrual_voucher_id, { table: "salary_sheet", column: "accrual_voucher_id", id: r.id });
        const jv = await postPayrollAccrual(supabase, {
          date: monthEnd,
          narration: `Salary accrual — ${r.employees?.employee_code} ${r.employees?.name} — ${label}`,
          memo: `Salary ${label}`,
          gross: v.total, netSalary: v.payable, advance: v.advance, otherDeduction: v.other,
        });
        if (jv) await supabase.from("salary_sheet").update({ accrual_voucher_id: jv }).eq("id", r.id);
      }
      setMessage(`✅ ${changed.length}টা সারি সেভ হয়েছে (accrual JV আপডেট)।`);
      setEditing(false);
      setEdits({});
      router.refresh();
    } catch (err: any) {
      setError(err.message || "সেভ করা যায়নি");
    } finally {
      setSaving(false);
    }
  }

  async function markPaid(list: Row[]) {
    if (!payAccountId || list.length === 0) return;
    const total = list.reduce((s, r) => s + num(r.net_salary), 0);
    if (!window.confirm(`${list.length} জনের মোট ${money(total)} টাকা পরিশোধ হিসেবে লিখবেন? (তারিখ ${formatDate(payDate)})`)) return;
    setBusyId(list.length === 1 ? list[0].id : "all");
    setError("");
    for (const r of list) {
      const voucherId = await postPayrollPayment(supabase, {
        date: payDate,
        narration: `Salary paid to ${r.employees?.name} — ${label}`,
        amount: num(r.net_salary),
        memo: `Salary ${label}`,
        depositAccountId: payAccountId,
      });
      if (voucherId) await supabase.from("salary_sheet").update({ paid: true, voucher_id: voucherId }).eq("id", r.id);
    }
    setBusyId(null);
    router.refresh();
  }

  async function deleteRow(r: Row) {
    if (!window.confirm(`${r.employees?.name}-এর ${label} বেতন মুছবেন? (accrual + payment JV-ও মুছে যাবে)`)) return;
    setBusyId(r.id);
    await supabase.from("salary_sheet").delete().eq("id", r.id);
    await reversePayrollJv(supabase, r.voucher_id);
    await reversePayrollJv(supabase, r.accrual_voucher_id);
    setBusyId(null);
    router.refresh();
  }

  function exportExcel() {
    const head = ["Sl", "Name", "Joining Date", "Designation", "Basic", "Absent (Hrs)", "OT (Hrs)", "OT/Adj (Tk)", "Others", "Total", "Advance", "Payable", "Status"];
    const body = rows.map((r, i) => {
      const v = view(r);
      return [i + 1, r.employees?.name, r.employees?.join_date ? formatDate(r.employees.join_date) : "", r.employees?.designation ?? "",
        v.basic, v.absH, v.otH, v.adj, v.bonus, v.total, v.advance, v.payable, r.paid ? "Paid" : "Unpaid"];
    });
    body.push(["", "Total", "", "", totals.basic, totals.absH, totals.otH, totals.adj, totals.bonus, totals.total, totals.advance, totals.payable, ""]);
    downloadExcel(`Salary-Sheet-${label.replace(" ", "-")}`, [{ name: label, rows: [[`Salary Sheet — ${label}`], [], head, ...body] }]);
  }

  const unpaid = rows.filter((r) => !r.paid);
  const inp = "w-16 rounded border px-1 py-0.5 text-right text-xs";

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm print:border-0 print:p-0 print:shadow-none">
      <style>{`@page { size: A4 landscape; }`}</style>

      {/* কন্ট্রোল */}
      <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
        {editing ? (
          <>
            <button onClick={saveEdits} disabled={saving} className="rounded-lg bg-green-600 px-4 py-1.5 text-sm text-white disabled:opacity-40">
              {saving ? "সেভ হচ্ছে..." : `সেভ করুন${dirtyCount ? ` (${dirtyCount})` : ""}`}
            </button>
            <button onClick={cancelEdit} className="rounded-lg border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">বাতিল</button>
            <span className="text-xs text-gray-500">Paid সারি এডিট করা যায় না। "অন্যান্য" ঘরে হাজিরা বোনাস ইত্যাদি বসান। Production কর্মীর Basic/Absent/OT বদলালে OT/সমন্বয় নিজে হিসাব হয় (Total ১০ টাকায় রাউন্ড) — চাইলে হাতে বদলাতে পারবেন।</span>
          </>
        ) : (
          <>
            <button onClick={startEdit} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white">Edit</button>
            <button onClick={() => window.print()} className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm text-white">🖨 Print</button>
            <button onClick={exportExcel} className="rounded-lg bg-green-700 px-4 py-1.5 text-sm text-white">📊 Excel</button>
            {unpaid.length > 0 && (
              <span className="ml-auto flex items-center gap-1 text-xs">
                পরিশোধ:
                <select value={payAccountId} onChange={(e) => setPayAccountId(e.target.value)} className="rounded border px-1 py-1 text-xs">
                  {cashBankAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                </select>
                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="rounded border px-1 py-1 text-xs" />
                <button onClick={() => markPaid(unpaid)} disabled={!!busyId || !payAccountId}
                  className="rounded bg-green-50 px-2 py-1 text-green-700 hover:bg-green-100 disabled:opacity-40">
                  সব Unpaid Paid করুন ({unpaid.length})
                </button>
              </span>
            )}
          </>
        )}
      </div>
      {error && <p className="mb-2 text-sm text-red-600 print:hidden">{error}</p>}
      {message && <p className="mb-2 text-sm text-green-700 print:hidden">{message}</p>}

      {/* হেডার */}
      <div className="mb-3 flex items-center justify-center gap-3 border-b pb-2">
        {company?.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={company.logo_url} alt="Logo" className="h-12 w-12 object-contain" />
        )}
        <div className="text-center">
          <h2 className="text-xl font-bold">{company?.name ?? "F & J Accessories"}</h2>
          {company?.address && <p className="text-xs text-gray-600">{company.address}</p>}
        </div>
      </div>
      <h3 className="mb-2 text-center text-base font-semibold">Salary Sheet — {label}</h3>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs [&_td]:border [&_td]:px-1.5 [&_td]:py-1 [&_th]:border [&_th]:px-1.5 [&_th]:py-1">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th rowSpan={2}>Sl.</th>
              <th rowSpan={2} className="text-left">Name</th>
              <th rowSpan={2}>Joining Date</th>
              <th rowSpan={2} className="text-left">Designation</th>
              <th rowSpan={2} className="text-right">Basic</th>
              <th rowSpan={2} className="text-right">Absent (ঘণ্টা)</th>
              <th colSpan={2}>Overtime</th>
              <th rowSpan={2} className="text-right">অন্যান্য</th>
              <th rowSpan={2} className="text-right">Total Amount</th>
              <th rowSpan={2} className="text-right">Advance</th>
              <th rowSpan={2} className="text-right">Payable Amount</th>
              <th rowSpan={2} className="print:hidden">Status</th>
              <th rowSpan={2} className="hidden w-24 print:table-cell">Signature</th>
            </tr>
            <tr>
              <th className="text-right">ঘণ্টা</th>
              <th className="text-right">টাকা</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const v = view(r);
              const prod = r.salary_type === "production";
              const canEdit = editing && !r.paid;
              const e = edits[r.id];
              return (
                <tr key={r.id} className={editing && isDirty(r) ? "bg-amber-50" : ""}>
                  <td className="text-center">{i + 1}</td>
                  <td className="whitespace-nowrap">{r.employees?.name}</td>
                  <td className="text-center whitespace-nowrap">{r.employees?.join_date ? formatDate(r.employees.join_date) : ""}</td>
                  <td className="whitespace-nowrap">{r.employees?.designation ?? ""}</td>
                  <td className="text-right">
                    {canEdit ? <input type="number" value={e.basic} onChange={(ev) => change(r, "basic", ev.target.value)} className={inp} /> : money(v.basic)}
                  </td>
                  <td className="text-right">
                    {!prod ? "" : canEdit ? <input type="number" step="0.5" value={e.absH} onChange={(ev) => change(r, "absH", ev.target.value)} className={inp} /> : (v.absH || "")}
                  </td>
                  <td className="text-right">
                    {!prod ? "" : canEdit ? <input type="number" step="0.5" value={e.otH} onChange={(ev) => change(r, "otH", ev.target.value)} className={inp} /> : (v.otH || "")}
                  </td>
                  <td className={`text-right ${v.adj < 0 ? "text-red-600" : ""}`}>
                    {canEdit ? <input type="number" value={e.adj} onChange={(ev) => change(r, "adj", ev.target.value)} className={inp} /> : (v.adj ? money(v.adj) : "")}
                  </td>
                  <td className="text-right">
                    {canEdit ? <input type="number" value={e.bonus} onChange={(ev) => change(r, "bonus", ev.target.value)} className={inp} /> : (v.bonus ? money(v.bonus) : "")}
                  </td>
                  <td className="text-right font-medium">{money(v.total)}</td>
                  <td className="text-right">
                    {canEdit ? <input type="number" value={e.advance} onChange={(ev) => change(r, "advance", ev.target.value)} className={inp} /> : (v.advance ? money(v.advance) : "")}
                  </td>
                  <td className="text-right font-semibold">{money(v.payable)}</td>
                  <td className="whitespace-nowrap text-center print:hidden">
                    {r.paid ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] text-green-700">Paid</span>
                    ) : editing ? (
                      <GuardedAction table="salary_sheet" recordId={r.id} recordLabel={`${r.employees?.name ?? ""} ${label}`} action="delete"
                        onAllowed={() => deleteRow(r)} disabled={!!busyId}
                        className="rounded bg-red-50 px-2 py-0.5 text-[11px] text-red-700 hover:bg-red-100">মুছুন</GuardedAction>
                    ) : (
                      <button onClick={() => markPaid([r])} disabled={!!busyId || !payAccountId}
                        className="rounded bg-green-50 px-2 py-0.5 text-[11px] text-green-700 hover:bg-green-100 disabled:opacity-40">Mark Paid</button>
                    )}
                  </td>
                  <td className="hidden print:table-cell"></td>
                </tr>
              );
            })}
            {/* মোট — tfoot নয়: প্রিন্টে tfoot প্রতি পাতায় রিপিট হয়, তাই প্রথম পাতার নিচেও
                পুরো শিটের মোট বসে যেত। সাধারণ শেষ সারি হলে শুধু শেষ পাতায় একবার আসে। */}
            <tr className="break-inside-avoid bg-gray-100 font-semibold">
              <td colSpan={4} className="text-right">Total Amount</td>
              <td className="text-right">{money(totals.basic)}</td>
              <td className="text-right">{totals.absH || ""}</td>
              <td className="text-right">{totals.otH || ""}</td>
              <td className="text-right">{money(totals.adj)}</td>
              <td className="text-right">{totals.bonus ? money(totals.bonus) : ""}</td>
              <td className="text-right">{money(totals.total)}</td>
              <td className="text-right">{money(totals.advance)}</td>
              <td className="text-right">{money(totals.payable)}</td>
              <td className="print:hidden" />
              <td className="hidden print:table-cell" />
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs">
        <span className="font-semibold">Amount (In words):</span> {amountInWordsLac(totals.payable)}
      </p>

      <div className="mt-14 hidden grid-cols-4 gap-8 text-center text-xs print:grid">
        {["Prepared By", "Checked By", "Accounts", "Approved By"].map((s) => (
          <div key={s} className="border-t border-gray-700 pt-1">{s}</div>
        ))}
      </div>
    </div>
  );
}
