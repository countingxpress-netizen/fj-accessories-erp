"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/currentUser";
import { generatePiNo, splitPiNoForEdit, composePiNoFromParts, type PiNoParts } from "@/lib/docNumber";
import { money } from "@/lib/format";
import { amountInWords } from "@/lib/numberToWords";
import { insertPiGroup, type ParsedPiGroup, type ParsedPiItem } from "@/lib/piBulkImport";
import { parsePiDocument } from "@/lib/piSmartParse";

type Line = {
  description: string; measurement: string; qtyPcs: string; priceUnit: string; priceBasis: "pcs" | "dzn";
  tubeInch: string; cuttingInch: string; thicknessMm: string;
};

function toLine(it: ParsedPiItem): Line {
  return {
    description: it.description, measurement: it.measurement, qtyPcs: String(it.qtyPcs || ""),
    priceUnit: String(it.priceUnit || ""), priceBasis: it.priceBasis,
    tubeInch: it.tubeInch != null ? String(it.tubeInch.toFixed(3)) : "",
    cuttingInch: it.cuttingInch != null ? String(it.cuttingInch.toFixed(3)) : "",
    thicknessMm: it.thicknessMm != null ? String(it.thicknessMm) : "",
  };
}

const emptyLine: Line = { description: "", measurement: "", qtyPcs: "", priceUnit: "", priceBasis: "pcs", tubeInch: "", cuttingInch: "", thicknessMm: "" };

