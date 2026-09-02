"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

function formatMeasurement(b: any, forStage: "blowing" | "other") {
  const unit = b.measurement_unit;
  const L = b.length_val, W = b.width_val, F = b.flap_val, G = b.gusset_val;
  if (forStage === "blowing") {
    if (b.measurement_type === "simple") return `W-${W} ${unit}`;
    if (b.measurement_type === "gusset") return `W-${W} + G-${G} ${unit}`;
    if (b.measurement_type === "adhesive") {
      const tube = L + F / 2;
      return `(L-${L} + F-${F}) = ${tube} ${unit}`;
    }
  } else {
    if (b.measurement_type === "simple") return `L-${L} x W-${W} ${unit}`;
    if (b.measurement_type === "gusset") return `L-${L} x W-${W} + G-${G} ${unit}`;
    if (b.measurement_type === "adhesive") return `L-${L} + F-${F} x W-${W} ${unit}`;
  }
  return "-";
}

const titles: Record<string, string> = {
  blowing: "Blowing Production Schedule",
  printing: "Printing Schedule",
  cutting: "Cutting Schedule",
};

export default function ScheduleGroupClient({
  bookings, company, groupId, initialType,
}: { bookings: any[]; company: any; groupId: string; initialType?: "blowing" | "printing" | "cutting" }) {
  const anyHasPrint = bookings.some((b) => b.has_print);
  const [scheduleType, setScheduleType] = useState<"blowing" | "printing" | "cutting">(initialType ?? "blowing");
  const [operatorName, setOperatorName] = useState("");
  const [remarks, setRemarks] = useState<Record<string, Record<string, string>>>(() => {
    const initial: Record<string, Record<string, string>> = { blowing: {}, printing: {}, cutting: {} };
    bookings.forEach((b) => {
      initial.blowing[b.id] = b.blowing_remark ?? "";
      initial.printing[b.id] = b.printing_remark ?? (b.has_print ? `${b.print_colors} কালার` : "");
      initial.cutting[b.id] = b.cutting_remark ?? "";
    });
    return initial;
  });

  const supabase = createClient();

  function updateRemark(bookingId: string, value: string) {
    setRemarks((prev) => ({
      ...prev,
      [scheduleType]: { ...prev[scheduleType], [bookingId]: value },
    }));
  }

  const first = bookings[0];
  const productionNo = first.production_orders?.[0]?.production_no ?? "-";
  const now = new Date();
  const dateStr = now.toLocaleDateString("bn-BD", { day: "2-digit", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit", hour12: true });
  const totalQty = bookings.reduce((s, b) => s + (b.quantity_pcs || 0), 0);
  const totalLbs = bookings.reduce((s, b) => s + (b.required_lbs || 0), 0);

  const printedColumn = scheduleType === "blowing" ? "blowing_printed" : scheduleType === "printing" ? "printing_printed" : "cutting_printed";
  const alreadyPrinted = bookings.some((b) => b[printedColumn]);

  async function handleSaveAndPrint() {
    const remarkColumn = scheduleType === "blowing" ? "blowing_remark" : scheduleType === "printing" ? "printing_remark" : "cutting_remark";
    for (const b of bookings) {
      await supabase.from("bookings").update({
        [remarkColumn]: remarks[scheduleType][b.id],
        [printedColumn]: true,
      }).eq("id", b.id);
    }
    setTimeout(() => window.print(), 200);
  }

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white text-gray-900">
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          .no-print { display: none !important; }
          .schedule-box { max-width: 100%; max-height: 148mm; overflow: hidden; }
        }
      `}</style>

      <div className="no-print mb-6 rounded-lg border bg-gray-50 p-4 space-y-3">
        <div>
          <label className="block text-sm text-gray-600 mb-1">এখন কোন মেশিনে শিডিউল দিতে চান?</label>
          <select
            value={scheduleType}
            onChange={(e) => setScheduleType(e.target.value as any)}
            className="w-full max-w-xs rounded-lg border px-3 py-2 text-sm"
          >
            <option value="blowing">Blowing</option>
            {anyHasPrint && <option value="printing">Printing</option>}
            <option value="cutting">Cutting</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">অপারেটরের নাম</label>
          <input
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            className="w-full max-w-sm rounded-lg border px-3 py-2 text-sm"
            placeholder="অপারেটরের নাম লিখুন"
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm text-gray-600">প্রতিটা লাইনের Remark (প্রয়োজনে বদলান):</p>
          {bookings.map((b) => (
            <div key={b.id} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-32 truncate">{b.style || b.product_details}</span>
              <input
                value={remarks[scheduleType][b.id] ?? ""}
                onChange={(e) => updateRemark(b.id, e.target.value)}
                className="flex-1 rounded border px-2 py-1 text-sm"
              />
            </div>
          ))}
        </div>

        <button
          onClick={handleSaveAndPrint}
          disabled={!operatorName.trim()}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {alreadyPrinted ? "আবার Print করুন" : "Save করে Print করুন"}
        </button>
        {!operatorName.trim() && <p className="text-xs text-orange-600">প্রিন্ট করার আগে অপারেটরের নাম দিন।</p>}
      </div>

      <div className="schedule-box border-2 border-gray-800">
        <div className="text-center border-b-2 border-gray-800 py-2">
          <h1 className="text-xl font-bold">{company?.name}</h1>
          <p className="text-xs text-gray-600">{company?.address}</p>
        </div>
        <div className="flex justify-between items-baseline px-4 py-2 border-b-2 border-gray-800">
          <h2 className="text-lg font-bold underline">{titles[scheduleType]}</h2>
          <p className="text-sm">Date: <strong>{dateStr}</strong> সময়: <strong>{timeStr}</strong></p>
        </div>
        <div className="px-4 py-2 border-b border-gray-400 text-sm">
          অপারেটর: <strong>{operatorName || "________________"}</strong>
        </div>
        <div className="grid grid-cols-2 border-b-2 border-gray-800">
          <div className="px-4 py-2 border-r border-gray-400 text-sm">
            বুকিং নাম্বার: <strong>{first.booking_no}</strong><br />
            Production No: <strong>{productionNo}</strong>
          </div>
          <div className="px-4 py-2 text-sm grid grid-cols-2">
            <div>Customer: <strong>{first.customers?.name}</strong></div>
            <div>Buyer: <strong>{first.buyers?.name ?? "-"}</strong></div>
          </div>
        </div>
        {first.product_details && (
          <p className="text-center py-2 border-b border-gray-400 font-medium">{first.product_details}</p>
        )}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-blue-500 text-white">
              <th className="border border-gray-800 py-2">স্টাইল</th>
              <th className="border border-gray-800 py-2">টিউব</th>
              {scheduleType === "blowing" && <th className="border border-gray-800 py-2">থিকনেস</th>}
              {scheduleType === "blowing" ? (
                <th className="border border-gray-800 py-2">এলবিএস</th>
              ) : (
                <th className="border border-gray-800 py-2">Quantity</th>
              )}
              <th className="border border-gray-800 py-2">মন্তব্য</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td className="border border-gray-800 text-center py-2">{b.style || "-"}</td>
                <td className="border border-gray-800 text-center py-2">
                  {formatMeasurement(b, scheduleType === "blowing" ? "blowing" : "other")}
                </td>
                {scheduleType === "blowing" && (
                  <td className="border border-gray-800 text-center py-2">{b.production_thickness_mm} mm</td>
                )}
                {scheduleType === "blowing" ? (
                  <td className="border border-gray-800 text-center py-2">{b.required_lbs?.toFixed(2)} Lbs</td>
                ) : (
                  <td className="border border-gray-800 text-center py-2">{b.quantity_pcs?.toLocaleString()}.00 Pcs</td>
                )}
                <td className="border border-gray-800 text-center py-2">{remarks[scheduleType][b.id]}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="border border-gray-800 text-center py-2" colSpan={scheduleType === "blowing" ? 2 : 1}>টোটাল =</td>
              {scheduleType === "blowing" ? (
                <td className="border border-gray-800 text-center py-2">{totalLbs.toFixed(2)} Lbs</td>
              ) : (
                <>
                  <td className="border border-gray-800 text-center py-2"></td>
                  <td className="border border-gray-800 text-center py-2">{totalQty.toLocaleString()}.00 Pcs</td>
                </>
              )}
              <td className="border border-gray-800"></td>
            </tr>
          </tbody>
        </table>
        <div className="flex justify-between px-6 py-6 text-sm">
          <div>অপারেটরের স্বাক্ষর</div>
          {scheduleType === "blowing" && <div>স্টোরের স্বাক্ষর</div>}
          {scheduleType === "blowing" && <div>প্রোডাকশন ম্যানেজার</div>}
          <div>অনুমোদনকারীর স্বাক্ষর</div>
        </div>
      </div>
    </div>
  );
}