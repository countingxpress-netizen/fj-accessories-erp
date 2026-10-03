"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import {
  hourlyRate, salaryTypeOf, effectiveBasic, monthRange, ymdLocal, todayLocal, type SalaryRevision,
} from "@/lib/payroll";
import { formatDate } from "@/lib/formatDate";

// Attendance — Date Range ফিল্টার (Today / Yesterday / This Month / Previous Month / Custom Range)।
//   Today  → এক দিনের তালিকা: Employee | Department | Designation | Attendance | OT | Comment
//   বাকি   → গ্রিড: সারিতে কর্মী, "Attendance"-এর নিচে প্রতি তারিখে একটা কলাম
// দুই ভিউই ডিফল্ট শুধু-দেখা; "Edit" চাপলে প্রতিটা ঘর dropdown/ইনপুট হয়ে যায়।
// সেভে শুধু বদলানো ঘর লেখা হয় (ঐ কর্মী+তারিখের পুরনো attendance/overtime মুছে নতুন)।

type Employee = {
  id: string; name: string; employee_code: string;
  designation: string | null; department: string | null;
  basic_salary: number; join_date: string | null;
};
type Cell = { status: string; comment: string };
type Preset = "today" | "yesterday" | "this_month" | "prev_month" | "custom";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_month", label: "This Month" },
  { value: "prev_month", label: "Previous Month" },
  { value: "custom", label: "Custom Range" },
];

const STATUS: Record<string, { short: string; label: string; cls: string }> = {
  present: { short: "P", label: "Present", cls: "bg-green-100 text-green-800" },
  absent: { short: "A", label: "Absent", cls: "bg-red-100 text-red-700" },
  leave: { short: "L", label: "Leave", cls: "bg-sky-100 text-sky-700" },
  holiday: { short: "H", label: "Holiday", cls: "bg-amber-100 text-amber-800" },
};
const WEEKDAYS = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহ", "শুক্র", "শনি"];
const FRIDAY = 5;
const MAX_DAYS = 62;