export default function UploadPiForm({ customers }: { customers: { id: string; name: string; code: string | null }[] }) {
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fileError, setFileError] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [piDate, setPiDate] = useState("");
  const [validTill, setValidTill] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [garmentsName, setGarmentsName] = useState("");
  const [garmentsAddress, setGarmentsAddress] = useState("");
  const [itemDescription, setItemDescription] = useState("Poly Bags");
  const [currency, setCurrency] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState("107");
  const [discountType, setDiscountType] = useState<"none" | "percentage" | "fixed">("none");
  const [discountValue, setDiscountValue] = useState("0");
  const [adjustmentAmount, setAdjustmentAmount] = useState("0");
  const [hsCode, setHsCode] = useState("3923.21.00");
  const [binNo, setBinNo] = useState("000113803-1201");
  const [advisingBankName, setAdvisingBankName] = useState("");
  const [advisingBankBranch, setAdvisingBankBranch] = useState("");
  const [advisingBankAddress, setAdvisingBankAddress] = useState("");
  const [advisingBankSwift, setAdvisingBankSwift] = useState("");
  const [amountNotes, setAmountNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);

  // PI No — সিরিয়াল আর কাস্টমার কোড দুটোই এডিটেবল, বাকিটা (PI/FNJ-, /year) fixed —
  // সিস্টেমের numbering rule (PI/FNJ-{serial}-{CODE}/{year}) অনুযায়ী customer/PI Date
  // বদলালেই অটো রিফ্রেশ হয় (splitPiNoForEdit/composePiNoFromParts, lib/docNumber.ts)।
  const [piNoParts, setPiNoParts] = useState<PiNoParts | null>(null);
  const [piNoTouched, setPiNoTouched] = useState(false);
  const [sourcePiNoRaw, setSourcePiNoRaw] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ piNo: string; piId?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSuccess(null);
    setError("");
    setFileError("");
    setFileName(file.name);
    const { result, fileError: err } = await parsePiDocument(file, customers);
    if (err || !result) { setFileError(err ?? "পার্স ব্যর্থ"); setParsed(false); return; }

    setCustomerId(result.customerId ?? "");
    setPiDate(result.piDate);
    setValidTill(result.validTill);
    setBuyerName(result.buyerName);
    setMerchantName(result.merchantName);
    setGarmentsName(result.garmentsName);
    setGarmentsAddress(result.garmentsAddress);
    setItemDescription(result.itemDescription);
    setCurrency(result.currency);
    setExchangeRate(String(result.exchangeRate));
    setDiscountType(result.discountType);
    setDiscountValue(String(result.discountValue));
    setAdjustmentAmount(String(result.adjustmentAmount));
    setHsCode(result.hsCode);
    setBinNo(result.binNo);
    setAdvisingBankName(result.advisingBankName);
    setAdvisingBankBranch(result.advisingBankBranch);
    setAdvisingBankAddress(result.advisingBankAddress);
    setAdvisingBankSwift(result.advisingBankSwift);
    setAmountNotes(result.amountNotes);
    setLines(result.items.length ? result.items.map(toLine) : [{ ...emptyLine }]);
    setWarnings(result.warnings);
    setSourcePiNoRaw(result.sourcePiNoRaw);
    setPiNoTouched(false);
    setPiNoParts(null);
    setParsed(true);
  }

  // Customer বা PI Date বদলালে সিস্টেমের পরবর্তী PI No সাজেস্ট করে — ইউজার সিরিয়াল/কোড নিজে
  // বদলে থাকলে (piNoTouched) সেই মান দুটো অক্ষুণ্ণ থাকে, বাকিটা (prefix/year) রিফ্রেশ হয়।
  useEffect(() => {
    if (!parsed || !customerId || !piDate) return;
    let cancelled = false;
    (async () => {
      const customer = customers.find((c) => c.id === customerId) ?? null;
      const suggested = await generatePiNo(supabase, customer, piDate);
      if (cancelled) return;
      const split = splitPiNoForEdit(suggested);
      if (!split) return;
      setPiNoParts((prev) => {
        if (piNoTouched && prev && prev.style === split.style) {
          return split.style === "coded" && prev.style === "coded"
            ? { ...split, serial: prev.serial, code: prev.code }
            : split.style === "plain" && prev.style === "plain"
            ? { ...split, serial: prev.serial }
            : split;
        }
        return split;
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, piDate, parsed]);

  function updateLine(i: number, field: keyof Line, value: string) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  }
  function addLine() { setLines((prev) => [...prev, { ...emptyLine }]); }
  function removeLine(i: number) { setLines((prev) => prev.filter((_, idx) => idx !== i)); }

  function calcLineAmount(qtyPcs: number, priceUnit: number, basis: "pcs" | "dzn") {
    return Math.round((basis === "dzn" ? (qtyPcs / 12) * priceUnit : qtyPcs * priceUnit) * 100) / 100;
  }

  const lineItems: ParsedPiItem[] = lines
    .filter((l) => l.description && parseFloat(l.qtyPcs) > 0)
    .map((l) => {
      const qtyPcs = parseFloat(l.qtyPcs) || 0;
      const priceUnit = parseFloat(l.priceUnit) || 0;
      const tubeInch = parseFloat(l.tubeInch) || 0;
      const cuttingInch = parseFloat(l.cuttingInch) || 0;
      const thicknessMm = parseFloat(l.thicknessMm) || 0;
      const weightKg = tubeInch > 0 && cuttingInch > 0 && thicknessMm > 0 ? (qtyPcs * tubeInch * cuttingInch * thicknessMm) / 75000 / 2.2 : 0;
      return {
        description: l.description, measurement: l.measurement, qtyPcs, priceUnit, priceBasis: l.priceBasis,
        tubeInch: tubeInch || null, cuttingInch: cuttingInch || null, thicknessMm: thicknessMm || null,
        amount: calcLineAmount(qtyPcs, priceUnit, l.priceBasis), weightKg,
      };
    });

  const subtotal = lineItems.reduce((s, it) => s + it.amount, 0);
  const discountAmount = discountType === "percentage" ? (subtotal * (parseFloat(discountValue) || 0)) / 100
    : discountType === "fixed" ? (parseFloat(discountValue) || 0) : 0;
  const totalAmount = Math.max(subtotal - discountAmount + (parseFloat(adjustmentAmount) || 0), 0);
  const totalWeightKg = lineItems.reduce((s, it) => s + it.weightKg, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!customerId) { setError("Customer বাছুন।"); return; }
    if (lineItems.length === 0) { setError("অন্তত একটা লাইন আইটেম (Description, Qty, Price) দিন।"); return; }
    if (!piDate) { setError("PI Date দিন।"); return; }
    if (!piNoParts || !piNoParts.serial || (piNoParts.style === "coded" && !piNoParts.code)) {
      setError("PI No তৈরি হয়নি — Customer/PI Date ঠিক আছে কিনা দেখুন।");
      return;
    }

    setLoading(true);
    const finalPiNo = composePiNoFromParts(piNoParts);
    const createdBy = await getCurrentUserId(supabase);
    const customer = customers.find((c) => c.id === customerId) ?? null;

    const g: ParsedPiGroup = {
      group: "1", customerName: garmentsName, customerId,
      piDate, validTill,
      buyerName, merchantName,
      garmentsName, garmentsId: null, garmentsAddress,
      itemDescription, currency, exchangeRate: parseFloat(exchangeRate) || 107,
      discountType, discountValue: parseFloat(discountValue) || 0, adjustmentAmount: parseFloat(adjustmentAmount) || 0,
      hsCode, binNo, totalWeightKgOverride: Math.round(totalWeightKg * 100) / 100 || null,
      realAmount: null, commissionAmount: null, amountNotes,
      items: lineItems, subtotal, discountAmount, totalAmount, autoWeightKg: totalWeightKg,
      errors: [],
    };

    const result = await insertPiGroup(supabase, g, customer, createdBy, {
      name: advisingBankName, branch: advisingBankBranch, address: advisingBankAddress, swift: advisingBankSwift,
    }, finalPiNo);
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    setSuccess({ piNo: result.piNo });
    router.refresh();
  }

  function reset() {
    setParsed(false); setFileError(""); setFileName(""); setSuccess(null); setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4 shadow-sm flex flex-wrap items-center gap-3">
        <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleFile} className="text-sm" />
        {fileName && <span className="text-xs text-gray-500">{fileName}</span>}
        {parsed && <button type="button" onClick={reset} className="text-xs text-gray-500 hover:underline">রিসেট</button>}
      </div>

      {fileError && <p className="text-sm text-red-600">{fileError}</p>}

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium mb-1">⚠ চেক করুন:</p>
          <ul className="list-disc pl-5 space-y-0.5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          ✓ PI তৈরি হয়েছে — নম্বর: <strong>{success.piNo}</strong>{" "}
          <a href="/dashboard/lc-export/proforma" className="underline">লিস্টে দেখুন →</a>
        </div>
      )}

      {parsed && !success && (
        <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 max-w-xs">
              <label className="block text-sm text-gray-600 mb-1">Customer *</label>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
                <option value="">-- বাছুন --</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {!customerId && garmentsName && (
                <p className="text-[11px] text-amber-600 mt-1">ফাইলে পাওয়া নাম: &quot;{garmentsName}&quot; — মিলিয়ে বাছুন</p>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">PI No</label>
              {piNoParts?.style === "coded" ? (
                <div className="flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm">
                  <span className="text-gray-500 whitespace-nowrap">{piNoParts.prefix}</span>
                  <input
                    value={piNoParts.serial}
                    onChange={(e) => {
                      const serial = e.target.value.replace(/[^0-9]/g, "");
                      setPiNoParts((p) => (p ? { ...p, serial } : p));
                      setPiNoTouched(true);
                    }}
                    className="w-12 border-b border-gray-300 text-center outline-none"
                  />
                  <span className="text-gray-500">-</span>
                  <input
                    value={piNoParts.code}
                    onChange={(e) => {
                      const code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
                      setPiNoParts((p) => (p && p.style === "coded" ? { ...p, code } : p));
                      setPiNoTouched(true);
                    }}
                    className="w-16 border-b border-gray-300 text-center outline-none"
                  />
                  <span className="text-gray-500 whitespace-nowrap">/{piNoParts.year}</span>
                </div>
              ) : piNoParts?.style === "plain" ? (
                <div className="flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm">
                  <span className="text-gray-500 whitespace-nowrap">{piNoParts.prefix}{piNoParts.year}-</span>
                  <input
                    value={piNoParts.serial}
                    onChange={(e) => {
                      const serial = e.target.value.replace(/[^0-9]/g, "");
                      setPiNoParts((p) => (p ? { ...p, serial } : p));
                      setPiNoTouched(true);
                    }}
                    className="w-16 border-b border-gray-300 text-center outline-none"
                  />
                </div>
              ) : (
                <div className="rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-400">Customer বাছুন</div>
              )}
              {sourcePiNoRaw && <p className="text-[11px] text-gray-400 mt-1">Excel-এর পুরনো নম্বর: {sourcePiNoRaw}</p>}
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">PI Date</label>
              <input type="date" value={piDate} onChange={(e) => setPiDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Valid Till</label>
              <input type="date" value={validTill} onChange={(e) => setValidTill(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                <option value="USD">USD</option><option value="BDT">BDT</option><option value="EUR">EUR</option>
              </select>
            </div>
            {currency === "USD" && (
              <div>
                <label className="block text-sm text-gray-600 mb-1">USD → BDT Rate</label>
                <input type="number" step="0.01" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-28" />
              </div>
            )}
          </div>

          <div className="rounded-lg border p-3 bg-gray-50 space-y-3">
            <p className="text-sm font-semibold text-gray-700">Garments (TO) / Buyer</p>
            <div className="flex flex-wrap gap-3">
              <input value={garmentsName} onChange={(e) => setGarmentsName(e.target.value)} placeholder="Garments Name" className="flex-1 min-w-[180px] rounded-lg border px-3 py-2 text-sm" />
              <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Buyer Name (যেমন H&M/GP/Miles)" className="flex-1 min-w-[180px] rounded-lg border px-3 py-2 text-sm" />
              <input value={merchantName} onChange={(e) => setMerchantName(e.target.value)} placeholder="Merchant Name" className="flex-1 min-w-[180px] rounded-lg border px-3 py-2 text-sm" />
            </div>
            <textarea value={garmentsAddress} onChange={(e) => setGarmentsAddress(e.target.value)} rows={2} placeholder="Garments Address" className="w-full rounded-lg border px-3 py-2 text-sm" />
            <input value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} placeholder="Item (Poly Bags (0.012cm))" className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Measurement</th>
                  <th className="px-3 py-2 text-right w-24">Qty (Pcs)</th>
                  <th className="px-3 py-2 w-20">Basis</th>
                  <th className="px-3 py-2 w-28">Price/Unit</th>
                  <th className="px-3 py-2 w-20">Tube&quot;</th>
                  <th className="px-3 py-2 w-20">Cutting&quot;</th>
                  <th className="px-3 py-2 w-20">Thick(mm)</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2"><input value={l.description} onChange={(e) => updateLine(i, "description", e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
                    <td className="px-3 py-2"><input value={l.measurement} onChange={(e) => updateLine(i, "measurement", e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
                    <td className="px-3 py-2"><input type="number" value={l.qtyPcs} onChange={(e) => updateLine(i, "qtyPcs", e.target.value)} className="w-full rounded border px-2 py-1 text-sm text-right" /></td>
                    <td className="px-3 py-2">
                      <select value={l.priceBasis} onChange={(e) => updateLine(i, "priceBasis", e.target.value)} className="w-full rounded border px-1 py-1 text-xs">
                        <option value="pcs">Per Pc</option><option value="dzn">Per Dzn</option>
                      </select>
                    </td>
                    <td className="px-3 py-2"><input type="number" step="0.0001" value={l.priceUnit} onChange={(e) => updateLine(i, "priceUnit", e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
                    <td className="px-3 py-2"><input type="number" step="0.01" value={l.tubeInch} onChange={(e) => updateLine(i, "tubeInch", e.target.value)} className="w-full rounded border px-2 py-1 text-xs" /></td>
                    <td className="px-3 py-2"><input type="number" step="0.01" value={l.cuttingInch} onChange={(e) => updateLine(i, "cuttingInch", e.target.value)} className="w-full rounded border px-2 py-1 text-xs" /></td>
                    <td className="px-3 py-2"><input type="number" step="0.1" value={l.thicknessMm} onChange={(e) => updateLine(i, "thicknessMm", e.target.value)} className="w-full rounded border px-2 py-1 text-xs" /></td>
                    <td className="px-3 py-2 text-right">{money(calcLineAmount(parseFloat(l.qtyPcs) || 0, parseFloat(l.priceUnit) || 0, l.priceBasis))}</td>
                    <td className="px-3 py-2 text-right">{lines.length > 1 && <button type="button" onClick={() => removeLine(i)} className="text-red-600 text-xs hover:underline">সরান</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={addLine} className="w-full border-t px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">+ আরেকটি লাইন যোগ করুন</button>
          </div>

          <div className="rounded-lg border p-3 bg-gray-50 space-y-3">
            <p className="text-sm font-semibold text-gray-700">Advising Bank</p>
            <div className="flex flex-wrap gap-3">
              <input value={advisingBankName} onChange={(e) => setAdvisingBankName(e.target.value)} placeholder="Bank Name" className="flex-1 min-w-[160px] rounded-lg border px-3 py-2 text-sm" />
              <input value={advisingBankBranch} onChange={(e) => setAdvisingBankBranch(e.target.value)} placeholder="Branch/Local Office" className="flex-1 min-w-[160px] rounded-lg border px-3 py-2 text-sm" />
            </div>
            <div className="flex flex-wrap gap-3">
              <input value={advisingBankAddress} onChange={(e) => setAdvisingBankAddress(e.target.value)} placeholder="ঠিকানা" className="flex-1 min-w-[160px] rounded-lg border px-3 py-2 text-sm" />
              <input value={advisingBankSwift} onChange={(e) => setAdvisingBankSwift(e.target.value)} placeholder="Swift Code" className="w-40 rounded-lg border px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Total Weight (Kg) — অটো</label>
              <input type="number" value={totalWeightKg.toFixed(2)} readOnly className="rounded-lg border bg-gray-100 px-3 py-2 text-sm w-32 text-gray-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">H.S. Code</label>
              <input value={hsCode} onChange={(e) => setHsCode(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-36" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">BIN No</label>
              <input value={binNo} onChange={(e) => setBinNo(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-40" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Discount Type</label>
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value as any)} className="rounded-lg border px-3 py-2 text-sm">
                <option value="none">নেই</option><option value="percentage">Percentage (%)</option><option value="fixed">Fixed Amount</option>
              </select>
            </div>
            {discountType !== "none" && (
              <div>
                <label className="block text-sm text-gray-600 mb-1">Discount Value</label>
                <input type="number" step="0.01" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" />
              </div>
            )}
            <div>
              <label className="block text-sm text-gray-600 mb-1">Adjustment (±)</label>
              <input type="number" step="0.01" value={adjustmentAmount} onChange={(e) => setAdjustmentAmount(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">নোট (ঐচ্ছিক)</label>
            <input value={amountNotes} onChange={(e) => setAmountNotes(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>

          <div className="rounded-lg bg-gray-50 border p-4 space-y-1 text-sm">
            <p>Subtotal: <strong>{currency} {money(subtotal)}</strong></p>
            {discountType !== "none" && <p>Discount: <strong>{currency} {money(discountAmount)}</strong></p>}
            <p className="text-base">Total: <strong>{currency} {money(totalAmount)}</strong></p>
            <p className="text-xs text-gray-500 italic">{amountInWords(totalAmount, currency)}</p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
            {loading ? "সেভ হচ্ছে..." : "PI তৈরি করুন"}
          </button>
        </form>
      )}
    </div>
  );
}
