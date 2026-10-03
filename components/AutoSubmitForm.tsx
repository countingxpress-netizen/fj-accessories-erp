"use client";

// GET ফিল্টার ফর্ম — কোনো ঘর বদলালেই "দেখুন / ফিল্টার করুন" না চেপে নিজে থেকে URL (searchParams)
// বদলে পেজ নতুন করে লোড করে। Dashboard ও সব রিপোর্ট পেজ ব্যবহার করে। ঘরগুলো (DateRangeFields,
// select, month ...) আগের মতোই uncontrolled, name দিয়ে — সাধারণ GET ফর্মের মতোই সব ঘর URL-এ যায়।
//   • range = "custom" (Date Range) হলে দেখা-যাওয়া তারিখের ঘরগুলো (From / To; "As of Date" পেজে
//     শুধু To) পূর্ণ না হওয়া পর্যন্ত অপেক্ষা করে। অন্য preset-এ from/to URL-এ যায় না (সার্ভার তখন
//     সেগুলো ব্যবহারও করে না)।
//   • তারিখ/মাস টাইপ করার সময় প্রতি অক্ষরে লোড না হতে একটু দেরি (debounce) করে; অসম্পূর্ণ তারিখে লোড হয় না।
//   • URL বদলালে (রিসেট / Clear লিংক সহ) ফর্ম নতুন করে বসে — ঘরগুলো সার্ভারের নতুন মান দেখায়।

import { useEffect, useRef, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const DEBOUNCED_TYPES = new Set(["date", "month", "text", "search", "number"]);

/** তারিখ / মাসের ঘরের মান পূর্ণ কিনা (টাইপ করার মাঝপথে Chrome "0002-09-01"-এর মতো মান দেয়) */
function isComplete(el: HTMLInputElement): boolean {
  const v = el.value;
  if (el.type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 2000;
  if (el.type === "month") return /^\d{4}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 2000;
  return true;
}

export default function AutoSubmitForm({ children, className }: { children: ReactNode; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams().toString();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function apply(form: HTMLFormElement) {
    const fd = new FormData(form);
    const hasRange = fd.has("range");
    const isCustom = fd.get("range") === "custom";
    const visible = (el: HTMLElement) => el.offsetParent !== null;
    const dateInputs = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="date"], input[type="month"]'));

    // অসম্পূর্ণ তারিখ (টাইপ চলছে) থাকলে অপেক্ষা
    if (dateInputs.some((el) => el.value && !isComplete(el))) return;
    // Date Range — দেখা-যাওয়া From/To দুটোই দরকার
    if (isCustom && dateInputs.some((el) => (el.name === "from" || el.name === "to") && visible(el) && !el.value)) return;

    const params = new URLSearchParams();
    fd.forEach((v, k) => {
      if (typeof v !== "string") return;
      if (hasRange && !isCustom && (k === "from" || k === "to")) return;
      params.set(k, v);
    });
    const qs = params.toString();
    if (qs === current) return;
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  return (
    <form
      key={current}
      className={className}
      onChange={(e) => {
        const form = e.currentTarget;
        const debounce = e.target instanceof HTMLInputElement && DEBOUNCED_TYPES.has(e.target.type);
        if (timer.current) clearTimeout(timer.current);
        if (debounce) timer.current = setTimeout(() => apply(form), 700);
        else apply(form);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
    >
      {children}
      {pending && <span className="self-center text-sm text-blue-700 animate-pulse">লোড হচ্ছে…</span>}
    </form>
  );
}
