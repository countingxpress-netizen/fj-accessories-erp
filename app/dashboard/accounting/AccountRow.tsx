"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import GuardedAction from "@/app/dashboard/GuardedAction";

type Account = {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
};

export default function AccountRow({ account }: { account: Account }) {
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState(account.account_code);
  const [name, setName] = useState(account.account_name);
  const [type, setType] = useState(account.account_type);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSave() {
    setError("");
    setLoading(true);
    const { error } = await supabase
      .from("chart_of_accounts")
      .update({ account_code: code, account_name: name, account_type: type })
      .eq("id", account.id);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
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
    setLoading(false);
    if (error) {
      // সাধারণত এটা হবে যদি এই অ্যাকাউন্টে জার্নাল এন্ট্রি থাকে (foreign key constraint)
      alert("মুছে ফেলা যায়নি। সম্ভবত এই অ্যাকাউন্টে ইতিমধ্যে জার্নাল এন্ট্রি আছে।\n\n" + error.message);
      return;
    }
    router.refresh();
  }

  if (editing) {
    return (
      <tr className="border-t bg-yellow-50">
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