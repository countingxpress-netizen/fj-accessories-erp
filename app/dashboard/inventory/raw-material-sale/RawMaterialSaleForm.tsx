"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/currentUser";
import { createRawMaterialSale, updateRawMaterialSale, toLbsEquiv, type RawMaterialSaleUnit } from "@/lib/rawMaterialSale";
import { money } from "@/lib/format";

type Material = { id: string; material_name: string; avg_cost_per_lbs: number };
type Customer = { id: string; name: string };
type Account = { id: string; account_code: string; account_name: string; account_type: string };
type Warehouse = { id: string; name: string };

export type RawMaterialSaleEdit = {
  id: string;
  saleDate: string;
  materialId: string;
  warehouseId: string;
  unit: RawMaterialSaleUnit;
  quantity: number;
  rate: number;
  party: string; // "cust:<id>" | "acct:<id>"
  paymentReceived: boolean;
  note: string;
};

const TYPE_LABEL: Record<string, string> = {
  asset: "Asset অ্যাকাউন্ট", liability: "Liability অ্যাকাউন্ট",
  equity: "Equity অ্যাকাউন্ট", income: "Income অ্যাকাউন্ট",
};

export default function RawMaterialSaleForm({
  materials, customers, partyAccounts, warehouses, stockMap, editSale,
}: {
  materials: Material[];
  customers: Customer[];
  partyAccounts: Account[];
  warehouses: Warehouse[];
  stockMap: Record<string, Record<string, number>>;
  editSale?: RawMaterialSaleEdit;
}) {
  const isEdit = !!editSale;
  const [saleDate, setSaleDate] = useState(editSale?.saleDate ?? new Date().toISOString().slice(0, 10));
  const [materialId, setMaterialId] = useState(editSale?.materialId ?? "");
  const [warehouseId, setWarehouseId] = useState(editSale?.warehouseId ?? "");
  const [unit, setUnit] = useState<RawMaterialSaleUnit>(editSale?.unit ?? "lbs");
  const [quantity, setQuantity] = useState(editSale ? String(editSale.quantity) : "");
  const [rate, setRate] = useState(editSale ? String(editSale.rate) : "");
  const [party, setParty] = useState(editSale?.party ?? "");
  const [paymentReceived, setPaymentReceived] = useState(editSale?.paymentReceived ?? false);
  const [note, setNote] = useState(editSale?.note ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const qtyN = parseFloat(quantity) || 0;
  const rateN = parseFloat(rate) || 0;
  const amount = Math.round(qtyN * rateN);
  const qtyLbs = toLbsEquiv(qtyN, unit); // স্টক তুলনার জন্য Lbs-এ
  const unitLabel = unit === "kg" ? "কেজি" : "Lbs";
  const selectedMaterial = materials.find((m) => m.id === materialId);
  const cogsPreview = selectedMaterial ? Math.round(qtyLbs * Number(selectedMaterial.avg_cost_per_lbs || 0) * 100) / 100 : 0;
  const availableInWarehouse = materialId && warehouseId ? (stockMap[materialId]?.[warehouseId] ?? 0) : 0;

  const accountsByType = partyAccounts.reduce<Record<string, Account[]>>((acc, a) => {
    (acc[a.account_type] ||= []).push(a);
    return acc;
  }, {});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!materialId) { setError("কোন Raw Material বিক্রি হচ্ছে বাছুন।"); return; }
    if (!warehouseId) { setError("কোন গুদাম থেকে বিক্রি হচ্ছে বাছুন।"); return; }
    if (!qtyN || qtyN <= 0) { setError("সঠিক Quantity দিন।"); return; }
    if (!rateN || rateN <= 0) { setError(`সঠিক Rate/${unitLabel} দিন।`); return; }
    if (!party) { setError("কার কাছে বিক্রি হচ্ছে বাছুন।"); return; }

    const [kind, id] = party.split(":");
    const label = kind === "cust"
      ? (customers.find((c) => c.id === id)?.name ?? "")
      : (() => { const a = partyAccounts.find((x) => x.id === id); return a ? `${a.account_code} - ${a.account_name}` : ""; })();

    setLoading(true);
    const createdBy = await getCurrentUserId(supabase);
    const payload = {
      saleDate, materialId, warehouseId,
      unit, quantity: qtyN, rate: rateN, amount,
      party: kind === "cust"
        ? { kind: "customer" as const, customerId: id, label }
        : { kind: "account" as const, accountId: id, label },
      paymentReceived, note, createdBy,
    };
    const result = isEdit
      ? await updateRawMaterialSale(supabase, editSale.id, payload)
      : await createRawMaterialSale(supabase, payload);
    setLoading(false);

    if (!result.ok) { setError(result.error ?? "সেভ ব্যর্থ হয়েছে।"); return; }
    if (result.error) setError(result.error);

    if (isEdit) {
      router.push("/dashboard/inventory/raw-material-sale");
      router.refresh();
      return;
    }
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

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Raw Material</label>
          <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[200px]" required>
            <option value="">-- বাছুন --</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.material_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">কোন গুদাম থেকে</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[200px]" required>
            <option value="">-- বাছুন --</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} {materialId ? `(${money(stockMap[materialId]?.[w.id] ?? 0)} Lbs)` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {materialId && warehouseId && qtyLbs > availableInWarehouse && (
        <p className="text-xs text-amber-600">
          সতর্কতা: এই গুদামে মাত্র {money(availableInWarehouse)} Lbs আছে — বিক্রির পর স্টক ঋণাত্মক হবে।
        </p>
      )}

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">একক</label>
          <select value={unit} onChange={(e) => setUnit(e.target.value as RawMaterialSaleUnit)} className="rounded-lg border px-3 py-2 text-sm w-24">
            <option value="lbs">Lbs</option>
            <option value="kg">Kg</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Quantity ({unitLabel})</label>
          <input type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Rate / {unitLabel}</label>
          <input type="number" step="0.0001" value={rate} onChange={(e) => setRate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Amount</label>
          <div className="rounded-lg border bg-gray-50 px-3 py-2 text-sm w-36 font-semibold">{money(amount)}</div>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">COGS (আনুমানিক)</label>
          <div className="rounded-lg border bg-gray-50 px-3 py-2 text-sm w-36 text-gray-600">{money(cogsPreview)}</div>
        </div>
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
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 border rounded-lg px-3 py-2">
        <input type="checkbox" checked={paymentReceived} onChange={(e) => setPaymentReceived(e.target.checked)} />
        Payment Received — <span className="text-gray-500">টিক থাকলে নগদ বিক্রি (Dr Cash in Hand), না থাকলে বাকি (Dr উপরের পার্টি)</span>
      </label>

      <div>
        <label className="block text-sm text-gray-600 mb-1">Note (ঐচ্ছিক)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : isEdit ? "পরিবর্তন সেভ করুন" : "বিক্রি সেভ করুন"}
      </button>
    </form>
  );
}
