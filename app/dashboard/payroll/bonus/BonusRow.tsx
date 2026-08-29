"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { formatDate } from "@/lib/formatDate";
import { todayLocal } from "@/lib/payroll";

const festivalLabel: Record<string, string> = {
  eid_ul_fitr: "Eid-ul-Fitr",
  eid_ul_azha: "Eid-ul-Azha",
};

export default function BonusRow({ row }: { row: any }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleMarkPaid() {
    setLoading(true);
    const today = todayLocal();
    const { data: salaryAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", "5100").single();
    const { data: cashAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", "1000").single();

    if (salaryAccount && cashAccount) {
      const voucherNo = await generateNextDocNo(supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", today);
      const label = `${festivalLabel[row.festival] ?? row.festival} ${row.year}`;
      const { data: voucher } = await supabase
        .from("journal_vouchers")
        .insert({ voucher_no: voucherNo, voucher_date: today, narration: `Festival bonus paid to ${row.employees?.name} — ${label}` })
        .select().single();

      if (voucher) {
        await supabase.from("journal_entry_lines").insert([
          { voucher_id: voucher.id, account_id: salaryAccount.id, debit: row.bonus_amount, credit: 0, memo: `Bonus ${label}` },
          { voucher_id: voucher.id, account_id: cashAccount.id, debit: 0, credit: row.bonus_amount, memo: `Bonus ${label}` },
        ]);
        await supabase.from("bonus_sheet").update({ paid: true, voucher_id: voucher.id }).eq("id", row.id);
      }
    }
    setLoading(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm("এই Bonus এন্ট্রি মুছে ফেলতে চান?")) return;
    setLoading(true);
    // sheet row আগে মুছুন — voucher_id FK থাকলে voucher আগে মুছতে গেলে আটকে যায়
    await supabase.from("bonus_sheet").delete().eq("id", row.id);
    if (row.voucher_id) {
      await supabase.from("journal_entry_lines").delete().eq("voucher_id", row.voucher_id);
      await supabase.from("journal_vouchers").delete().eq("id", row.voucher_id);
    }
    setLoading(false);
    router.refresh();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2">{row.employees?.employee_code} — {row.employees?.name}</td>
      <td className="px-4 py-2">{festivalLabel[row.festival] ?? row.festival} {row.year}</td>
      <td className="px-4 py-2 text-gray-500">{formatDate(row.bonus_date)}</td>
      <td className="px-4 py-2 text-right">{row.basic?.toFixed(2)}</td>
      <td className="px-4 py-2 text-right">{row.tenure_months?.toFixed(1)}</td>
      <td className="px-4 py-2 text-right font-medium">{row.bonus_amount?.toFixed(2)}</td>
      <td className="px-4 py-2">
        {row.paid
          ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Paid</span>
          : <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">Unpaid</span>}
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        {!row.paid && (
          <button onClick={handleMarkPaid} disabled={loading} className="rounded bg-green-50 px-2 py-1 text-xs text-green-700 hover:bg-green-100 mr-2">Mark Paid</button>
        )}
        <button onClick={handleDelete} disabled={loading} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Delete</button>
      </td>
    </tr>
  );
}
