"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { syncOpeningBalanceJv } from "@/lib/openingBalanceJv";

// অ্যাকাউন্ট টাইপ অনুযায়ী কোড ব্লক: asset 1xxx, liability 2xxx, equity 3xxx,
// income 4xxx, expense 5xxx। নতুন কোড = ওই ব্লকের সর্বোচ্চ কোড + 10 (MAX-ভিত্তিক,
// count নয় — ডিলিটের পরও collision হয় না)। ফিল্ডটি এডিটেবল থাকে।
const TYPE_PREFIX: Record<string, number> = { asset: 1, liability: 2, equity: 3, income: 4, expense: 5 };
const DEBIT_NORMAL = new Set(["asset", "expense"]);

async function nextCodeForType(
  supabase: ReturnType<typeof createClient>,
  type: string
): Promise<string> {
  const prefix = TYPE_PREFIX[type] ?? 1;
  const lo = prefix * 1000;
  const hi = lo + 999;
  const { data } = await supabase.from("chart_of_accounts").select("account_code");
  let max = 0;
  (data ?? []).forEach((r: any) => {
    const raw = String(r.account_code ?? "").trim();
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && String(n) === raw && n >= lo && n <= hi) {
      max = Math.max(max, n);
    }
  });
  return max === 0 ? String(lo) : String(Math.min(max + 10, hi));
}

export default function AddAccountForm() {
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("asset");
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingDate, setOpeningDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // টাইপ বদলালে (এবং ইউজার কোড হাতে না লিখলে) নতুন কোড সাজেস্ট করি
  useEffect(() => {
    if (codeTouched) return;
    let cancelled = false;
    nextCodeForType(supabase, type).then((c) => {
      if (!cancelled) setCode(c);
    });
    return () => {
      cancelled = true;
    };
  }, [type, codeTouched, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // race safety — ইউজার কোড হাতে না বদলে থাকলে submit-এর সময় আবার fresh নাম্বার নিই
    const finalCode = codeTouched ? code.trim() : await nextCodeForType(supabase, type);
    const ob = parseFloat(openingBalance) || 0;

    const { error } = await supabase.from("chart_of_accounts").insert({
      account_code: finalCode,
      account_name: name,
      account_type: type,
      opening_balance: ob,
      opening_balance_date: ob !== 0 ? openingDate || null : null,
    });
    if (error) {
      setLoading(false);
      if (/duplicate|unique/i.test(error.message)) {
        setError(`কোড "${finalCode}" আগে থেকেই আছে — নতুন সাজেশন বসানো হলো, আবার চেষ্টা করুন।`);
        setCodeTouched(false);
        setCode(await nextCodeForType(supabase, type));
      } else {
        setError(error.message);
      }
      return;
    }
    // opening balance দিলে consolidated Opening JV আপডেট হবে
    if (ob !== 0) await syncOpeningBalanceJv(supabase);
    setLoading(false);
    setName("");
    setOpeningBalance("");
    setOpeningDate("");
    setCodeTouched(false);
    setCode(await nextCodeForType(supabase, type));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-4 shadow-sm mb-6 space-y-3">
      <h2 className="font-semibold text-gray-800">নতুন অ্যাকাউন্ট যোগ করুন</h2>
      <div className="flex flex-wrap gap-3">
        <div className="w-40">
          <input
            placeholder="Account Code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setCodeTouched(true);
            }}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            required
          />
          <p className="mt-1 text-[11px] text-gray-400">
            {codeTouched ? "হাতে লেখা কোড" : "অটো — এডিট করা যায়"}
          </p>
        </div>
        <input
          placeholder="Account Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-[200px] flex-1 self-start rounded-lg border px-3 py-2 text-sm"
          required
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="self-start rounded-lg border px-3 py-2 text-sm"
        >
          <option value="asset">Asset</option>
          <option value="liability">Liability</option>
          <option value="equity">Equity</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <div className="w-36">
          <input
            type="number"
            step="0.01"
            placeholder="Opening Balance"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            className="w-full self-start rounded-lg border px-3 py-2 text-sm text-right"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            ঐচ্ছিক · ধনাত্মক = {DEBIT_NORMAL.has(type) ? "Debit" : "Credit"}
          </p>
        </div>
        <input
          type="date"
          value={openingDate}
          onChange={(e) => setOpeningDate(e.target.value)}
          title="Opening balance date"
          className="self-start rounded-lg border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="self-start rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "সেভ হচ্ছে..." : "যোগ করুন"}
        </button>
      </div>
      <p className="text-[11px] text-gray-400">
        Opening balance দিলে <strong>&quot;Opening — Account balances&quot;</strong> নামে একটাই Journal Voucher
        অটো তৈরি/আপডেট হয়; পুরোটার net যায় <strong>3900 Opening Balance Equity</strong>-তে।
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
