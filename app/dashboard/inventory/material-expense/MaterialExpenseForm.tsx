"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createMaterialExpense } from "@/lib/materialExpense";
import { monthRange, todayLocal } from "@/lib/payroll";
import { money, qty } from "@/lib/format";

type Material = { id: string; material_name: string; unit: string | null; avg_cost_per_lbs: number | null; inventory_account_code: string | null };
type Account = { id: string; account_code: string; account_name: string };

// ডিফল্ট তারিখ = চলতি মাসের শেষ দিন (মাস শেষে একবারে লেখার জন্য)
function monthEndOf(date: string) {
  return monthRange(+date.slice(0, 4), +date.slice(5, 7)).end;
}

export default function MaterialExpenseForm({
  materials, warehouses, stockMap, expenseAccounts,
}: {
  materials: Material[];
  warehouses: { id: string; name: string }[];
  stockMap: Record<string, Record<string, number>>;
  expenseAccounts: Account[];
}) {
  const supabase = createClient();
  const router = useRouter();

  // Material-এর নাম যে খরচের হেডে আছে সেটা ডিফল্ট (Adhesive → "এডহেসিভ খরচ")
  const headFor = (m?: Material) => {
    if (!m) return "";
    const n = m.material_name.toLowerCase();
    const hit = expenseAccounts.find((a) =>
      a.account_name.toLowerCase().includes(n) || (n.includes("adhes") && a.account_name.includes("এডহেসিভ")));
    return hit?.id ?? "";
  };
  const firstWh = (mid: string) => {
    const s = stockMap[mid] ?? {};
    return Object.keys(s).sort((a, b) => (s[b] ?? 0) - (s[a] ?? 0))[0] ?? warehouses[0]?.id ?? "";
  };

  const adhesive = materials.find((m) => m.material_name.toLowerCase().includes("adhes"));
  const [materialId, setMaterialId] = useState(adhesive?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(adhesive ? firstWh(adhesive.id) : "");
  const [date, setDate] = useState(monthEndOf(todayLocal()));
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState(String(adhesive?.avg_cost_per_lbs ?? ""));
  const [expenseAccountId, setExpenseAccountId] = useState(headFor(adhesive));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const material = materials.find((m) => m.id === materialId);
  const unitLabel = material?.unit === "carton" ? "কার্টন" : "Lbs";
  const inStock = stockMap[materialId]?.[warehouseId] ?? 0;
  const amount = useMemo(() => (parseFloat(quantity) || 0) * (parseFloat(rate) || 0), [quantity, rate]);

  function chooseMaterial(id: string) {
    setMaterialId(id);
    const m = materials.find((x) => x.id === id);
    setRate(String(m?.avg_cost_per_lbs ?? ""));
    setWarehouseId(firstWh(id));
    setExpenseAccountId(headFor(m) || expenseAccountId);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const q = parseFloat(quantity);
    if (!material || !warehouseId || !expenseAccountId || !(q > 0)) {
      setError("Material, গুদাম, খরচের হেড আর পরিমাণ দিন।");
      return;
    }
    if (q > inStock && !window.confirm(`এই গুদামে স্টক ${qty(inStock)} ${unitLabel} — তার বেশি (${q}) খরচ লিখবেন?`)) return;
    setSaving(true);
    const res = await createMaterialExpense(supabase, {
      date, materialId, materialName: material.material_name, inventoryAccountCode: material.inventory_account_code,
      warehouseId, quantity: q, rate: parseFloat(rate) || 0, expenseAccountId, note: note.trim(),
    });
    setSaving(false);
    if (!res.ok) { setError(res.error || "সেভ করা যায়নি"); return; }
    setQuantity(""); setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mb-6 space-y-3 rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-gray-800">নতুন খরচ লিখুন</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-gray-500">তারিখ</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Material</label>
          <select value={materialId} onChange={(e) => chooseMaterial(e.target.value)} className="min-w-[160px] rounded-lg border px-3 py-2 text-sm">
            <option value="">-- বাছুন --</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.material_name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">গুদাম</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {materialId && <div className="mt-0.5 text-[11px] text-gray-500">স্টক: {qty(inStock)} {unitLabel}</div>}
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">পরিমাণ ({unitLabel})</label>
          <input type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-28 rounded-lg border px-3 py-2 text-sm" placeholder="0" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">রেট (প্রতি {unitLabel})</label>
          <input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="w-28 rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">টাকা</label>
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold">{money(amount)}</div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">খরচের হেড (Expense)</label>
          <select value={expenseAccountId} onChange={(e) => setExpenseAccountId(e.target.value)} className="min-w-[180px] rounded-lg border px-3 py-2 text-sm">
            <option value="">-- বাছুন --</option>
            {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} {a.account_name}</option>)}
          </select>
        </div>
        <div className="min-w-[140px] flex-1">
          <label className="mb-1 block text-xs text-gray-500">নোট</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="যেমন সেপ্টেম্বর মাসের খরচ" />
        </div>
        <button type="submit" disabled={saving} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {saving ? "সেভ হচ্ছে..." : "সেভ করুন"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
