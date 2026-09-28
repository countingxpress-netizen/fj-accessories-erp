"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/currentUser";
import { money } from "@/lib/format";
import { downloadPiImportTemplate, parsePiImportFile, insertPiGroup, type ParsedPiGroup } from "@/lib/piBulkImport";

type ImportResult = { group: string; ok: boolean; message: string };

export default function BulkImportForm({
  customers, garments,
}: {
  customers: { id: string; name: string; code: string | null }[];
  garments: { id: string; customer_id: string; name: string; address: string | null }[];
}) {
  const [groups, setGroups] = useState<ParsedPiGroup[]>([]);
  const [fileError, setFileError] = useState("");
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  const validGroups = groups.filter((g) => g.errors.length === 0);
  const invalidGroups = groups.filter((g) => g.errors.length > 0);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResults(null);
    setFileError("");
    setGroups([]);
    const { groups: parsed, fileError: err } = await parsePiImportFile(file, customers, garments);
    if (err) { setFileError(err); return; }
    if (parsed.length === 0) { setFileError("ফাইলে কোনো ডেটা রো পাওয়া যায়নি।"); return; }
    setGroups(parsed);
  }

  // pi_no সিরিয়াল per-customer MAX-based বলে একটার পর একটা (sequential) ইনসার্ট করা লাগে —
  // parallel করলে দুটো PI একই নম্বর পেয়ে যেতে পারে।
  async function handleImport() {
    if (validGroups.length === 0) return;
    setImporting(true);
    const out: ImportResult[] = [];
    const createdBy = await getCurrentUserId(supabase);

    for (const g of validGroups) {
      const customer = customers.find((c) => c.id === g.customerId);
      const result = await insertPiGroup(supabase, g, customer ?? null, createdBy);
      out.push(result.ok
        ? { group: g.group, ok: true, message: `PI নম্বর: ${result.piNo}` }
        : { group: g.group, ok: false, message: result.error });
      setResults([...out]);
    }

    setImporting(false);
    setResults(out);
    router.refresh();
  }

  function reset() {
    setGroups([]); setFileError(""); setFileName(""); setResults(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4 shadow-sm flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => downloadPiImportTemplate()}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm text-white"
        >
          📊 টেমপ্লেট ডাউনলোড করুন
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleFile}
          className="text-sm"
        />
        {fileName && !fileError && groups.length > 0 && (
          <button type="button" onClick={reset} className="text-xs text-gray-500 hover:underline">রিসেট</button>
        )}
      </div>

      {fileError && <p className="text-sm text-red-600">{fileError}</p>}

      {groups.length > 0 && (
        <>
          <div className="rounded-xl border bg-white p-4 shadow-sm text-sm">
            <p>মোট <strong>{groups.length}</strong> টা PI Group পাওয়া গেছে — <span className="text-green-700">{validGroups.length} টা রেডি</span>
              {invalidGroups.length > 0 && <span className="text-red-600"> · {invalidGroups.length} টা এরর-সহ (স্কিপ হবে)</span>}
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-3 py-2">PI Group</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Items</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Weight (Kg)</th>
                  <th className="px-3 py-2">অবস্থা</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.group} className={`border-t ${g.errors.length ? "bg-red-50/50" : ""}`}>
                    <td className="px-3 py-2 font-medium">{g.group}</td>
                    <td className="px-3 py-2">{g.customerName || <span className="text-gray-400 italic">ফাঁকা</span>}</td>
                    <td className="px-3 py-2 text-gray-500">{g.piDate}</td>
                    <td className="px-3 py-2 text-right">{g.items.length}</td>
                    <td className="px-3 py-2 text-right">{g.items.reduce((s, it) => s + it.qtyPcs, 0).toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2 text-right">{g.currency} {money(g.subtotal)}</td>
                    <td className="px-3 py-2 text-right font-medium">{g.currency} {money(g.totalAmount)}</td>
                    <td className="px-3 py-2 text-right">{(g.totalWeightKgOverride ?? g.autoWeightKg).toFixed(1)}</td>
                    <td className="px-3 py-2">
                      {g.errors.length === 0
                        ? <span className="text-green-700">✓ রেডি</span>
                        : <span className="text-red-600 text-xs">{g.errors.join("; ")}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={handleImport}
            disabled={importing || validGroups.length === 0}
            className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40"
          >
            {importing ? "ইমপোর্ট হচ্ছে..." : `${validGroups.length} টা PI ইমপোর্ট করুন`}
          </button>
        </>
      )}

      {results && (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2">PI Group</th>
                <th className="px-3 py-2">ফলাফল</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.group} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.group}</td>
                  <td className={`px-3 py-2 ${r.ok ? "text-green-700" : "text-red-600"}`}>{r.ok ? "✓ " : "✗ "}{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {results.every((r) => r.ok) && (
            <p className="px-3 py-2 border-t text-sm text-green-700">সব PI সফলভাবে তৈরি হয়েছে। <a href="/dashboard/lc-export/proforma" className="underline">লিস্টে দেখুন →</a></p>
          )}
        </div>
      )}
    </div>
  );
}
