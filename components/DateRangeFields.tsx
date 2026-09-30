import { DATE_PRESET_OPTIONS, ALL_TIME_OPTION, type DatePreset } from "@/lib/datePresets";

// রিপোর্টের তারিখ-ফিল্টারের ঘরগুলো (Date Range dropdown + From/To) — কোনো <form>-এর ভেতরে বসে (GET),
// পেজ resolveDatePreset(range, from, to) দিয়ে আসল from/to বের করে। সব রিপোর্টে একই রকম।
// From/To শুধু "Date Range" বাছলে কাজে লাগে; অন্য preset-এ ঘর ফাঁকা থাকে।
export default function DateRangeFields({
  preset, from, to, includeAll = false, fromLabel = "From", toLabel = "To", hideFrom = false,
}: {
  preset: DatePreset;
  from: string;
  to: string;
  /** "All Time (সব সময়)" অপশন দেখাবে কিনা */
  includeAll?: boolean;
  fromLabel?: string;
  toLabel?: string;
  /** Balance Sheet / Trial Balance-এর মতো "নির্দিষ্ট তারিখ পর্যন্ত" রিপোর্টে From লাগে না */
  hideFrom?: boolean;
}) {
  const options = includeAll ? [...DATE_PRESET_OPTIONS, ALL_TIME_OPTION] : DATE_PRESET_OPTIONS;
  const isCustom = preset === "custom";
  return (
    <>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Date Range</label>
        <select name="range" defaultValue={preset} className="rounded-lg border px-3 py-2 text-sm">
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className={hideFrom ? "hidden" : ""}>
        <label className="block text-xs text-gray-500 mb-1">{fromLabel} (Date Range-এর জন্য)</label>
        <input type="date" name="from" defaultValue={isCustom ? from : ""} className="rounded-lg border px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">{toLabel} (Date Range-এর জন্য)</label>
        <input type="date" name="to" defaultValue={isCustom ? to : ""} className="rounded-lg border px-3 py-2 text-sm" />
      </div>
    </>
  );
}
