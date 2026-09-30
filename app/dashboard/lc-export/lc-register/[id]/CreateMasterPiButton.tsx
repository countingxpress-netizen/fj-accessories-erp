"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SOURCE_PI_SELECT, buildMasterHeader, mergeLines, saveMasterPi, type SourcePi } from "@/lib/lcMasterPi";

// পুরনো LC (Master PI ফিচারের আগে সেভ করা) বা Master PI সেভ ব্যর্থ হলে — LC-তে লিংক করা PI থেকে তৈরি
export default function CreateMasterPiButton({ lcId, applicant, piIds }: { lcId: string; applicant: string; piIds: string[] }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function create() {
    setLoading(true);
    setError("");
    let pis: SourcePi[] = [];
    if (piIds.length) {
      const { data, error } = await supabase.from("proforma_invoices").select(SOURCE_PI_SELECT).in("id", piIds);
      if (error) { setLoading(false); setError(error.message); return; }
      pis = (data ?? []) as any;
    }
    const err = await saveMasterPi(supabase, lcId, buildMasterHeader(pis, applicant), mergeLines([], pis));
    setLoading(false);
    if (err) { setError(err); return; }
    router.push(`/dashboard/lc-export/lc-register/${lcId}/master-pi`);
  }

  return (
    <div className="text-sm">
      <p className="mb-2 text-gray-500">
        এই LC-র Master PI এখনো নেই। {piIds.length ? `লিংক করা ${piIds.length} টা PI থেকে তৈরি হবে।` : "কোনো PI লিংক নেই — খালি Master PI তৈরি হবে, লাইন হাতে যোগ করুন।"}
      </p>
      <button type="button" onClick={create} disabled={loading} className="rounded-lg bg-blue-700 px-4 py-2 text-white disabled:opacity-40">
        {loading ? "তৈরি হচ্ছে..." : "Master PI তৈরি করুন"}
      </button>
      {error && <p className="mt-2 text-red-600">{error}</p>}
    </div>
  );
}
