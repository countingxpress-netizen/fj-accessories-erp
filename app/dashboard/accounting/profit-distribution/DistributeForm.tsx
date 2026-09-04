"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { postProfitDistribution } from "@/lib/profitDistribution";

export default function DistributeForm({
  year,
  month,
  label,
}: {
  year: number;
  month: number;
  label: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function handleClick() {
    if (!window.confirm(`${label}-এর profit বণ্টন JV পোস্ট করবেন? এটি পরে Journal Vouchers থেকে মুছতে পারবেন।`)) return;
    setError("");
    setLoading(true);
    const res = await postProfitDistribution(supabase, year, month);
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "ব্যর্থ হয়েছে।");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40"
      >
        {loading ? "পোস্ট হচ্ছে..." : `${label}-এর বণ্টন পোস্ট করুন`}
      </button>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
