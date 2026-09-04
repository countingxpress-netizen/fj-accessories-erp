"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/format";
import { syncOpeningBalanceJv, AUTO_OPENING_CODES } from "@/lib/openingBalanceJv";
import GuardedAction from "@/app/dashboard/GuardedAction";

type Account = {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  opening_balance: number | null;
  opening_balance_date: string | null;
};

const DEBIT_NORMAL = new Set(["asset", "expense"]);

export default function AccountRow({ account }: { account: Account }) {
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState(account.account_code);
  const [name, setName] = useState(account.account_name);
  const [type, setType] = useState(account.account_type);
  const [openingBalance, setOpeningBalance] = useState(
    account.opening_balance != null ? String(account.opening_balance) : "0"
  );
  const [openingDate, setOpeningDate] = useState(account.opening_balance_date ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const isAutoOpening = AUTO_OPENING_CODES.has(String(account.account_code).trim());

  async function handleSave() {
    setError("");
    setLoading(true);
    const ob = parseFloat(openingBalance) || 0;
    const { error } = await supabase
      .from("chart_of_accounts")
      .update({
        account_code: code,
        account_name: name,
        account_type: type,
        opening_balance: ob,
        opening_balance_date: ob !== 0 ? openingDate || null : null,
      })
      .eq("id", account.id);
    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }
    // opening balance পাল্টে থাকতে পারে — consolidated Opening JV আবার sync করি
    await syncOpeningBalanceJv(supabase);
    setLoading(false);
    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `"${account.account_name}" অ্যাকাউন্টটি মুছে ফেলতে চান? এটি পূর্বাবস্থায় ফেরানো যাবে না।`
    );
    if (!confirmed) return;

    setLoading(true);
    const { error } = await supabase
      .from("chart_of_accounts")
      .delete()
      .eq("id", account.id);
    if (error) {
      setLoading(false);
      // সাধারণত এটা হবে যদি এই অ্যাকাউন্টে জার্নাল এন্ট্রি থাকে (foreign key constraint)
      alert("মুছে ফেলা যায়নি। সম্ভবত এই অ্যাকাউন্টে ইতিমধ্যে জার্নাল এন্ট্রি আছে।\n\n" + error.message);
      return;
    }
    await syncOpeningBalanceJv(supabase);
    setLoading(false);
    router.refresh();
  }

  const ob = account.opening_balance ?? 0;
  const obSide = ob === 0 ? "" : (DEBIT_NORMAL.has(account.account_type) ? ob > 0 : ob < 0) ? "Dr" : "Cr";

  if (editing) {
    return (
      <tr className="border-t bg-yellow-50 align-top">
        <td className="px-4 py-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-24 rounded border px-2 py-1 text-sm"
          />
        </td>
        <td className="px-4 py-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border px-2 py-1 text-sm"
          />
        </td>
        <td className="px-4 py-2 whitespace-nowrap">
          <input
            type="number"
            step="0.01"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            disabled={isAutoOpening}
            className="w-32 rounded border px-2 py-1 text-sm text-right disabled:bg-gray-100 disabled:text-gray-400"
          />
          <input
            type="date"
            value={openingDate}
            onChange={(e) => setOpeningDate(e.target.value)}
            disabled={isAutoOpening}
            className="mt-1 block w-36 rounded border px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-400"
          />
          {isAutoOpening ? (
            <p className="mt-1 max-w-[220px] text-[11px] text-gray-400">
              এই অ্যাকাউন্টের opening আলাদা জায়গা থেকে পোস্ট হয় (Customer / Opening Inventory) — এখানে দিলে দুবার হতো।
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-gray-400">
              ধনাত্মক = {DEBIT_NORMAL.has(type) ? "Debit" : "Credit"} · net balancing → 3900
            </p>
          )}
        </td>
        <td className="px-4 py-2 text-right whitespace-nowrap align-top">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded border px-2 py-1 text-sm mr-2"
          >
            <option value="asset">Asset</option>
            <option value="liability">Liability</option>
            <option value="equity">Equity</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <button
            onClick={handleSave}
            disabled={loading}
            className="rounded bg-green-600 px-3 py-1 text-xs text-white mr-1 disabled:opacity-50"
          >
            সেভ
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded bg-gray-200 px-3 py-1 text-xs text-gray-700"
          >
            বাতিল
          </button>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2 text-gray-500">{account.account_code}</td>
      <td className="px-4 py-2">{account.account_name}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap text-gray-500">
        {ob === 0 ? (
          <span className="text-gray-300">—</span>
        ) : (
          <>
            {money(Math.abs(ob))} <span className="text-[11px] text-gray-400">{obSide}</span>
            {account.opening_balance_date && (
              <span className="block text-[11px] text-gray-400">{account.opening_balance_date}</span>
            )}
          </>
        )}
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <GuardedAction table="chart_of_accounts" recordId={account.id} recordLabel={account.account_name} action="edit"
          onAllowed={() => setEditing(true)}
          className="rounded bg-blue-50 px-3 py-1 text-xs text-blue-700 mr-2 hover:bg-blue-100"
        >
          Edit
        </GuardedAction>
        <GuardedAction table="chart_of_accounts" recordId={account.id} recordLabel={account.account_name} action="delete"
          onAllowed={handleDelete}
          disabled={loading}
          className="rounded bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          Delete
        </GuardedAction>
      </td>
    </tr>
  );
}
