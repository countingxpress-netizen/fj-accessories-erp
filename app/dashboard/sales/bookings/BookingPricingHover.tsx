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

function num(n: number) {
  return n > 0 ? String(Number(n.toFixed(4))) : "-";
}

function adjustLabel(n: number) {
  if (n > 0) return <span className="text-green-700">+{n.toFixed(2)}</span>;
  if (n < 0) return <span className="text-red-700">−{Math.abs(n).toFixed(2)}</span>;
  return <span className="text-gray-400">0.00</span>;
}

// Booking লিস্টে মাউস রাখলে ঐ বুকিং-এর Pricing System (Booking ফর্মের লাইন-২-এর ফিল্ডগুলো) দেখায়।
// কার্ডটা position:fixed — টেবিলের overflow-x-auto কন্টেইনারে কেটে যায় না। মাউস নড়লে শুধু DOM-এ
// পজিশন বদলায়, বুকিং বদলালেই কেবল re-render — বড় লিস্টে পুরো টেবিল বারবার রেন্ডার হয় না।
export default function BookingPricingHover({
  pricingByBooking, controllerRef,
}: {
  pricingByBooking: Record<string, BookingPricingSnapshot>;
  controllerRef: MutableRefObject<BookingPricingHoverController | null>;
}) {
  const [bookings, setBookings] = useState<any[] | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const keyRef = useRef("");

  function place() {
    const el = cardRef.current;
    if (!el) return;
    const { x, y } = pos.current;
    let left = x + OFFSET;
    let top = y + OFFSET;
    if (left + el.offsetWidth > window.innerWidth - 8) left = Math.max(8, x - el.offsetWidth - OFFSET);
    if (top + el.offsetHeight > window.innerHeight - 8) top = Math.max(8, y - el.offsetHeight - OFFSET);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  useEffect(() => {
    controllerRef.current = {
      show(list, x, y) {
        pos.current = { x, y };
        const key = list.map((b) => b.id).join(",");
        if (key !== keyRef.current) {
          keyRef.current = key;
          setBookings(list);
        } else {
          place();
        }
      },
      hide() {
        if (!keyRef.current) return;
        keyRef.current = "";
        setBookings(null);
      },
    };
    return () => { controllerRef.current = null; };
  }, [controllerRef]);

  useLayoutEffect(place, [bookings]);

  if (!bookings || bookings.length === 0) return null;
  const multi = bookings.length > 1;
  const first = bookings[0];
  const th = "px-2 py-1 text-right font-medium whitespace-nowrap";
  const td = "px-2 py-1 text-right whitespace-nowrap";

  return (
    <div
      ref={cardRef}
      className="print:hidden pointer-events-none fixed z-50 rounded-lg border border-gray-300 bg-white shadow-xl text-xs"
      style={{ left: -9999, top: -9999 }}
    >
      <div className="border-b bg-gray-50 px-3 py-1.5 rounded-t-lg">
        <span className="font-semibold text-gray-800">{first.booking_no}</span>
        <span className="ml-2 text-gray-500">
          {multi ? `${bookings.length}টি প্রোডাক্ট` : formatMeasurement(first)}
        </span>
        <span className="ml-2 text-[11px] text-gray-400">Pricing System</span>
      </div>
      <table className="m-1">
        <thead className="text-gray-500">
          <tr>
            {multi && <th className="px-2 py-1 text-left font-medium">Product</th>}
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
                {multi && <td className="px-2 py-1 text-left whitespace-nowrap text-gray-600">{label}</td>}
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
  );
}
