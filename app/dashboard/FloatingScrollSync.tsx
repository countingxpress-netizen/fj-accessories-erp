"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// এই ক্লাস-কম্বিনেশনের div-গুলোই টেবিল-wrapper (আগের overflow-x-auto ফিক্সে সেট করা) —
// একই সিগনেচার দিয়ে খুঁজে নেয়া হয়, প্রতিটা পেজে আলাদা করে বসাতে হয় না।
const SELECTOR = 'div[class*="overflow-x-auto"][class*="rounded"][class*="border"]';

// টেবিল অনেক লম্বা হলে আসল স্ক্রলবার একদম নিচে চলে যায় — এই কম্পোনেন্ট viewport-এর
// নিচে সবসময় একটা ভাসমান স্ক্রলবার রাখে, যেই টেবিল স্ক্রিনে দেখা যাচ্ছে তার সাথে সিঙ্ক করে।
// একাধিক টেবিল থাকলে (যেমন Buyers-এ কাস্টমার-ভিত্তিক আলাদা টেবিল) যেটা এই মুহূর্তে
// viewport-এ সবচেয়ে উপরে দেখা যাচ্ছে সেটাই "active" ধরা হয়।
//
// "active" বাছাই সরাসরি getBoundingClientRect() দিয়ে করা হয় (IntersectionObserver না) —
// IO প্রতি ব্যাচে শুধু অবস্থা-বদলানো এলিমেন্টগুলোই পাঠায়, তাই "কারা এখন ভিজিবল" ঠিকঠাক
// রিকনস্ট্রাক্ট করতে গেলে জটিলতা/রেস কন্ডিশন হয় — সরাসরি rect চেক অনেক বেশি নির্ভরযোগ্য।
export default function FloatingScrollSync() {
  const pathname = usePathname();
  const barRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLElement | null>(null);
  const syncingRef = useRef(false);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const [left, setLeft] = useState(0);
  const [right, setRight] = useState(0);

  useEffect(() => {
    let elements: HTMLElement[] = [];
    const cleanupFns: (() => void)[] = [];
    let scanRaf = 0;
    let pickRaf = 0;

    function updateFromActive() {
      const el = activeRef.current;
      if (!el || !document.body.contains(el)) { setVisible(false); return; }
      const overflowing = el.scrollWidth > el.clientWidth + 2;
      setVisible(overflowing);
      if (overflowing) {
        setScrollWidth(el.scrollWidth);
        const rect = el.getBoundingClientRect();
        setLeft(Math.max(0, rect.left));
        setRight(Math.max(0, window.innerWidth - rect.right));
      }
    }

    function onTargetScroll(this: HTMLElement) {
      if (syncingRef.current) { syncingRef.current = false; return; }
      if (barRef.current) {
        syncingRef.current = true;
        barRef.current.scrollLeft = this.scrollLeft;
      }
    }

    function setActive(el: HTMLElement | null) {
      if (activeRef.current === el) { updateFromActive(); return; }
      activeRef.current = el;
      updateFromActive();
    }

    // viewport-এ যে ট্র্যাক করা এলিমেন্টটা সবচেয়ে বেশি জায়গা জুড়ে দেখা যাচ্ছে সেটাই "active" —
    // raw top দিয়ে সর্ট করলে ভুল হয় (একটা লম্বা টেবিলের মাত্র ১৩px ছোট্ট অংশ উপরে উঁকি দিলেও
    // সেটাই "সবচেয়ে উপরে" হিসেবে জিতে যায়, যদিও আসলে নিচের টেবিলটাই পুরোপুরি দেখা যাচ্ছে)।
    function pickActive() {
      const vh = window.innerHeight;
      let best: HTMLElement | null = null;
      let bestVisible = 0;
      for (const el of elements) {
        const r = el.getBoundingClientRect();
        const visibleHeight = Math.min(r.bottom, vh) - Math.max(r.top, 0);
        if (visibleHeight > bestVisible) {
          bestVisible = visibleHeight;
          best = el;
        }
      }
      if (best) {
        setActive(best);
      } else if (!activeRef.current || !document.body.contains(activeRef.current)) {
        setActive(elements[0] ?? null);
      }
    }

    function schedulePick() {
      cancelAnimationFrame(pickRaf);
      pickRaf = requestAnimationFrame(pickActive);
    }

    function scan() {
      const found = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR));
      const added = found.filter((el) => !elements.includes(el));
      elements = found;

      added.forEach((el) => {
        el.addEventListener("scroll", onTargetScroll);
        const ro = new ResizeObserver(() => { if (activeRef.current === el) updateFromActive(); });
        ro.observe(el);
        cleanupFns.push(() => { el.removeEventListener("scroll", onTargetScroll); ro.disconnect(); });
      });

      schedulePick();
    }

    const mainEl = document.querySelector("main");
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(scanRaf);
      scanRaf = requestAnimationFrame(scan);
    });
    if (mainEl) mo.observe(mainEl, { childList: true, subtree: true });

    function onResize() { schedulePick(); updateFromActive(); }

    scan();
    window.addEventListener("scroll", schedulePick, { passive: true, capture: true });
    window.addEventListener("resize", onResize);

    return () => {
      mo.disconnect();
      cleanupFns.forEach((fn) => fn());
      window.removeEventListener("scroll", schedulePick, true);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(scanRaf);
      cancelAnimationFrame(pickRaf);
    };
  }, [pathname]);

  function onBarScroll() {
    if (syncingRef.current) { syncingRef.current = false; return; }
    const el = activeRef.current;
    if (el && barRef.current) {
      syncingRef.current = true;
      el.scrollLeft = barRef.current.scrollLeft;
    }
  }

  if (!visible) return null;

  return (
    <div
      ref={barRef}
      onScroll={onBarScroll}
      className="print:hidden fixed bottom-0 z-40 h-3.5 overflow-x-auto overflow-y-hidden border-t border-gray-300 bg-gray-100"
      style={{ left, right }}
      aria-hidden="true"
    >
      <div style={{ width: scrollWidth, height: 1 }} />
    </div>
  );
}
