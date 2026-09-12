"use client";

// লিস্ট পেজগুলোর জন্য শেয়ার্ড সার্চ/ফিল্টার বার — নিজে কোনো state রাখে না, শুধু
// controlled input/select দেখায়। ফিল্টারিং লজিক প্রতিটা পেজের নিজের Table কম্পোনেন্টে
// (client-side, ইতিমধ্যে ফেচ করা ডেটার উপর) — কারণ "customer" মানে কোথাও pi.customers?.name,
// কোথাও booking.customers?.name, তাই লজিক শেয়ার করা যায় না, UI-টাই যায়।
export type Option = { value: string; label: string };

export default function ListFilterBar({
  search, onSearchChange, searchPlaceholder = "সার্চ করুন...",
  customers, customerId, onCustomerChange,
  buyers, buyerId, onBuyerChange,
  garmentsOptions, garments, onGarmentsChange,
  dateFrom, onDateFromChange, dateTo, onDateToChange,
  onClear,
}: {
  search?: string; onSearchChange?: (v: string) => void; searchPlaceholder?: string;
  customers?: Option[]; customerId?: string; onCustomerChange?: (v: string) => void;
  buyers?: Option[]; buyerId?: string; onBuyerChange?: (v: string) => void;
  garmentsOptions?: Option[]; garments?: string; onGarmentsChange?: (v: string) => void;
  dateFrom?: string; onDateFromChange?: (v: string) => void;
  dateTo?: string; onDateToChange?: (v: string) => void;
  onClear?: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border bg-gray-50 p-3">
      {onSearchChange && (
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">সার্চ</label>
          <input
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-48 rounded-lg border px-3 py-1.5 text-sm"
          />
        </div>
      )}
      {customers && onCustomerChange && (
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Customer</label>
          <select value={customerId ?? ""} onChange={(e) => onCustomerChange(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm min-w-[160px]">
            <option value="">সব</option>
            {customers.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      )}
      {buyers && onBuyerChange && (
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Buyer</label>
          <select value={buyerId ?? ""} onChange={(e) => onBuyerChange(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm min-w-[140px]">
            <option value="">সব</option>
            {buyers.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </div>
      )}
      {garmentsOptions && onGarmentsChange && (
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Garments</label>
          <select value={garments ?? ""} onChange={(e) => onGarmentsChange(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm min-w-[160px]">
            <option value="">সব</option>
            {garmentsOptions.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>
      )}
      {onDateFromChange && (
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">তারিখ (থেকে)</label>
          <input type="date" value={dateFrom ?? ""} onChange={(e) => onDateFromChange(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm" />
        </div>
      )}
      {onDateToChange && (
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">তারিখ (পর্যন্ত)</label>
          <input type="date" value={dateTo ?? ""} onChange={(e) => onDateToChange(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm" />
        </div>
      )}
      {onClear && (
        <button type="button" onClick={onClear} className="rounded-lg border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
          Clear
        </button>
      )}
    </div>
  );
}
