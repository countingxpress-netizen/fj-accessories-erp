"use client";
import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import type { BookingPricingSnapshot } from "@/lib/bookingEditContext";
import { formatMeasurement } from "@/lib/formatMeasurement";
import { formatStyle } from "@/lib/formatStyle";
import { money } from "@/lib/format";

export type BookingPricingHoverController = {
  show: (bookings: any[], x: number, y: number) => void;
  hide: () => void;
};

const OFFSET = 14;
// কার্ডের উপরের কিনারা মাউসের এতটা উপরে — কার্ড মাউসের ঠিক পাশে থাকে, তাই সোজা ডানে/বামে সরলেই কার্ডে ঢোকা যায়
const LIFT = 12;
// অন্য row-তে মাউস গেলে এতক্ষণ অপেক্ষা — এর মধ্যে মাউস কার্ডে ঢুকে গেলে কার্ড বদলায় না
const SWITCH_DELAY = 250;
// row/কার্ড থেকে মাউস সরলে এতক্ষণ পরে বন্ধ — row থেকে কার্ডে যাওয়ার সময়টুকু
const HIDE_DELAY = 200;

function num(n: number) {
  return n > 0 ? String(Number(n.toFixed(4))) : "-";
}

function adjustLabel(n: number) {
  if (n > 0) return <span className="text-green-700">+{n.toFixed(2)}</span>;
  if (n < 0) return <span className="text-red-700">−{Math.abs(n).toFixed(2)}</span>;
  return <span className="text-gray-400">0.00</span>;
}

