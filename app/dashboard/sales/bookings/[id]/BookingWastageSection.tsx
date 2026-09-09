"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/currentUser";
import { formatDate } from "@/lib/formatDate";
import { money } from "@/lib/format";
import { recordBookingWastage, reverseBookingWastage } from "@/lib/bookingWastage";
import GuardedAction from "@/app/dashboard/GuardedAction";

type Material = { materialId: string; name: string; code: string; avgCost: number; bookingQtyLbs: number };
type Product = {
  bookingId: string;
  productionOrderId: string | null;
  label: string;
  requiredLbs: number;
  warehouseId: string;
  materials: Material[];
};
type Warehouse = { id: string; name: string };

const STAGE_LABEL: Record<string, string> = { blowing: "Blowing", printing: "Printing", cutting: "Cutting" };

export default function BookingWastageSection({
  bookingNo, products, warehouses, existing,
}: {
  bookingNo: string;
  products: Product[];
  warehouses: Warehouse[];
  existing: any[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const totalByBooking: Record<string, number> = {};
  existing.forEach((w) => {
    totalByBooking[w.booking_id] = (totalByBooking[w.booking_id] ?? 0) + Number(w.quantity_lbs || 0);
  });
  const grandExtra = existing.reduce((s, w) => s + Number(w.quantity_lbs || 0), 0);

  return (
    <div className="mt-4 rounded-xl border bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-semibold text-gray-800">
          ওয়েস্টেজ রেজিস্টার
          {grandExtra > 0 && <span className="ml-2 text-sm font-normal text-amber-700">মোট অতিরিক্ত: {money(grandExtra)} Lbs</span>}
        </span>
        <span className="text-gray-400 text-sm">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t px-4 py-4 space-y-5">
          <p className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-lg p-2">
            এখানে দেওয়া ওয়েস্টেজ Required Lbs-এর <strong>অতিরিক্ত</strong> ধরা হবে — কাঁচামাল স্টক থেকে
            material-অনুপাতে ঐ পরিমাণ কমবে (JV: Dr Wastage Loss / Cr Raw Material Inventory)।
          </p>

          {products.map((p) => (
            <ProductWastage
              key={p.bookingId}
              product={p}
              bookingNo={bookingNo}
              warehouses={warehouses}
              entries={existing.filter((w) => w.booking_id === p.bookingId)}
              totalExtra={totalByBooking[p.bookingId] ?? 0}
              onDone={() => router.refresh()}
              supabase={supabase}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductWastage({
  product, bookingNo, warehouses, entries, totalExtra, onDone, supabase,
}: {
  product: Product;
  bookingNo: string;
  warehouses: Warehouse[];
  entries: any[];
  totalExtra: number;
  onDone: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
}) {
  const [stage, setStage] = useState<"blowing" | "printing" | "cutting">("blowing");
  const [qty, setQty] = useState("");
  const [recycled, setRecycled] = useState(false);
  const [recycledWarehouseId, setRecycledWarehouseId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const qtyN = parseFloat(qty) || 0;

  async function handleSave() {
    setError("");
    if (!qtyN || qtyN <= 0) { setError("সঠিক Quantity দিন।"); return; }
    if (!product.warehouseId) { setError("এই বুকিং-এ গুদাম সেট নেই।"); return; }
    if (recycled && !recycledWarehouseId) { setError("Recycled Chips ফেরত দিতে গুদাম বাছুন।"); return; }

    setLoading(true);
    const createdBy = await getCurrentUserId(supabase);
    const r = await recordBookingWastage(supabase, {
      bookingId: product.bookingId,
      productionOrderId: product.productionOrderId,
      bookingNo,
      warehouseId: product.warehouseId,
      stage, quantityLbs: qtyN,
      recycled, recycledWarehouseId: recycled ? recycledWarehouseId : null,
      wastageDate: date, createdBy,
      materials: product.materials.map((m) => ({
        materialId: m.materialId, code: m.code, avgCost: m.avgCost, bookingQtyLbs: m.bookingQtyLbs,
      })),
    });
    setLoading(false);
    if (!r.ok) { setError(r.error ?? "সেভ ব্যর্থ হয়েছে।"); return; }
    setQty(""); setRecycled(false); setRecycledWarehouseId("");
    onDone();
  }

  async function handleDelete(w: any) {
    if (!window.confirm("এই ওয়েস্টেজ এন্ট্রি মুছবেন? স্টক ও JV ফেরত যাবে।")) return;
    await reverseBookingWastage(supabase, w);
    onDone();
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <p className="font-medium text-gray-800">{product.label}</p>
        <p className="text-xs text-gray-500">
          Required {money(product.requiredLbs)} Lbs
          {totalExtra > 0 && <> · অতিরিক্ত ওয়েস্টেজ <span className="text-amber-700">{money(totalExtra)}</span> · মোট খরচ <strong>{money(product.requiredLbs + totalExtra)}</strong></>}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">Stage</label>
          <select value={stage} onChange={(e) => setStage(e.target.value as "blowing" | "printing" | "cutting")} className="rounded border px-2 py-1 text-sm">
            <option value="blowing">Blowing</option>
            <option value="printing">Printing</option>
            <option value="cutting">Cutting</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">Wastage (Lbs)</label>
          <input type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} className="w-28 rounded border px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">তারিখ</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded border px-2 py-1 text-sm" />
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-700 pb-1">
          <input type="checkbox" checked={recycled} onChange={(e) => setRecycled(e.target.checked)} />
          Recycled Chips-এ ফেরত
        </label>
        {recycled && (
          <select value={recycledWarehouseId} onChange={(e) => setRecycledWarehouseId(e.target.value)} className="rounded border px-2 py-1 text-sm">
            <option value="">গুদাম বাছুন</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
        <button
          type="button" onClick={handleSave} disabled={loading}
          className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm text-white disabled:opacity-40"
        >
          {loading ? "..." : "যোগ করুন"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {entries.length > 0 && (
        <table className="mt-3 w-full text-xs">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-1">তারিখ</th><th className="py-1">Stage</th>
              <th className="py-1 text-right">Lbs</th><th className="py-1">Recycled</th>
              <th className="py-1"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((w) => (
              <tr key={w.id} className="border-t">
                <td className="py-1 text-gray-500">
                  {formatDate(w.wastage_date)}
                  {w.creator?.full_name && <span className="text-gray-400"> · {w.creator.full_name}</span>}
                </td>
                <td className="py-1">{STAGE_LABEL[w.stage] ?? w.stage}</td>
                <td className="py-1 text-right">{money(w.quantity_lbs)}</td>
                <td className="py-1">{w.recycled ? "হ্যাঁ" : "না"}</td>
                <td className="py-1 text-right">
                  <GuardedAction
                    table="wastage" recordId={w.id} recordLabel={`${bookingNo} ${formatDate(w.wastage_date)}`} action="delete"
                    onAllowed={() => handleDelete(w)}
                    className="rounded bg-red-50 px-2 py-0.5 text-[11px] text-red-700 hover:bg-red-100"
                  >
                    Delete
                  </GuardedAction>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
