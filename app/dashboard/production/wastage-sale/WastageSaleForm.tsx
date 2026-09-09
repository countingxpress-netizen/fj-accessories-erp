"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/currentUser";
import { createWastageSale, type WastageSaleSource } from "@/lib/wastageSale";
import { money } from "@/lib/format";

type Customer = { id: string; name: string };
type Account = { id: string; account_code: string; account_name: string; account_type: string };
type Warehouse = { id: string; name: string };

const TYPE_LABEL: Record<string, string> = {
  asset: "Asset অ্যাকাউন্ট", liability: "Liability অ্যাকাউন্ট",
  equity: "Equity অ্যাকাউন্ট", income: "Income অ্যাকাউন্ট",
};

export default function WastageSaleForm({
  customers, partyAccounts, warehouses, availableWastageLbs, recycledStockByWarehouse, recycledAvgCost,
}: {
  customers: Customer[];
  partyAccounts: Account[];
  warehouses: Warehouse[];
  availableWastageLbs: number;
  recycledStockByWarehouse: Record<string, number>;
  recycledAvgCost: number;
}) {
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState<WastageSaleSource>("wastage_stock");
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [party, setParty] = useState(""); // "cust:<id>" | "acct:<id>"
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const qtyN = parseFloat(quantity) || 0;
  const rateN = parseFloat(rate) || 0;
  const amount = Math.round(qtyN * rateN);
  const fromRecycled = source === "recycled_chips";
  const cogsPreview = fromRecycled ? Math.round(qtyN * recycledAvgCost * 100) / 100 : 0;
  const availableInWarehouse = warehouseId ? (recycledStockByWarehouse[warehouseId] ?? 0) : 0;

  const accountsByType = partyAccounts.reduce<Record<string, Account[]>>((acc, a) => {
    (acc[a.account_type] ||= []).push(a);
    return acc;
  }, {});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!qtyN || qtyN <= 0) { setError("সঠিক Quantity দিন।"); return; }
    if (!rateN || rateN <= 0) { setError("সঠিক Rate/Lbs দিন।"); return; }
    if (fromRecycled && !warehouseId) { setError("কোন গুদামের Recycled Chips বিক্রি হচ্ছে বাছুন।"); return; }
    if (!party) { setError("কার কাছে বিক্রি হচ্ছে বাছুন।"); return; }

    const [kind, id] = party.split(":");
    const label = kind === "cust"
      ? (customers.find((c) => c.id === id)?.name ?? "")
      : (() => { const a = partyAccounts.find((x) => x.id === id); return a ? `${a.account_code} - ${a.account_name}` : ""; })();

    setLoading(true);
    const createdBy = await getCurrentUserId(supabase);
    const result = await createWastageSale(supabase, {
      saleDate, source,
      warehouseId: fromRecycled ? warehouseId : null,
      quantityLbs: qtyN, ratePerLbs: rateN, amount,
      party: kind === "cust"
        ? { kind: "customer", customerId: id, label }
        : { kind: "account", accountId: id, label },
      note, createdBy,
    });
    setLoading(false);

    if (!result.ok) { setError(result.error ?? "সেভ ব্যর্থ হয়েছে।"); return; }
    if (result.error) setError(result.error);

    setQuantity(""); setRate(""); setParty(""); setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-2xl">
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">তারিখ</label>
          <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">উৎস</label>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={source === "wastage_stock"} onChange={() => setSource("wastage_stock")} />
            Wastage stock (non-recycled) — <span className="text-gray-500">available {money(availableWastageLbs)} Lbs · COGS নেই</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={source === "recycled_chips"} onChange={() => setSource("recycled_chips")} />
            Recycled Chips inventory — <span className="text-gray-500">স্টক কমবে + COGS</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={source === "loose"} onChange={() => setSource("loose")} />
            আলগা স্ক্র্যাপ — <span className="text-gray-500">স্টকে ট্র্যাক নেই</span>
          </label>
        </div>
      </div>

      {source === "wastage_stock" && qtyN > availableWastageLbs && (
        <p className="text-xs text-amber-600">
          সতর্কতা: রেকর্ড করা Wastage stock মাত্র {money(availableWastageLbs)} Lbs — এর বেশি বিক্রি দেখাচ্ছে।
        </p>
      )}

      {fromRecycled && (
        <div>
          <label className="block text-sm text-gray-600 mb-1">কোন গুদাম থেকে</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[220px]">
            <option value="">-- বাছুন --</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({money(recycledStockByWarehouse[w.id] ?? 0)} Lbs)
              </option>
            ))}
          </select>
          {warehouseId && qtyN > availableInWarehouse && (
            <p className="mt-1 text-xs text-amber-600">
              সতর্কতা: এই গুদামে মাত্র {money(availableInWarehouse)} Lbs আছে — বিক্রির পর স্টক ঋণাত্মক হবে।
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Quantity (Lbs)</label>
          <input type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-36" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Rate / Lbs</label>
          <input type="number" step="0.0001" value={rate} onChange={(e) => setRate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-36" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Amount</label>
          <div className="rounded-lg border bg-gray-50 px-3 py-2 text-sm w-36 font-semibold">{money(amount)}</div>
        </div>
        {fromRecycled && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">COGS (আনুমানিক)</label>
            <div className="rounded-lg border bg-gray-50 px-3 py-2 text-sm w-36 text-gray-600">{money(cogsPreview)}</div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">কার কাছে বিক্রি</label>
        <select value={party} onChange={(e) => setParty(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
          <option value="">-- বাছুন --</option>
          {customers.length > 0 && (
            <optgroup label="Customer">
              {customers.map((c) => <option key={c.id} value={`cust:${c.id}`}>{c.name}</option>)}
            </optgroup>
          )}
          {["asset", "liability", "equity", "income"].map((t) => (
            (accountsByType[t] ?? []).length > 0 && (
              <optgroup key={t} label={TYPE_LABEL[t]}>
                {accountsByType[t].map((a) => (
                  <option key={a.id} value={`acct:${a.id}`}>{a.account_code} - {a.account_name}</option>
                ))}
              </optgroup>
            )
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-400">
          Customer বাছলে তার বাকির খাতায় (Dr 1100) যাবে; অ্যাকাউন্ট বাছলে সরাসরি ঐ অ্যাকাউন্টে Dr হবে (যেমন নগদ পেলে &quot;Cash in Hand&quot;)।
        </p>
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">Note (ঐচ্ছিক)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "বিক্রি সেভ করুন"}
      </button>
    </form>
  );
}
