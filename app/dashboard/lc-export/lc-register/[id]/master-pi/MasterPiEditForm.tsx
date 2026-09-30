"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { saveMasterPi, type MasterPiHeader, type MasterPiLine } from "@/lib/lcMasterPi";
import MasterPiEditor from "../../MasterPiEditor";

export default function MasterPiEditForm({ lcId, master, piNoById }: { lcId: string; master: any; piNoById: Record<string, string> }) {
  const [header, setHeader] = useState<MasterPiHeader>({
    pi_ref_text: master.pi_ref_text ?? "",
    buyer_name: master.buyer_name ?? "",
    buyer_address: master.buyer_address ?? "",
    advising_bank_name: master.advising_bank_name ?? "",
    advising_bank_branch: master.advising_bank_branch ?? "",
    advising_bank_address: master.advising_bank_address ?? "",
    advising_bank_swift: master.advising_bank_swift ?? "",
    discount_pct: Number(master.discount_pct) || 0,
    discount_amount: master.discount_amount == null ? null : Number(master.discount_amount),
    hs_code: master.hs_code ?? "",
    bin_no: master.bin_no ?? "",
    beneficiary_bin: master.beneficiary_bin ?? "",
    terms_conditions: master.terms_conditions ?? "",
    price_decimals: master.price_decimals ?? 4,
  });
  const [lines, setLines] = useState<MasterPiLine[]>(
    [...(master.lc_master_pi_items ?? [])]
      .sort((a: any, b: any) => a.sl_no - b.sl_no)
      .map((it: any) => ({
        id: it.id, key: it.id,
        source_pi_id: it.source_pi_id, source_pi_item_id: it.source_pi_item_id,
        description: it.description ?? "", measurement: it.measurement ?? "",
        qty_pcs: Number(it.qty_pcs) || 0, price_unit: Number(it.price_unit) || 0,
        price_basis: it.price_basis === "dzn" ? "dzn" : "pcs",
      })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function save() {
    setSaving(true);
    setError("");
    const err = await saveMasterPi(supabase, lcId, header, lines);
    setSaving(false);
    if (err) { setError(err); return; }
    router.push(`/dashboard/lc-export/lc-register/${lcId}`);
    router.refresh();
  }

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <p className="mb-3 text-xs text-gray-500">
        এখানের এডিট শুধু এই LC-র Master PI-তে — আসল PI অপরিবর্তিত থাকে। কোনো লাইন মুছলে ডকুমেন্ট সেটে ওই লাইনের Qty-ও মুছে যাবে।
      </p>
      <MasterPiEditor header={header} lines={lines} onHeaderChange={setHeader} onLinesChange={setLines} piNoById={piNoById} />
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
          {saving ? "সেভ হচ্ছে..." : "Master PI সেভ করুন"}
        </button>
      </div>
    </div>
  );
}