const key = (empId: string, date: string) => `${empId}|${date}`;
const weekday = (d: string) => new Date(d + "T00:00:00").getDay();

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  while (d <= end && out.length < MAX_DAYS) {
    out.push(ymdLocal(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function presetRange(p: Preset, today: string): { from: string; to: string } | null {
  const y = +today.slice(0, 4), m = +today.slice(5, 7);
  if (p === "today") return { from: today, to: today };
  if (p === "yesterday") {
    const d = new Date(today + "T00:00:00");
    d.setDate(d.getDate() - 1);
    const s = ymdLocal(d);
    return { from: s, to: s };
  }
  if (p === "this_month") { const r = monthRange(y, m); return { from: r.start, to: r.end }; }
  if (p === "prev_month") {
    const r = m === 1 ? monthRange(y - 1, 12) : monthRange(y, m - 1);
    return { from: r.start, to: r.end };
  }
  return null;
}

const isFixed = (e: Employee) => salaryTypeOf(e.department, e.designation) === "fixed";

export default function AttendanceGrid({
  employees, revisions,
}: {
  employees: Employee[];
  revisions: { employee_id: string; effective_date: string; basic_salary: number }[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const today = todayLocal();

  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [editing, setEditing] = useState(false);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [ot, setOt] = useState<Record<string, string>>({});
  const [origCells, setOrigCells] = useState<Record<string, Cell>>({});
  const [origOt, setOrigOt] = useState<Record<string, string>>({});
  const [dept, setDept] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const dates = useMemo(() => (from && to && from <= to ? datesBetween(from, to) : []), [from, to]);
  const todayView = preset === "today";

  const revByEmp = useMemo(() => {
    const m = new Map<string, SalaryRevision[]>();
    revisions.forEach((r) => {
      const l = m.get(r.employee_id) ?? [];
      l.push({ effective_date: r.effective_date, basic_salary: r.basic_salary });
      m.set(r.employee_id, l);
    });
    return m;
  }, [revisions]);

  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter(Boolean) as string[])].sort(),
    [employees],
  );
  const visible = employees.filter((e) =>
    (!dept || e.department === dept) &&
    (!search || `${e.employee_code} ${e.name}`.toLowerCase().includes(search.toLowerCase())),
  );

  // join_date-এর আগের দিন এডিট করা যায় না (বেতন হিসাবেও ধরা হয় না)
  const eligible = (e: Employee, d: string) => !e.join_date || d >= e.join_date;

  // ── লোড ──
  // fetchGrid শুধু ডাটা আনে; state বসে applyGrid-এ (await/then-এর পরে)। তারিখ বদলালে effect লোড করে —
  // "লোড হচ্ছে" ভাব derive হয় (যে তারিখের ডাটা বসানো আছে ≠ বাছাই করা তারিখ), effect-এ setLoading লাগে না।
  const rangeKey = `${from}|${to}`;
  const [loadedRange, setLoadedRange] = useState("");
  const busy = loading || (dates.length > 0 && loadedRange !== rangeKey);

  async function fetchGrid(f: string, t: string) {
    const [att, ots] = await Promise.all([
      fetchAllRows<any>(supabase, "attendance", "id, employee_id, att_date, status, comments",
        (q) => q.gte("att_date", f).lte("att_date", t)),
      fetchAllRows<any>(supabase, "overtime", "id, employee_id, ot_date, hours",
        (q) => q.gte("ot_date", f).lte("ot_date", t)),
    ]);
    const c: Record<string, Cell> = {};
    att.forEach((r) => { c[key(r.employee_id, r.att_date)] = { status: r.status ?? "", comment: r.comments ?? "" }; });
    const o: Record<string, string> = {};
    ots.forEach((r) => {
      const k = key(r.employee_id, r.ot_date);
      o[k] = String((parseFloat(o[k] || "0") || 0) + Number(r.hours));
    });
    return { c, o };
  }
  function applyGrid(g: { c: Record<string, Cell>; o: Record<string, string> }, range: string) {
    setCells(g.c); setOrigCells(g.c); setOt(g.o); setOrigOt(g.o);
    setLoadedRange(range);
  }
  // সেভের পরে রিলোড (event handler থেকে)
  async function load() {
    if (dates.length === 0) return;
    setLoading(true);
    setError("");
    applyGrid(await fetchGrid(from, to), rangeKey);
    setLoading(false);
  }
  useEffect(() => {
    if (dates.length === 0) return;
    let cancelled = false;
    fetchGrid(from, to).then((g) => {
      if (cancelled) return;
      setError("");
      applyGrid(g, `${from}|${to}`);
    });
    return () => { cancelled = true; };
  }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── বদলানো ঘর ──
  const dirtyKeys = useMemo(() => {
    const s = new Set<string>();
    const all = new Set([...Object.keys(cells), ...Object.keys(origCells), ...Object.keys(ot), ...Object.keys(origOt)]);
    all.forEach((k) => {
      const a = cells[k], b = origCells[k];
      if ((a?.status ?? "") !== (b?.status ?? "") || (a?.comment ?? "") !== (b?.comment ?? "")) s.add(k);
      if ((parseFloat(ot[k] || "0") || 0) !== (parseFloat(origOt[k] || "0") || 0)) s.add(k);
    });
    return s;
  }, [cells, origCells, ot, origOt]);

  function confirmDiscard() {
    return dirtyKeys.size === 0 || window.confirm(`${dirtyKeys.size}টা ঘরের পরিবর্তন সেভ হয়নি — বাদ দেবেন?`);
  }
  function choosePreset(p: Preset) {
    if (!confirmDiscard()) return;
    setPreset(p);
    const r = presetRange(p, today);
    if (r) { setFrom(r.from); setTo(r.to); }
    if (dirtyKeys.size) { setCells(origCells); setOt(origOt); }
  }
  function setCustom(f: string, t: string) {
    if (!confirmDiscard()) return;
    setFrom(f); setTo(t);
  }
  function cancelEdit() {
    if (!confirmDiscard()) return;
    setCells(origCells); setOt(origOt);
    setEditing(false);
  }

  // ── এডিট ──
  function setStatus(e: Employee, d: string, status: string) {
    if (!eligible(e, d)) return;
    const k = key(e.id, d);
    setCells((prev) => {
      const next = { ...prev };
      if (!status && !next[k]?.comment) delete next[k];
      else next[k] = { status, comment: next[k]?.comment ?? "" };
      return next;
    });
  }
  function setComment(e: Employee, d: string, text: string) {
    const k = key(e.id, d);
    setCells((prev) => ({ ...prev, [k]: { status: prev[k]?.status ?? "", comment: text } }));
  }
  function setColumn(d: string, status: string) {
    if (!status) return;
    setCells((prev) => {
      const next = { ...prev };
      for (const e of visible) if (eligible(e, d)) next[key(e.id, d)] = { status, comment: next[key(e.id, d)]?.comment ?? "" };
      return next;
    });
  }
  // খালি ঘর পূরণ: শুক্রবার → Holiday, বাকি → Present (আজকের পরের দিন বাদ)
  function fillBlanks() {
    setCells((prev) => {
      const next = { ...prev };
      for (const e of visible) for (const d of dates) {
        if (!eligible(e, d) || d > today) continue;
        const k = key(e.id, d);
        if (next[k]?.status) continue;
        next[k] = { status: weekday(d) === FRIDAY ? "holiday" : "present", comment: next[k]?.comment ?? "" };
      }
      return next;
    });
  }

  // ── সেভ ──
  async function save() {
    if (dirtyKeys.size === 0) { setEditing(false); return; }
    setSaving(true);
    setError("");
    setMessage("");
    const empById = new Map(employees.map((e) => [e.id, e]));
    const byEmp = new Map<string, string[]>();
    dirtyKeys.forEach((k) => {
      const [empId, d] = k.split("|");
      const l = byEmp.get(empId) ?? [];
      l.push(d);
      byEmp.set(empId, l);
    });
    try {
      const attRows: any[] = [];
      const otRows: any[] = [];
      for (const [empId, ds] of byEmp) {
        const e = empById.get(empId);
        if (!e) continue;
        const { error: d1 } = await supabase.from("attendance").delete().eq("employee_id", empId).in("att_date", ds);
        if (d1) throw d1;
        const { error: d2 } = await supabase.from("overtime").delete().eq("employee_id", empId).in("ot_date", ds);
        if (d2) throw d2;
        for (const d of ds) {
          const k = key(empId, d);
          const hours = isFixed(e) ? 0 : (parseFloat(ot[k] || "0") || 0);
          const comment = (cells[k]?.comment ?? "").trim();
          let status = cells[k]?.status ?? "";
          // OT/comment আছে কিন্তু status নেই → present
          if (!status && (hours > 0 || comment)) status = "present";
          if (status) attRows.push({ employee_id: empId, att_date: d, status, comments: comment || null });
          if (hours > 0) {
            const basic = effectiveBasic(revByEmp.get(empId), d, Number(e.basic_salary));
            otRows.push({ employee_id: empId, ot_date: d, hours, rate_per_hour: Math.round(hourlyRate(basic) * 100) / 100 });
          }
        }
      }
      for (let i = 0; i < attRows.length; i += 500) {
        const { error: e1 } = await supabase.from("attendance").insert(attRows.slice(i, i + 500));
        if (e1) throw e1;
      }
      for (let i = 0; i < otRows.length; i += 500) {
        const { error: e2 } = await supabase.from("overtime").insert(otRows.slice(i, i + 500));
        if (e2) throw e2;
      }
      setMessage(`✅ ${dirtyKeys.size}টা ঘর সেভ হয়েছে।`);
      setEditing(false);
      await load();
      router.refresh();
    } catch (err: any) {
      setError(err.message || "সেভ করা যায়নি");
    } finally {
      setSaving(false);
    }
  }

  // ── সারাংশ ──
  const rowTotals = (e: Employee) => {
    const t = { present: 0, absent: 0, leave: 0, holiday: 0, ot: 0 };
    for (const d of dates) {
      const k = key(e.id, d);
      const s = cells[k]?.status as keyof typeof t | undefined;
      if (s && s in t) t[s]++;
      t.ot += parseFloat(ot[k] || "0") || 0;
    }
    return t;
  };
  const colCount = (d: string, status: string) =>
    visible.reduce((n, e) => n + (cells[key(e.id, d)]?.status === status ? 1 : 0), 0);

  // P / A / L / H বোতাম — ক্লিক = বসানো, একই বোতামে আবার ক্লিক = মুছে যায়।
  // compact (গ্রিড) = ২×২ ছোট বোতাম; Today = এক সারিতে বড় বোতাম।
  const statusButtons = (e: Employee, d: string, compact: boolean) => {
    const cur = cells[key(e.id, d)]?.status ?? "";
    return (
      <div className={compact ? "mx-auto grid w-[42px] grid-cols-2 gap-px" : "flex justify-center gap-1"}>
        {Object.entries(STATUS).map(([v, s]) => (
          <button key={v} type="button" title={s.label}
            onClick={() => setStatus(e, d, cur === v ? "" : v)}
            className={`rounded border font-semibold ${compact ? "h-[18px] text-[10px] leading-none" : "h-8 w-9 text-sm"} ${cur === v ? `${s.cls} border-gray-500` : "border-gray-200 text-gray-400 hover:bg-gray-100"}`}>
            {s.short}
          </button>
        ))}
      </div>
    );
  };
  // কলামের সব কর্মীর জন্য একসাথে (গ্রিডের তারিখ-হেডার)
  const columnButtons = (d: string) => (
    <div className="mx-auto mt-0.5 grid w-[42px] grid-cols-2 gap-px">
      {Object.entries(STATUS).map(([v, s]) => (
        <button key={v} type="button" title={`সবাই ${s.label}`} onClick={() => setColumn(d, v)}
          className={`h-[16px] rounded border border-gray-300 text-[9px] font-semibold leading-none ${s.cls}`}>
          {s.short}
        </button>
      ))}
    </div>
  );
  const statusBadge = (st: string, compact: boolean) => {
    if (!st) return <span className="text-gray-300">{compact ? "·" : "—"}</span>;
    const s = STATUS[st];
    return <span className={`inline-block rounded px-1.5 py-0.5 font-medium ${s.cls}`}>{compact ? s.short : s.label}</span>;
  };

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
      {/* Date Range + ফিল্টার + Edit */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Date Range</label>
          <select value={preset} onChange={(e) => choosePreset(e.target.value as Preset)} className="rounded-lg border px-2 py-1.5 text-sm">
            {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        {preset === "custom" && (
          <>
            <div>
              <label className="block text-xs text-gray-600 mb-1">From</label>
              <input type="date" value={from} onChange={(e) => setCustom(e.target.value, to)} className="rounded-lg border px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">To</label>
              <input type="date" value={to} onChange={(e) => setCustom(from, e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm" />
            </div>
          </>
        )}
        {preset !== "custom" && dates.length > 0 && (
          <span className="pb-2 text-sm text-gray-500">
            {dates.length === 1 ? `${formatDate(from)} (${WEEKDAYS[weekday(from)]}বার)` : `${formatDate(from)} – ${formatDate(to)}`}
          </span>
        )}
        <div>
          <label className="block text-xs text-gray-600 mb-1">Department</label>
          <select value={dept} onChange={(e) => setDept(e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm">
            <option value="">সব</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">খুঁজুন</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="নাম / কোড" className="w-36 rounded-lg border px-2 py-1.5 text-sm" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {editing ? (
            <>
              {dirtyKeys.size > 0 && <span className="text-xs text-amber-700">{dirtyKeys.size}টা ঘর বদলেছে</span>}
              <button type="button" onClick={cancelEdit} className="rounded-lg border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">বাতিল</button>
              <button type="button" onClick={save} disabled={saving}
                className="rounded-lg bg-green-600 px-4 py-1.5 text-sm text-white disabled:opacity-40">
                {saving ? "সেভ হচ্ছে..." : "সেভ করুন"}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => { setMessage(""); setEditing(true); }} disabled={dates.length === 0}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white disabled:opacity-40">Edit</button>
          )}
        </div>
      </div>

      {/* এডিট-টুল */}
      {editing && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs">
          {todayView ? (
            <>
              <button type="button" onClick={() => setColumn(from, "present")} className={`rounded border px-2 py-1 ${STATUS.present.cls}`}>সব Present</button>
              <button type="button" onClick={() => setColumn(from, "holiday")} className={`rounded border px-2 py-1 ${STATUS.holiday.cls}`}>সব Holiday</button>
            </>
          ) : (
            <>
              <button type="button" onClick={fillBlanks} className="rounded border bg-white px-2 py-1 text-gray-700 hover:bg-gray-50">
                খালি ঘর পূরণ (শুক্রবার Holiday, বাকি Present)
              </button>
              <span className="text-gray-500">তারিখের নিচের P/A/L/H চাপলে ঐ দিনের সবার জন্য একসাথে বসে।</span>
            </>
          )}
          <span className="text-gray-500">OT / Comment দিলে Status না বাছলেও Present ধরা হবে।</span>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}
      {dates.length === 0 && <p className="text-sm text-red-600">সঠিক Date Range দিন (From ≤ To)।</p>}

      {/* ── Today ভিউ ── */}
      {todayView && dates.length === 1 && (
        <div className={`overflow-auto rounded-lg border max-h-[70vh] ${busy ? "opacity-50" : ""}`}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2" rowSpan={2}>Employee</th>
                <th className="px-3 py-2" rowSpan={2}>Department</th>
                <th className="px-3 py-2" rowSpan={2}>Designation</th>
                <th className="px-3 pt-2 text-center">Attendance</th>
                <th className="px-3 py-2" rowSpan={2}>OT ঘণ্টা</th>
                <th className="px-3 py-2" rowSpan={2}>Comment</th>
              </tr>
              <tr>
                <th className="px-3 pb-2 text-center text-xs font-normal">{formatDate(from)}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => {
                const k = key(e.id, from);
                const ok = eligible(e, from);
                return (
                  <tr key={e.id} className={`border-t ${dirtyKeys.has(k) ? "bg-amber-50" : ""}`}>
                    <td className="px-3 py-1.5 whitespace-nowrap"><span className="text-gray-400">{e.employee_code.replace("EMP-", "")}</span> {e.name}</td>
                    <td className="px-3 py-1.5 text-gray-500">{e.department || "-"}</td>
                    <td className="px-3 py-1.5 text-gray-500">{e.designation || "-"}</td>
                    <td className="px-3 py-1.5 text-center">
                      {!ok ? <span className="text-xs text-gray-400">যোগদান {formatDate(e.join_date!)}</span>
                        : editing ? statusButtons(e, from, false) : statusBadge(cells[k]?.status ?? "", false)}
                    </td>
                    <td className="px-3 py-1.5">
                      {isFixed(e) || !ok ? <span className="text-gray-300" title="ফিক্সড বেতন — OT প্রযোজ্য নয়">—</span>
                        : editing ? (
                          <input type="number" min="0" step="0.5" placeholder="0" value={ot[k] ?? ""}
                            onChange={(ev) => setOt((p) => ({ ...p, [k]: ev.target.value }))}
                            className="w-20 rounded border px-2 py-1 text-sm" />
                        ) : <span>{ot[k] || "—"}</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      {!ok ? null : editing ? (
                        <input type="text" placeholder="—" value={cells[k]?.comment ?? ""}
                          onChange={(ev) => setComment(e, from, ev.target.value)}
                          className="w-full min-w-[140px] rounded border px-2 py-1 text-sm" />
                      ) : <span className="text-gray-600">{cells[k]?.comment || ""}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 text-xs text-gray-600">
              <tr className="border-t">
                <td className="px-3 py-2" colSpan={3}>মোট</td>
                <td className="px-3 py-2 text-center">
                  P {colCount(from, "present")} · A {colCount(from, "absent")} · L {colCount(from, "leave")} · H {colCount(from, "holiday")}
                </td>
                <td className="px-3 py-2">{visible.reduce((n, e) => n + (parseFloat(ot[key(e.id, from)] || "0") || 0), 0)} ঘণ্টা</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── গ্রিড ভিউ ── */}
      {!todayView && dates.length > 0 && (
        <div className={`overflow-auto rounded-lg border max-h-[70vh] ${busy ? "opacity-50" : ""}`}>
          <table className="text-xs border-collapse">
            <thead className="sticky top-0 z-20 bg-gray-50 text-gray-600">
              <tr>
                <th rowSpan={2} className="sticky left-0 z-30 bg-gray-50 px-2 py-1 text-left min-w-[190px] border-b">Employee</th>
                <th rowSpan={2} className="px-2 py-1 text-left border-b">Department</th>
                <th rowSpan={2} className="px-2 py-1 text-left border-b">Designation</th>
                <th colSpan={dates.length} className="border-b border-l py-1 text-center">Attendance</th>
                <th colSpan={5} className="border-b border-l py-1 text-center">মোট</th>
              </tr>
              <tr>
                {dates.map((d) => {
                  const wd = weekday(d);
                  return (
                    <th key={d} className={`border-b border-l px-0.5 py-1 text-center font-normal ${wd === FRIDAY ? "bg-amber-50" : ""} ${d === today ? "text-blue-700 font-semibold" : ""}`}>
                      <div className="font-semibold">{+d.slice(8)}</div>
                      <div className="text-[10px]">{WEEKDAYS[wd]}</div>
                      {editing && columnButtons(d)}
                    </th>
                  );
                })}
                <th className="border-b border-l px-1 text-green-700">P</th>
                <th className="border-b px-1 text-red-700">A</th>
                <th className="border-b px-1 text-sky-700">L</th>
                <th className="border-b px-1 text-amber-700">H</th>
                <th className="border-b px-1">OT</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => {
                const t = rowTotals(e);
                const fixed = isFixed(e);
                return (
                  <tr key={e.id} className="border-t hover:bg-gray-50/60">
                    <td className="sticky left-0 z-10 bg-white px-2 py-1 whitespace-nowrap">
                      <span className="text-gray-400">{e.employee_code.replace("EMP-", "")}</span> {e.name}
                    </td>
                    <td className="px-2 py-1 text-gray-500 whitespace-nowrap">{e.department || "-"}</td>
                    <td className="px-2 py-1 text-gray-500 whitespace-nowrap">{e.designation || "-"}</td>
                    {dates.map((d) => {
                      const k = key(e.id, d);
                      const c = cells[k];
                      const fri = weekday(d) === FRIDAY;
                      if (!eligible(e, d)) return <td key={d} className="border-l bg-gray-100 text-center text-gray-300" title="যোগদানের আগে">—</td>;
                      const otv = ot[k];
                      return (
                        <td key={d} title={c?.comment || undefined}
                          className={`border-l px-0.5 py-0.5 text-center align-top ${fri ? "bg-amber-50/50" : ""} ${dirtyKeys.has(k) ? "outline outline-1 outline-amber-400" : ""}`}>
                          {editing ? (
                            <>
                              {statusButtons(e, d, true)}
                              {!fixed && (
                                <input type="number" min="0" step="0.5" value={otv ?? ""} placeholder="OT"
                                  onChange={(ev) => setOt((p) => ({ ...p, [k]: ev.target.value }))}
                                  className="mx-auto mt-0.5 block w-[42px] rounded border border-gray-200 px-0 py-0 text-center text-[10px]" />
                              )}
                            </>
                          ) : (
                            <>
                              {statusBadge(c?.status ?? "", true)}
                              {!fixed && otv && parseFloat(otv) > 0 && <div className="text-[10px] text-gray-500">{otv}</div>}
                              {c?.comment && <div className="mx-auto mt-0.5 h-1 w-1 rounded-full bg-purple-500" />}
                            </>
                          )}
                        </td>
                      );
                    })}
                    <td className="border-l px-1 text-center text-green-700">{t.present}</td>
                    <td className="px-1 text-center text-red-700">{t.absent}</td>
                    <td className="px-1 text-center text-sky-700">{t.leave}</td>
                    <td className="px-1 text-center text-amber-700">{t.holiday}</td>
                    <td className="px-1 text-center font-medium">{fixed ? "—" : t.ot}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 text-[10px] text-gray-600">
              <tr className="border-t">
                <td className="sticky left-0 z-10 bg-gray-50 px-2 py-1">দিনে Present / Absent</td>
                <td colSpan={2} />
                {dates.map((d) => (
                  <td key={d} className="border-l px-0.5 text-center">
                    <span className="text-green-700">{colCount(d, "present")}</span>/<span className="text-red-700">{colCount(d, "absent")}</span>
                  </td>
                ))}
                <td colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        P = Present · A = Absent · L = Leave · H = Holiday · ঘরের নিচের ছোট সংখ্যা = OT ঘণ্টা · বেগুনি বিন্দু = comment আছে (মাউস রাখলে দেখা যায়)।
        যোগদানের আগের দিন ধূসর। শুধু Production কর্মীর OT ধরা হয়।
      </p>
    </div>
  );
}
