"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";
import { deleteExpenseCascade } from "@/lib/expenseDelete";
import GuardedAction from "@/app/dashboard/GuardedAction";
import { money } from "@/lib/format";

export default function ExpenseRow({
  expense, selected, onToggleSelect,
}: { expense: any; selected?: boolean; onToggleSelect?: () => void }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleDelete() {
    if (!window.confirm(`এই Expense এন্ট্রি মুছে ফেলতে চান? এর সাথে যুক্ত Journal Voucher-ও মুছে যাবে।`)) return;

    const result = await deleteExpenseCascade(supabase, expense.id, expense.voucher_id);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2">
        <input
          type="checkbox"
          checked={!!selected}
          onChange={onToggleSelect}
          aria-label={`Select expense ${expense.description ?? expense.id}`}
        />
      </td>
      <td className="px-4 py-2 text-gray-500">
        {formatDate(expense.expense_date)}
        {expense.creator?.full_name && <div className="text-[11px] text-gray-400">by {expense.creator.full_name}</div>}
      </td>
      <td className="px-4 py-2">{expense.chart_of_accounts?.account_name ?? "-"}</td>
      <td className="px-4 py-2 text-gray-500">{expense.payee || "-"}</td>
      <td className="px-4 py-2 text-gray-600">{expense.description || "-"}</td>
      <td className="px-4 py-2 text-right">{money(expense.amount)}</td>
      <td className="px-4 py-2 text-right">
        <GuardedAction table="expenses" recordId={expense.id} recordLabel={expense.description ?? formatDate(expense.expense_date)} action="delete"
          onAllowed={handleDelete}
          className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Delete</GuardedAction>
      </td>
    </tr>
  );
}
