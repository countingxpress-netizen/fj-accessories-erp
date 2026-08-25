"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import { BulkActionBar } from "@/components/BulkActionBar";
import { deleteExpenseCascade } from "@/lib/expenseDelete";
import ExpenseRow from "./ExpenseRow";

export default function ExpensesTable({ expenses }: { expenses: any[] }) {
  const router = useRouter();
  const supabase = createClient();

  const {
    selectedIds, selectedCount, isSelected, toggle, toggleAll, isAllSelected, isSomeSelected, clear,
  } = useBulkSelect(expenses, (e: any) => e.id);

  async function handleBulkDelete() {
    const errors: string[] = [];
    for (const id of selectedIds) {
      const expense = expenses.find((e: any) => e.id === id);
      const result = await deleteExpenseCascade(supabase, id, expense?.voucher_id);
      if (!result.ok) errors.push(`${expense?.description ?? id}: ${result.error}`);
    }
    clear();
    router.refresh();
    if (errors.length > 0) {
      alert(`${errors.length}টি Expense মুছা যায়নি:\n\n${errors.join("\n")}`);
    }
  }

  return (
    <div>
      <BulkActionBar count={selectedCount} itemLabel="Expense" onDeleteSelected={handleBulkDelete} onClear={clear} />
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2 w-10">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => { if (el) el.indeterminate = isSomeSelected; }}
                  onChange={toggleAll}
                  aria-label="Select all expenses"
                />
              </th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Expense Head</th>
              <th className="px-4 py-2">Payee</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e: any) => (
              <ExpenseRow key={e.id} expense={e} selected={isSelected(e.id)} onToggleSelect={() => toggle(e.id)} />
            ))}
            {expenses.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Expense এন্ট্রি নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
