"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function VoucherRow({ voucher }: { voucher: any }) {
  const router = useRouter();
  const supabase = createClient();

  const total = (voucher.journal_entry_lines ?? []).reduce(
    (sum: number, l: any) => sum + (l.debit || 0),
    0
  );

  async function handleDelete() {
    const confirmed = window.confirm(
      `Voucher "${voucher.voucher_no}" মুছে ফেলতে চান? এটি পূর্বাবস্থায় ফেরানো যাবে না।`
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from("journal_vouchers")
      .delete()
      .eq("id", voucher.id);

    if (error) {
      alert("মুছে ফেলা যায়নি: " + error.message);
      return;
    }
    router.refresh();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2 font-medium">{voucher.voucher_no}</td>
      <td className="px-4 py-2 text-gray-500">{voucher.voucher_date}</td>
      <td className="px-4 py-2">{voucher.narration || "-"}</td>
      <td className="px-4 py-2 text-right">{total.toFixed(2)}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <Link
          href={`/dashboard/accounting/journal/${voucher.id}/edit`}
          className="rounded bg-blue-50 px-3 py-1 text-xs text-blue-700 mr-2 hover:bg-blue-100"
        >
          Edit
        </Link>
        <button
          onClick={handleDelete}
          className="rounded bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}