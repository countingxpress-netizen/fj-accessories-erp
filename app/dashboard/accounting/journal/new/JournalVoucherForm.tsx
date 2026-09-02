"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateNextDocNo } from "@/lib/docNumber";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/currentUser";

type Account = { id: string; account_code: string; account_name: string; account_type: string };
type Line = { account_id: string; accountLabel: string; debit: string; credit: string; memo: string };

const typeLabels: Record<string, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  income: "Income",
  expense: "Expense",
};

function accountLabel(acc: Account) {
  return `${acc.account_code} - ${acc.account_name} (${typeLabels[acc.account_type] ?? acc.account_type})`;
}

export default function JournalVoucherForm({
  accounts,
  mode = "create",
  voucherId,
  initialDate,
  initialNarration,
  initialLines,
}: {
  accounts: Account[];
  mode?: "create" | "edit";
  voucherId?: string;
  initialDate?: string;
  initialNarration?: string;
  initialLines?: Line[];
}) {
  const [date, setDate] = useState(initialDate ?? new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState(initialNarration ?? "");
  const [lines, setLines] = useState<Line[]>(
    initialLines ?? [
      { account_id: "", accountLabel: "", debit: "", credit: "", memo: "" },
      { account_id: "", accountLabel: "", debit: "", credit: "", memo: "" },
    ]
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01;

  function updateLine(index: number, field: keyof Line, value: string) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        if (field === "accountLabel") {
          const match = accounts.find((acc) => accountLabel(acc) === value);
          return { ...l, accountLabel: value, account_id: match ? match.id : "" };
        }
        if (field === "debit" && parseFloat(value) > 0) {
          return { ...l, debit: value, credit: "" };
        }
        if (field === "credit" && parseFloat(value) > 0) {
          return { ...l, credit: value, debit: "" };
        }
        return { ...l, [field]: value };
      })
    );
  }

  function addLine() {
    setLines((prev) => [...prev, { account_id: "", accountLabel: "", debit: "", credit: "", memo: "" }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!isBalanced) {
      setError("ডেবিট এবং ক্রেডিটের মোট সমান হতে হবে, এবং শূন্যের বেশি হতে হবে।");
      return;
    }
    const invalidAccountLine = lines.find(
      (l) => l.accountLabel && !l.account_id
    );
    if (invalidAccountLine) {
      setError("একটি লাইনে অ্যাকাউন্ট তালিকা থেকে সঠিকভাবে বাছাই করা হয়নি। টাইপ করার পর তালিকা থেকে সাজেশন ক্লিক করুন।");
      return;
    }
    const validLines = lines.filter(
      (l) => l.account_id && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0)
    );
    if (validLines.length < 2) {
      setError("অন্তত ২টি লাইন থাকতে হবে (একটি ডেবিট, একটি ক্রেডিট)।");
      return;
    }

    setLoading(true);

    if (mode === "edit" && voucherId) {
      const { error: updateError } = await supabase
        .from("journal_vouchers")
        .update({ voucher_date: date, narration })
        .eq("id", voucherId);

      if (updateError) {
        setLoading(false);
        setError(updateError.message);
        return;
      }

      const { error: deleteError } = await supabase
        .from("journal_entry_lines")
        .delete()
        .eq("voucher_id", voucherId);

      if (deleteError) {
        setLoading(false);
        setError(deleteError.message);
        return;
      }

      const linesToInsert = validLines.map((l) => ({
        voucher_id: voucherId,
        account_id: l.account_id,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        memo: l.memo,
      }));

      const { error: insertError } = await supabase
        .from("journal_entry_lines")
        .insert(linesToInsert);

      setLoading(false);

      if (insertError) {
        setError(insertError.message);
        return;
      }

      router.push("/dashboard/accounting/journal");
      router.refresh();
      return;
    }

    // CREATE MODE
    const voucherNo = await generateNextDocNo(supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", date);

    const createdBy = await getCurrentUserId(supabase);
    const { data: voucher, error: voucherError } = await supabase
      .from("journal_vouchers")
      .insert({ voucher_no: voucherNo, voucher_date: date, narration, created_by: createdBy })
      .select()
      .single();

    if (voucherError || !voucher) {
      setLoading(false);
      setError(voucherError?.message ?? "ভাউচার তৈরি ব্যর্থ হয়েছে।");
      return;
    }

    const linesToInsert = validLines.map((l) => ({
      voucher_id: voucher.id,
      account_id: l.account_id,
      debit: parseFloat(l.debit) || 0,
      credit: parseFloat(l.credit) || 0,
      memo: l.memo,
    }));

    const { error: linesError } = await supabase
      .from("journal_entry_lines")
      .insert(linesToInsert);

    setLoading(false);

    if (linesError) {
      setError(linesError.message);
      return;
    }

    router.push("/dashboard/accounting/journal");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
      <datalist id="accounts-list">
        {accounts.map((acc) => (
          <option key={acc.id} value={accountLabel(acc)} />
        ))}
      </datalist>

      <div className="flex gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Voucher Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            required
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm text-gray-600 mb-1">Narration</label>
          <input
            type="text"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            placeholder="এই এন্ট্রির সংক্ষিপ্ত বিবরণ"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2">Account (টাইপ করে সার্চ করুন)</th>
              <th className="px-3 py-2 w-32">Debit</th>
              <th className="px-3 py-2 w-32">Credit</th>
              <th className="px-3 py-2">Memo</th>
              <th className="px-3 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">
                  <input
                    type="text"
                    list="accounts-list"
                    value={line.accountLabel}
                    onChange={(e) => updateLine(i, "accountLabel", e.target.value)}
                    placeholder="নাম বা কোড টাইপ করুন..."
                    className={`w-full rounded border px-2 py-1 text-sm ${
                      line.accountLabel && !line.account_id ? "border-red-400 bg-red-50" : ""
                    }`}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    value={line.debit}
                    onChange={(e) => updateLine(i, "debit", e.target.value)}
                    className="w-full rounded border px-2 py-1 text-sm"
                    placeholder="0.00"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    value={line.credit}
                    onChange={(e) => updateLine(i, "credit", e.target.value)}
                    className="w-full rounded border px-2 py-1 text-sm"
                    placeholder="0.00"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={line.memo}
                    onChange={(e) => updateLine(i, "memo", e.target.value)}
                    className="w-full rounded border px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  {lines.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      className="text-red-600 text-xs hover:underline"
                    >
                      সরান
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t font-medium">
            <tr>
              <td className="px-3 py-2 text-right">Total</td>
              <td className="px-3 py-2">{totalDebit.toFixed(2)}</td>
              <td className="px-3 py-2">{totalCredit.toFixed(2)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <button
        type="button"
        onClick={addLine}
        className="rounded-lg border border-dashed px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
      >
        + আরেকটি লাইন যোগ করুন
      </button>

      {!isBalanced && totalDebit + totalCredit > 0 && (
        <p className="text-sm text-orange-600">
          ⚠ ডেবিট ও ক্রেডিটের মোট মিলছে না — সেভ করার আগে সমান করুন।
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading || !isBalanced}
        className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40"
      >
        {loading ? "সেভ হচ্ছে..." : mode === "edit" ? "পরিবর্তন সেভ করুন" : "ভাউচার সেভ করুন"}
      </button>
    </form>
  );
}