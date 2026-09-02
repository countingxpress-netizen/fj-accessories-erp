"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { recomputeRawAvgCost } from "@/lib/inventoryCost";
import { getCurrentUserId } from "@/lib/currentUser";

const LBS_PER_BAG = 55;

type Supplier = { id: string; name: string };
type Warehouse = { id: string; name: string };
type Material = { id: string; material_name: string; inventory_account_code: string | null };
type Unit = "lbs" | "bags";
type Line = { material_id: string; quantity: string; unit: Unit; rate: string };

// পুরনো materials-এর inventory_account_code না থাকলে নাম থেকে ফলব্যাক
const fallbackAccountCode: Record<string, string> = {
  "LLDPE": "1200",
  "LDPE": "1201",
  "PP": "1202",
  "Recycled Chips": "1203",
};
function materialAccount(m: Material | undefined): string | undefined {
  return m?.inventory_account_code || (m ? fallbackAccountCode[m.material_name] : undefined) || "1299";
}

function lineQuantityLbs(l: Line): number {
  const qty = parseFloat(l.quantity) || 0;
  return l.unit === "bags" ? qty * LBS_PER_BAG : qty;
}

export default function PurchaseEntryForm({
  suppliers,
  warehouses,
  materials,
}: {
  suppliers: Supplier[];
  warehouses: Warehouse[];
  materials: Material[];
}) {
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceNo, setInvoiceNo] = useState("");
  const [isCash, setIsCash] = useState(false);
  const [purchaseSource, setPurchaseSource] = useState<"local" | "import">("local");
  const [lcNo, setLcNo] = useState("");
  const [lcDate, setLcDate] = useState("");
  const [billOfEntryNo, setBillOfEntryNo] = useState("");
  const [lines, setLines] = useState<Line[]>([{ material_id: "", quantity: "", unit: "lbs", rate: "" }]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function updateLine(i: number, field: keyof Line, value: string) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { material_id: "", quantity: "", unit: "lbs", rate: "" }]);
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  const totalAmount = lines.reduce(
    (sum, l) => sum + lineQuantityLbs(l) * (parseFloat(l.rate) || 0),
    0
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const validLines = lines.filter((l) => l.material_id && parseFloat(l.quantity) > 0 && parseFloat(l.rate) > 0);
    if (!supplierId || !warehouseId || validLines.length === 0) {
      setError("Supplier, Warehouse এবং অন্তত ১টা সঠিক লাইন থাকতে হবে।");
      return;
    }
    if (purchaseSource === "import" && !lcNo) {
      setError("Import Purchase-এর জন্য LC No দিতে হবে।");
      return;
    }

    setLoading(true);

    // ১. purchase_entries তৈরি (অটো entry number সহ)
    const entryNo = await generateNextDocNo(supabase, "purchase_entries", "entry_no", "PE", "entry_date", entryDate);
    const createdBy = await getCurrentUserId(supabase);
    const { data: entry, error: entryError } = await supabase
      .from("purchase_entries")
      .insert({
        entry_no: entryNo,
        supplier_id: supplierId,
        entry_date: entryDate,
        invoice_no: invoiceNo,
        payment_type: isCash ? "cash" : "credit",
        purchase_source: purchaseSource,
        lc_no: purchaseSource === "import" ? lcNo || null : null,
        lc_date: purchaseSource === "import" ? lcDate || null : null,
        bill_of_entry_no: purchaseSource === "import" ? billOfEntryNo || null : null,
        created_by: createdBy,
      })
      .select()
      .single();

    if (entryError || !entry) {
      setLoading(false);
      setError(entryError?.message ?? "Purchase Entry তৈরি ব্যর্থ হয়েছে।");
      return;
    }

    // ২. purchase_entry_items তৈরি
    const itemsToInsert = validLines.map((l) => ({
      entry_id: entry.id,
      material_id: l.material_id,
      quantity_lbs: lineQuantityLbs(l),
      unit: l.unit,
      entered_quantity: parseFloat(l.quantity),
      rate_per_lbs: parseFloat(l.rate),
    }));
    const { error: itemsError } = await supabase.from("purchase_entry_items").insert(itemsToInsert);
    if (itemsError) {
      setLoading(false);
      setError(itemsError.message);
      return;
    }

    // ৩. প্রতিটা material-এর জন্য raw_material_stock আপডেট + stock_ledger এন্ট্রি
    for (const l of validLines) {
      const qty = lineQuantityLbs(l);

      const { data: existingStock } = await supabase
        .from("raw_material_stock")
        .select("*")
        .eq("material_id", l.material_id)
        .eq("warehouse_id", warehouseId)
        .maybeSingle();

      if (existingStock) {
        await supabase
          .from("raw_material_stock")
          .update({ quantity_lbs: existingStock.quantity_lbs + qty, updated_at: new Date().toISOString() })
          .eq("id", existingStock.id);
      } else {
        await supabase
          .from("raw_material_stock")
          .insert({ material_id: l.material_id, warehouse_id: warehouseId, quantity_lbs: qty });
      }

      await supabase.from("stock_ledger").insert({
        item_type: "raw_material",
        item_id: l.material_id,
        warehouse_id: warehouseId,
        txn_type: "in",
        quantity: qty,
        reference_type: "purchase",
        reference_id: entry.id,
        txn_date: entryDate,
      });

      // এই material-এর weighted average খরচ নতুন করে হিসাব করুন (perpetual costing)
      await recomputeRawAvgCost(supabase, l.material_id);
    }

    // ৪. Cash হলে Cash (1000), না হলে Accounts Payable (2000) অ্যাকাউন্ট খুঁজুন
    const creditAccountCode = isCash ? "1000" : "2000";
    const creditAccountLabel = isCash ? "Cash (কোড 1000)" : "Accounts Payable (কোড 2000)";
    const { data: creditAccount } = await supabase
      .from("chart_of_accounts")
      .select("id")
      .eq("account_code", creditAccountCode)
      .single();

    if (!creditAccount) {
      setLoading(false);
      setError(`${creditAccountLabel} অ্যাকাউন্ট খুঁজে পাওয়া যায়নি।`);
      return;
    }

    // প্রতিটা material-এর Raw Material Inventory অ্যাকাউন্ট খুঁজুন
    const debitLines: { account_id: string; amount: string; memo: string }[] = [];
    for (const l of validLines) {
      const material = materials.find((m) => m.id === l.material_id);
      const code = materialAccount(material);
      if (!code) continue;
      const { data: acc } = await supabase.from("chart_of_accounts").select("id").eq("account_code", code).single();
      if (acc) {
        const qtyLbs = lineQuantityLbs(l);
        debitLines.push({
          account_id: acc.id,
          amount: (qtyLbs * parseFloat(l.rate)).toFixed(2),
          memo: `${material?.material_name} - ${l.quantity} ${l.unit === "bags" ? "Bags" : "Lbs"} @ ${l.rate}/Lbs`,
        });
      }
    }

    if (debitLines.length === 0) {
      setLoading(false);
      setError("কোনো Raw Material Inventory অ্যাকাউন্ট খুঁজে পাওয়া যায়নি — Journal Voucher তৈরি করা যায়নি (স্টক তবুও আপডেট হয়েছে)।");
      router.push("/dashboard/purchase/entry");
      router.refresh();
      return;
    }

    const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? "";
    // MAX-based (count-based নয় — ডিলিটের পর নম্বর collision হয়), বাকি সব JV-এর মতো
    const voucherNo = await generateNextDocNo(supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", entryDate);

    const { data: voucher, error: voucherError } = await supabase
      .from("journal_vouchers")
      .insert({
        voucher_no: voucherNo,
        voucher_date: entryDate,
        narration: `Purchase from ${supplierName}${invoiceNo ? ", Invoice " + invoiceNo : ""} (${isCash ? "Cash" : "Credit"})`,
        created_by: createdBy,
      })
      .select()
      .single();

    if (voucherError || !voucher) {
      setLoading(false);
      setError("Purchase Entry সেভ হয়েছে কিন্তু Journal Voucher তৈরি ব্যর্থ হয়েছে: " + (voucherError?.message ?? ""));
      router.push("/dashboard/purchase/entry");
      router.refresh();
      return;
    }

    const jvLines = [
      ...debitLines.map((d) => ({
        voucher_id: voucher.id,
        account_id: d.account_id,
        debit: parseFloat(d.amount),
        credit: 0,
        memo: d.memo,
      })),
      {
        voucher_id: voucher.id,
        account_id: creditAccount.id,
        debit: 0,
        credit: totalAmount,
        memo: isCash ? `Cash paid to ${supplierName}` : `Payable to ${supplierName}`,
      },
    ];

    const { error: jvLinesError } = await supabase.from("journal_entry_lines").insert(jvLines);

    // entry ↔ voucher লিংক রাখা হয় যাতে entry ডিলিটে সঠিক JV-টাও মুছে যায়
    await supabase.from("purchase_entries").update({ voucher_id: voucher.id }).eq("id", entry.id);

    setLoading(false);

    if (jvLinesError) {
      setError("Journal Voucher লাইন সেভ ব্যর্থ হয়েছে: " + jvLinesError.message);
      return;
    }

    router.push("/dashboard/purchase/entry");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Supplier</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[180px]" required>
            <option value="">-- বাছুন --</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Warehouse</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[180px]" required>
            <option value="">-- বাছুন --</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Entry Date</label>
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Invoice No</label>
          <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-gray-50 p-3">
        <div>
          <span className="block text-sm text-gray-600 mb-1">Payment</span>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isCash} onChange={(e) => setIsCash(e.target.checked)} />
            নগদে ক্রয় (Cash) — টিক না থাকলে বাকিতে (Credit)
          </label>
        </div>
        <div>
          <span className="block text-sm text-gray-600 mb-1">Purchase Source</span>
          <div className="flex gap-3 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" name="purchaseSource" checked={purchaseSource === "local"} onChange={() => setPurchaseSource("local")} />
              Local
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="purchaseSource" checked={purchaseSource === "import"} onChange={() => setPurchaseSource("import")} />
              Import
            </label>
          </div>
        </div>
        {purchaseSource === "import" && (
          <>
            <div>
              <label className="block text-sm text-gray-600 mb-1">LC No</label>
              <input value={lcNo} onChange={(e) => setLcNo(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">LC Date</label>
              <input type="date" value={lcDate} onChange={(e) => setLcDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Bill of Entry No</label>
              <input value={billOfEntryNo} onChange={(e) => setBillOfEntryNo(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
            </div>
          </>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2">Material</th>
              <th className="px-3 py-2 w-28">Quantity</th>
              <th className="px-3 py-2 w-24">Unit</th>
              <th className="px-3 py-2 w-32">Rate/Lbs</th>
              <th className="px-3 py-2 w-32">Amount</th>
              <th className="px-3 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">
                  <select value={l.material_id} onChange={(e) => updateLine(i, "material_id", e.target.value)} className="w-full rounded border px-2 py-1 text-sm">
                    <option value="">-- বাছুন --</option>
                    {materials.map((m) => <option key={m.id} value={m.id}>{m.material_name}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input type="number" step="0.01" value={l.quantity} onChange={(e) => updateLine(i, "quantity", e.target.value)} className="w-full rounded border px-2 py-1 text-sm" />
                </td>
                <td className="px-3 py-2">
                  <select value={l.unit} onChange={(e) => updateLine(i, "unit", e.target.value)} className="w-full rounded border px-2 py-1 text-sm">
                    <option value="lbs">Lbs</option>
                    <option value="bags">Bags</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input type="number" step="0.01" value={l.rate} onChange={(e) => updateLine(i, "rate", e.target.value)} className="w-full rounded border px-2 py-1 text-sm" />
                </td>
                <td className="px-3 py-2 text-right">
                  {(lineQuantityLbs(l) * (parseFloat(l.rate) || 0)).toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right">
                  {lines.length > 1 && (
                    <button type="button" onClick={() => removeLine(i)} className="text-red-600 text-xs hover:underline">সরান</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t font-medium">
            <tr>
              <td colSpan={4} className="px-3 py-2 text-right">Total</td>
              <td className="px-3 py-2 text-right">{totalAmount.toFixed(2)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <button type="button" onClick={addLine} className="rounded-lg border border-dashed px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
        + আরেকটি লাইন যোগ করুন
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Purchase Entry সেভ করুন"}
      </button>
    </form>
  );
}
