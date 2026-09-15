"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// FloatingScrollSync-এর মতোই একই wrapper div খুঁজে নেয় (আগের overflow-x-auto ফিক্সে সেট করা)।
// এই একই class-সিগনেচার দিয়ে বাছা হয় বলে নতুন কোনো টেবিলে আলাদা করে কিছু বসাতে হয় না।
const SELECTOR = 'div[class*="overflow-x-auto"][class*="rounded"][class*="border"]';

// কেন position:sticky কাজ করে না — overflow-x-auto থাকা wrapper div-এ CSS-এর নিয়মে
// overflow-y ও "auto" হয়ে যায় (স্পষ্টভাবে visible লিখে দিলেও ব্রাউজার তা override করে),
// ফলে thead-এর sticky positioning পুরো পেজের বদলে ওই div-কে reference ধরে — যেটা নিজে
// কখনো স্বাধীনভাবে স্ক্রল হয় না বলে sticky আসলে কোনো effect-ই ফেলে না।
//
// সমাধান: আসল thead viewport-এর উপরে স্ক্রল হয়ে গেলে সেটার একটা ভিজ্যুয়াল-কপি
// position:fixed দিয়ে ভাসিয়ে রাখা হয়, নিচের আসল টেবিলের horizontal scroll-এর সাথে
// transform দিয়ে সিঙ্ক করে। কপিটা শুধু দেখানোর জন্য — চেকবক্স/বাটন non-interactive করে
// দেওয়া হয়, যাতে ব্যবহারকারী ভুল করে ক্লিক করে কিছু না ঘটে এমন বিভ্রান্তিতে না পড়ে।
export default function StickyTableHeader() {
  const pathname = usePathname();
  const outerRef = useRef<HTMLDivElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLElement | null>(null);
  const builtForRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [left, setLeft] = useState(0);
  const [right, setRight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    let elements: HTMLElement[] = [];
    let scanRaf = 0;
    let pickRaf = 0;
    let syncRaf = 0;

    function getThead(el: HTMLElement): HTMLTableSectionElement | null {
      const table = el.querySelector("table");
      return table?.tHead ?? null;
    }

    // আসল হেডারের সাথে হুবহু কলাম-width মিলিয়ে একটা ভিজ্যুয়াল ক্লোন বানায়।
    function buildClone(el: HTMLElement) {
      const holder = holderRef.current;
      const table = el.querySelector("table");
      const thead = table?.tHead;
      const realRow = thead?.rows[0];
      if (!holder || !table || !thead || !realRow) return;

      const cloneTable = document.createElement("table");
      cloneTable.className = table.className;
      cloneTable.style.tableLayout = "fixed";
      cloneTable.style.borderCollapse = "collapse";
      cloneTable.style.width = `${table.getBoundingClientRect().width}px`;

      const cloneThead = thead.cloneNode(true) as HTMLTableSectionElement;
      cloneTable.appendChild(cloneThead);

      const cloneRow = cloneThead.rows[0];
      Array.from(realRow.cells).forEach((cell, i) => {
        const w = cell.getBoundingClientRect().width;
        const c = cloneRow?.cells[i];
        if (c) {
          c.style.width = `${w}px`;
          c.style.minWidth = `${w}px`;
          c.style.maxWidth = `${w}px`;
        }
      });

      // checked স্টেট (যেমন "Select all") cloneNode-এ প্রতিফলিত হয় না — সরাসরি কপি
      const realInputs = thead.querySelectorAll("input");
      const cloneInputs = cloneThead.querySelectorAll("input");
      realInputs.forEach((inp, i) => {
        const c = cloneInputs[i];
        if (inp instanceof HTMLInputElement && c instanceof HTMLInputElement) {
          c.checked = inp.checked;
          c.indeterminate = inp.indeterminate;
        }
      });

      cloneThead.querySelectorAll("input, button, select, textarea, a").forEach((node) => {
        node.setAttribute("tabindex", "-1");
        node.setAttribute("aria-hidden", "true");
        (node as HTMLElement).style.pointerEvents = "none";
        if (node instanceof HTMLInputElement || node instanceof HTMLButtonElement || node instanceof HTMLSelectElement) {
          node.disabled = true;
        }
      });

      holder.replaceChildren(cloneTable);
      setHeaderHeight(thead.getBoundingClientRect().height);
      builtForRef.current = el;
    }

    function applyOffset(el: HTMLElement) {
      const holder = holderRef.current;
      if (!holder) return;
      holder.style.transform = `translateX(${-el.scrollLeft}px)`;
    }

    function sync() {
      const el = activeRef.current;
      if (!el || !document.body.contains(el)) { setVisible(false); return; }
      const thead = getThead(el);
      if (!thead) { setVisible(false); return; }

      const theadRect = thead.getBoundingClientRect();
      const wrapperRect = el.getBoundingClientRect();
      const shouldShow = theadRect.top < 0 && wrapperRect.bottom > theadRect.height;

      setVisible(shouldShow);
      if (!shouldShow) return;

      setLeft(Math.max(0, wrapperRect.left));
      setRight(Math.max(0, window.innerWidth - wrapperRect.right));
      if (builtForRef.current !== el) buildClone(el);
      applyOffset(el);
    }

    function scheduleSync() {
      cancelAnimationFrame(syncRaf);
      syncRaf = requestAnimationFrame(sync);
    }

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
      if (activeRef.current !== best) {
        activeRef.current = best;
        builtForRef.current = null;
      }
      scheduleSync();
    }

    function schedulePick() {
      cancelAnimationFrame(pickRaf);
      pickRaf = requestAnimationFrame(pickActive);
    }

    function onElScroll() {
      scheduleSync();
    }

    function scan() {
      const found = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR));
      const removed = elements.filter((el) => !found.includes(el));
      const added = found.filter((el) => !elements.includes(el));
      elements = found;
      added.forEach((el) => el.addEventListener("scroll", onElScroll, { passive: true }));
      removed.forEach((el) => el.removeEventListener("scroll", onElScroll));
      schedulePick();
    }

    const mainEl = document.querySelector("main");
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(scanRaf);
      scanRaf = requestAnimationFrame(scan);
      builtForRef.current = null;
    });
    if (mainEl) mo.observe(mainEl, { childList: true, subtree: true });

    function onResize() { builtForRef.current = null; schedulePick(); }

    scan();
    // পেজ vertically স্ক্রল হলে কোন টেবিল এখন "active" (সবচেয়ে বেশি দেখা যাচ্ছে) সেটা
    // পুনরায় বাছতে হবে — শুধু sync() চালালে multi-table পেজে (যেমন Buyers, কাস্টমার-ভিত্তিক
    // আলাদা টেবিল) সবসময় প্রথম টেবিলই "active" রয়ে যেত, স্ক্রল করলেও বদলাত না।
    window.addEventListener("scroll", schedulePick, { passive: true, capture: true });
    window.addEventListener("resize", onResize);

    return () => {
      mo.disconnect();
      elements.forEach((el) => el.removeEventListener("scroll", onElScroll));
      window.removeEventListener("scroll", schedulePick, true);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(scanRaf);
      cancelAnimationFrame(pickRaf);
      cancelAnimationFrame(syncRaf);
    };
  }, [pathname]);

  return (
    <div
      ref={outerRef}
      className="print:hidden fixed top-0 z-30 overflow-hidden shadow-md"
      style={{ left, right, height: headerHeight, display: visible ? "block" : "none" }}
      aria-hidden="true"
    >
      <div ref={holderRef} />
    </div>
  );
}
