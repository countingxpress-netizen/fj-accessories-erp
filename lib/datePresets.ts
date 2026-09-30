// রিপোর্টের তারিখ-ফিল্টার preset — Today / Yesterday / This Month / This Year / Previous Month /
// Previous Year / Date Range। সার্ভার (Vercel) UTC-তে চলে, তাই "আজ" সবসময় Asia/Dhaka ধরে।

export type DatePreset =
  | "today" | "yesterday" | "this_month" | "this_year"
  | "previous_month" | "previous_year" | "custom" | "all";

export const DATE_PRESET_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_month", label: "This Month" },
  { value: "this_year", label: "This Year" },
  { value: "previous_month", label: "Previous Month" },
  { value: "previous_year", label: "Previous Year" },
  { value: "custom", label: "Date Range" },
];

// যেসব রিপোর্ট আগে ডিফল্টে "সব সময়" দেখাত (Ledger / Cash Book ...) — সেগুলোতে এই অপশনটাও থাকে
export const ALL_TIME_OPTION: { value: DatePreset; label: string } = { value: "all", label: "All Time (সব সময়)" };

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

/**
 * preset → from/to (YYYY-MM-DD)। "all" হলে from/to দুটোই "" (কোনো সীমা নেই)।
 * preset না থাকলে (পেজ প্রথমবার খুললে) fallback — ডিফল্ট This Month; পুরনো লিংকে শুধু from/to
 * থাকলে (range ছাড়া) সেটাকে Date Range ধরা হয়।
 */
export function resolveDatePreset(
  preset: string | undefined, customFrom?: string, customTo?: string, fallback: DatePreset = "this_month",
): { preset: DatePreset; from: string; to: string } {
  const { y, m, d } = dhakaToday();
  if (!preset) preset = customFrom || customTo ? "custom" : fallback;
  switch (preset) {
    case "all":
      return { preset: "all", from: "", to: "" };
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
      return { preset: "custom", from: customFrom || "", to: customTo || "" };
    case "this_month":
    default:
      return { preset: "this_month", from: ymd(y, m, 1), to: ymd(y, m, lastDay(y, m)) };
  }
}

/** রিপোর্টের শিরোনামে দেখানোর লেখা, যেমন "This Month — 01 Sep 2026 থেকে 30 Sep 2026" */
export function datePresetLabel(r: { preset: DatePreset; from: string; to: string }): string {
  if (r.preset === "all" || (!r.from && !r.to)) return "All Time (সব সময়)";
  const name = r.preset === "custom" ? "Date Range" : DATE_PRESET_OPTIONS.find((o) => o.value === r.preset)?.label ?? "";
  const range = r.from === r.to ? formatLongDate(r.from)
    : `${r.from ? formatLongDate(r.from) : "শুরু"} থেকে ${r.to ? formatLongDate(r.to) : "আজ"}`;
  return `${name} — ${range}`;
}

/** "01 Aug 2026" — Zoho-র মতো */
export function formatLongDate(s: string): string {
  const [yy, mm, dd] = s.split("-").map(Number);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mm - 1] ?? "";
  return `${pad(dd)} ${mon} ${yy}`;
}
