"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";

export default function ExpenseRow({ expense }: { expense: any }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleDelete() {
    if (!window.confirm(`এই Expense এন্ট্রি মুছে ফেলতে চান? এর সাথে যুক্ত Journal Voucher-ও মুছে যাবে।`)) return;

    if (expense.voucher_id) {
      await supabase.from("journal_entry_lines").delete().eq("voucher_id", expense.voucher_id);
      await supabase.from("journal_vouchers").delete().eq("id", expense.voucher_id);
    }
    const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
    if (error) {
      alert("মুছে ফেলা যায়নি: " + error.message);
      return;
    }
    router.refresh();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2 text-gray-500">{formatDate(expense.expense_date)}</td>
      <td className="px-4 py-2">{expense.chart_of_accounts?.account_name ?? "-"}</td>
      <td className="px-4 py-2 text-gray-500">{expense.payee || "-"}</td>
      <td className="px-4 py-2 text-gray-600">{expense.description || "-"}</td>
      <td className="px-4 py-2 text-right">{expense.amount?.toFixed(2)}</td>
      <td className="px-4 py-2 text-right">
        <button onClick={handleDelete} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Delete</button>
      </td>
    </tr>
  );
}