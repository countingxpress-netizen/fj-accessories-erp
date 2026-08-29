// F&J Payroll — বেতন হিসাবের কেন্দ্রীয় লজিক।
// বদলানোর আগে অবশ্যই কনফার্ম নিন (CLAUDE.md-এর core formula rules-এর মতো গুরুত্বপূর্ণ)।
//
//   Production কর্মী:
//     ঘণ্টা রেট        = Basic / 26 / 8
//     Absent hours     = max(0, absentDays - 1) * 8      (প্রথম ১ দিন অনুপস্থিতি মাফ)
//     Net adjustment   = round( rate * (otHours - absentHours) )   (ঋণাত্মক হতে পারে)
//     Total Amount     = Basic + Net adjustment
//
//   Fixed / Monthly কর্মী:
//     OT / absent ধরা হয় না → Total Amount = Basic
//
//   Net salary = Total Amount - Advance - Other deduction
//
//   Late joining: join_date-এর আগের কোনো দিন হিসাবে আসে না (attendance / OT দুটোই
//   join_date থেকে মাস-শেষ পর্যন্ত গোনা হয়)।

// department বা designation-এ এই শব্দগুলোর কোনোটা থাকলে কর্মী "Production" ধরা হয়।
const PRODUCTION_KEYWORDS = [
  "blow", "cut", "print", "production", "operator", "opperator",
  "helper", "machine", "mixer", "packing",
];

export type SalaryType = "production" | "fixed";

export function isProductionRole(department?: string | null, designation?: string | null): boolean {
  const hay = `${department ?? ""} ${designation ?? ""}`.toLowerCase();
  return PRODUCTION_KEYWORDS.some((k) => hay.includes(k));
}

export function salaryTypeOf(department?: string | null, designation?: string | null): SalaryType {
  return isProductionRole(department, designation) ? "production" : "fixed";
}

export function hourlyRate(basic: number): number {
  return basic / 26 / 8;
}

export function absentHoursFromDays(absentDays: number): number {
  return Math.max(0, absentDays - 1) * 8;
}

export type SalaryInput = {
  salaryType: SalaryType;
  basic: number;
  otHours: number;
  absentDays: number;
  advance?: number;
  otherDeduction?: number;
};

export type SalaryResult = {
  salaryType: SalaryType;
  basic: number;
  hourlyRate: number;
  otHours: number;
  absentDays: number;
  absentHours: number;
  overtimeAmount: number;   // round(rate * otHours) — গ্রস OT আয় (রিপোর্টের জন্য)
  absentDeduction: number;  // round(rate * absentHours) — রিপোর্টের জন্য
  netAdjustment: number;    // round(rate * (otHours - absentHours)) — এটাই authoritative
  totalAmount: number;      // basic + netAdjustment
  advance: number;
  otherDeduction: number;
  netSalary: number;
};

export function computeSalary(i: SalaryInput): SalaryResult {
  const advance = i.advance || 0;
  const otherDeduction = i.otherDeduction || 0;

  if (i.salaryType === "fixed") {
    return {
      salaryType: "fixed",
      basic: i.basic,
      hourlyRate: 0,
      otHours: 0,
      absentDays: 0,
      absentHours: 0,
      overtimeAmount: 0,
      absentDeduction: 0,
      netAdjustment: 0,
      totalAmount: i.basic,
      advance,
      otherDeduction,
      netSalary: i.basic - advance - otherDeduction,
    };
  }

  const rate = hourlyRate(i.basic);
  const absentHours = absentHoursFromDays(i.absentDays);
  const netAdjustment = Math.round(rate * (i.otHours - absentHours));
  const totalAmount = i.basic + netAdjustment;

  return {
    salaryType: "production",
    basic: i.basic,
    hourlyRate: rate,
    otHours: i.otHours,
    absentDays: i.absentDays,
    absentHours,
    overtimeAmount: Math.round(rate * i.otHours),
    absentDeduction: Math.round(rate * absentHours),
    netAdjustment,
    totalAmount,
    advance,
    otherDeduction,
    netSalary: totalAmount - advance - otherDeduction,
  };
}

// join_date মাসের ভিতরে হলে month-start-কে join_date পর্যন্ত এগিয়ে দেয়।
export function effectiveMonthStart(monthStart: string, joinDate?: string | null): string {
  if (joinDate && joinDate > monthStart) return joinDate;
  return monthStart;
}

// ---------------------------------------------------------------------------
// Salary revision history — কার্যকর basic = সবচেয়ে সাম্প্রতিক effective_date <= asOf
// ---------------------------------------------------------------------------
export type SalaryRevision = { effective_date: string; basic_salary: number };

export function effectiveBasic(
  revisions: SalaryRevision[] | null | undefined,
  asOf: string,
  fallback: number,
): number {
  const applicable = (revisions ?? [])
    .filter((r) => r.effective_date <= asOf)
    .sort((a, b) => (a.effective_date < b.effective_date ? 1 : -1));
  return applicable.length > 0 ? applicable[0].basic_salary : fallback;
}

// ---------------------------------------------------------------------------
// মাঝ-মাসে join করা Fixed কর্মীর proration
//   prorated basic = round( basic / মাসের মোট দিন × counted_days )
//   counted_days   = join থেকে মাস-শেষ পর্যন্ত দিন − absent দিন
// ---------------------------------------------------------------------------
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// লোকাল টাইমজোনে YYYY-MM-DD (toISOString() UTC-তে সরিয়ে দেয় → +6 জোনে মাস-শেষ ভুল হয়)
export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayLocal(): string {
  return ymdLocal(new Date());
}

// মাসের প্রথম ও শেষ দিন (দুটোই লোকাল YYYY-MM-DD)
export function monthRange(year: number, month: number): { start: string; end: string } {
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth(year, month)).padStart(2, "0")}`,
  };
}

// দুই তারিখের মধ্যে দিন সংখ্যা (দুই প্রান্ত সহ)
export function daysInclusive(start: string, end: string): number {
  const a = new Date(start + "T00:00:00");
  const b = new Date(end + "T00:00:00");
  return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
}

export function proratedFixedBasic(args: {
  basic: number; daysInMonth: number; employedDays: number; absentDays: number;
}): number {
  const counted = Math.max(0, Math.min(args.daysInMonth, args.employedDays - args.absentDays));
  return Math.round((args.basic / args.daysInMonth) * counted);
}

// ---------------------------------------------------------------------------
// Eid বোনাস
//   tenure (মাস) = join_date থেকে bonus_date পর্যন্ত
//   ডিফল্ট বোনাস = round( basic × 50% × min(1, tenure / 12) )
// ---------------------------------------------------------------------------
export function monthsBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00");
  const b = new Date(to + "T00:00:00");
  if (b <= a) return 0;
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  // দিনের ভগ্নাংশ
  const dayFrac = (b.getDate() - a.getDate()) / 30;
  months += dayFrac;
  return Math.max(0, months);
}

export function eidBonusDefault(basic: number, tenureMonths: number): number {
  return Math.round(basic * 0.5 * Math.min(1, tenureMonths / 12));
}

export const FESTIVALS = [
  { value: "eid_ul_fitr", label: "Eid-ul-Fitr" },
  { value: "eid_ul_azha", label: "Eid-ul-Azha" },
] as const;
