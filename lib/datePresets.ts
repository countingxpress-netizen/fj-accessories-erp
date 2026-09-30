// রিপোর্টের তারিখ-ফিল্টার preset — Today / Yesterday / This Month / This Year / Previous Month /
// Previous Year / Date Range। সার্ভার (Vercel) UTC-তে চলে, তাই "আজ" সবসময় Asia/Dhaka ধরে।

export type DatePreset =
  | "today" | "yesterday" | "this_month" | "this_year"
  | "previous_month" | "previous_year" | "custom";

export const DATE_PRESET_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_month", label: "This Month" },
  { value: "this_year", label: "This Year" },
  { value: "previous_month", label: "Previous Month" },
  { value: "previous_year", label: "Previous Year" },
  { value: "custom", label: "Date Range" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1-12

/** Asia/Dhaka-র আজকের তারিখ (y, m 1-12, d) */
export function dhakaToday(): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

export function resolveDatePreset(
  preset: string | undefined, customFrom?: string, customTo?: string,
): { preset: DatePreset; from: string; to: string } {
  const { y, m, d } = dhakaToday();
  switch (preset) {
    case "today":
      return { preset: "today", from: ymd(y, m, d), to: ymd(y, m, d) };
    case "yesterday": {
      const t = new Date(Date.UTC(y, m - 1, d - 1));
      const s = ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
      return { preset: "yesterday", from: s, to: s };
    }
    case "this_year":
      return { preset: "this_year", from: ymd(y, 1, 1), to: ymd(y, 12, 31) };
    case "previous_month": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { preset: "previous_month", from: ymd(py, pm, 1), to: ymd(py, pm, lastDay(py, pm)) };
    }
    case "previous_year":
      return { preset: "previous_year", from: ymd(y - 1, 1, 1), to: ymd(y - 1, 12, 31) };
    case "custom":
      return { preset: "custom", from: customFrom || "2000-01-01", to: customTo || ymd(y, m, d) };
    case "this_month":
    default:
      return { preset: "this_month", from: ymd(y, m, 1), to: ymd(y, m, lastDay(y, m)) };
  }
}

/** "01 Aug 2026" — Zoho-র মতো */
export function formatLongDate(s: string): string {
  const [yy, mm, dd] = s.split("-").map(Number);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mm - 1] ?? "";
  return `${pad(dd)} ${mon} ${yy}`;
}