// Booking লিস্টে মাউস রাখলে ঐ বুকিং-এর Pricing System (Booking ফর্মের লাইন-২-এর ফিল্ডগুলো) দেখায়।
// কার্ডটা position:fixed — টেবিলের overflow-x-auto কন্টেইনারে কেটে যায় না। row-তে ঢোকার জায়গায় স্থির থাকে
// (মাউসের সাথে নড়ে না), মাউস কার্ডের উপর নিলে খোলা থাকে আর লম্বা তালিকা কার্ডের ভেতরে scroll করা যায়।
// মাউস row-এর উপর থাকলেও wheel আগে কার্ডের তালিকা scroll করে; তালিকা শেষ হলে তবে পেজ।
// বুকিং বদলালেই কেবল re-render — বড় লিস্টে পুরো টেবিল বারবার রেন্ডার হয় না।
export default function BookingPricingHover({
  pricingByBooking, controllerRef,
}: {
  pricingByBooking: Record<string, BookingPricingSnapshot>;
  controllerRef: MutableRefObject<BookingPricingHoverController | null>;
}) {
  const [bookings, setBookings] = useState<any[] | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLSpanElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const keyRef = useRef("");
  const cardHandlers = useRef<{ enter: () => void; leave: () => void } | null>(null);

  // মাউসের ডানপাশে (জায়গা না থাকলে বামপাশে), একই উচ্চতায়; নিচে না আঁটলে উপরে সরিয়ে পুরোটা স্ক্রিনে রাখা।
  // কোনো পাশেই পুরো চওড়া না আঁটলে যেদিকে বেশি জায়গা সেদিকে, সেই জায়গার মাপে চওড়া বেঁধে (ভেতরে পাশাপাশি
  // scroll) — তাই কার্ড কখনো মাউসের ঠিক নিচে পড়ে না।
  function place() {
    const el = cardRef.current;
    if (!el) return;
    const { x, y } = pos.current;
    const roomRight = window.innerWidth - (x + OFFSET) - 8;
    const roomLeft = x - OFFSET - 8;
    el.style.maxWidth = "";
    const naturalWidth = el.offsetWidth;
    let left: number;
    if (naturalWidth <= roomRight) left = x + OFFSET;
    else if (naturalWidth <= roomLeft) left = x - OFFSET - naturalWidth;
    else if (roomRight >= roomLeft) { el.style.maxWidth = `${Math.max(240, roomRight)}px`; left = x + OFFSET; }
    else { el.style.maxWidth = `${Math.max(240, roomLeft)}px`; left = Math.max(8, x - OFFSET - el.offsetWidth); }
    let top = Math.max(8, y - LIFT);
    if (top + el.offsetHeight > window.innerHeight - 8) top = Math.max(8, window.innerHeight - el.offsetHeight - 8);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    // তালিকা কার্ডে না আঁটলে হেডারে "scroll" হিন্ট
    const sc = scrollerRef.current;
    if (hintRef.current && sc) hintRef.current.style.display = sc.scrollHeight > sc.clientHeight + 1 ? "inline" : "none";
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let insideCard = false;
    let overRow = false; // মাউস এখন কার্ডের বুকিং-এর row-এর উপর
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const keyOf = (list: any[]) => list.map((b) => b.id).join(",");
    const open = (list: any[], x: number, y: number) => {
      pos.current = { x, y };
      keyRef.current = keyOf(list);
      setBookings(list);
    };
    const close = () => {
      clear();
      insideCard = false;
      overRow = false;
      if (!keyRef.current) return;
      keyRef.current = "";
      setBookings(null);
    };

    controllerRef.current = {
      show(list, x, y) {
        if (insideCard) return;
        if (keyOf(list) === keyRef.current) { clear(); overRow = true; return; } // একই বুকিং — কার্ড যেখানে আছে সেখানেই
        clear();
        overRow = false;
        if (!keyRef.current) { open(list, x, y); overRow = true; }
        else timer = setTimeout(() => { open(list, x, y); overRow = true; }, SWITCH_DELAY);
      },
      hide() {
        overRow = false;
        if (insideCard) return;
        clear();
        timer = setTimeout(close, HIDE_DELAY);
      },
    };
    cardHandlers.current = {
      enter() { insideCard = true; clear(); },
      leave() { insideCard = false; clear(); timer = setTimeout(close, HIDE_DELAY); },
    };

    // পেজ scroll হলে কার্ড বন্ধ (নইলে আগের row-এর কার্ড ভুল জায়গায় থেকে যায়) — কার্ডের নিজের scroll বাদে
    const onScroll = (e: Event) => {
      if (cardRef.current && e.target instanceof Node && cardRef.current.contains(e.target)) return;
      close();
    };
    window.addEventListener("scroll", onScroll, true);

    // মাউস row-এর উপর থাকলেও wheel → কার্ডের তালিকা (যতক্ষণ সেদিকে আরো scroll বাকি); শেষ হলে পেজ scroll হয়।
    // (কার্ডের উপরে থাকলে ব্রাউজার নিজেই কার্ড scroll করে।) passive:false — নইলে পেজের scroll থামানো যায় না।
    const onWheel = (e: WheelEvent) => {
      if (!overRow || insideCard || !keyRef.current) return;
      const sc = scrollerRef.current;
      if (!sc || sc.scrollHeight <= sc.clientHeight + 1) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * sc.clientHeight : e.deltaY;
      const atTop = sc.scrollTop <= 0;
      const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1;
      if ((dy > 0 && atBottom) || (dy < 0 && atTop) || dy === 0) return;
      e.preventDefault();
      sc.scrollTop += dy;
    };
    window.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      clear();
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("wheel", onWheel);
      controllerRef.current = null;
      cardHandlers.current = null;
    };
  }, [controllerRef]);

  useLayoutEffect(place, [bookings]);

  if (!bookings || bookings.length === 0) return null;
  const multi = bookings.length > 1;
  const first = bookings[0];
  const th = "sticky top-0 bg-white px-2 py-1 text-right font-medium whitespace-nowrap";
  const td = "px-2 py-1 text-right whitespace-nowrap";

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => cardHandlers.current?.enter()}
      onMouseLeave={() => cardHandlers.current?.leave()}
      className="print:hidden fixed z-50 flex flex-col max-h-[calc(100vh-16px)] rounded-lg border border-gray-300 bg-white shadow-xl text-xs"
      style={{ left: -9999, top: -9999 }}
    >
      <div className="shrink-0 border-b bg-gray-50 px-3 py-1.5 rounded-t-lg">
        <span className="font-semibold text-gray-800">{first.booking_no}</span>
        <span className="ml-2 text-gray-500">
          {multi ? `${bookings.length}টি প্রোডাক্ট` : formatMeasurement(first)}
        </span>
        <span className="ml-2 text-[11px] text-gray-400">Pricing System</span>
        <span ref={hintRef} className="ml-2 text-[11px] text-blue-600" style={{ display: "none" }}>↕ মাউস wheel দিয়ে scroll করুন</span>
      </div>
      {/* লম্বা তালিকা এখানে scroll হয় — overscroll-contain: শেষে পৌঁছালেও পেছনের পেজ scroll হয় না */}
      <div ref={scrollerRef} className="min-h-0 overflow-auto overscroll-contain px-1 pb-1">
        <table>
          <thead className="text-gray-500">
            <tr>
              {multi && <th className="sticky top-0 bg-white px-2 py-1 text-left font-medium">Product</th>}
              <th className={th}>Price/Lbs</th>
              <th className={th}>Order Th. (mm)</th>
              <th className={th}>Prod. Th. (mm)</th>
              <th className={th}>PI Th. (mm)</th>
              <th className={th}>Colors</th>
              <th className={th}>Rate/Color</th>
              <th className={th}>Rate/Inch</th>
              <th className={th}>Adjust/Pc (±)</th>
            </tr>
          </thead>
          <tbody className="text-gray-800">
            {bookings.map((b) => {
              const p = pricingByBooking[b.id];
              if (!p) return null;
              const label = [b.style ? formatStyle(b.style) : "", formatMeasurement(b)].filter(Boolean).join(" · ");
              return (
                <tr key={b.id} className="border-t">
                  {multi && <td className="px-2 py-1 text-left text-gray-600 min-w-[140px] max-w-[220px]">{label}</td>}
                  <td className={td + " font-semibold"}>{p.pricePerLbs > 0 ? money(p.pricePerLbs) : "-"}</td>
                  <td className={td}>{num(p.orderThicknessMm)}</td>
                  <td className={td}>{num(p.productionThicknessMm)}</td>
                  <td className={td}>{num(p.piThicknessMm)}</td>
                  <td className={td}>{p.hasPrint ? p.printColors : <span className="text-gray-400">No Print</span>}</td>
                  <td className={td}>{p.hasPrint ? p.ratePerColor.toFixed(2) : <span className="text-gray-400">-</span>}</td>
                  <td className={td}>{p.hasAdhesive ? String(Number(p.ratePerInch.toFixed(4))) : <span className="text-gray-400">-</span>}</td>
                  <td className={td}>{adjustLabel(p.adjustmentPerPc)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
