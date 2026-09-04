import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import BankChargesForm from "./BankChargesForm";
import { money } from "@/lib/format";

export default async function BankChargesPage() {
  const supabase = await createClient();
  const { data: lcs } = await supabase.from("lc_register").select("id, lc_no").order("lc_date", { ascending: false });
  const { data: charges } = await supabase
    .from("bank_charges")
    .select("*, lc_register(lc_no), creator:app_users!bank_charges_created_by_fkey(full_name)")
    .order("charge_date", { ascending: false });

  const total = (charges ?? []).reduce((s, c) => s + (c.amount || 0), 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Bank Charges</h1>
      <BankChargesForm lcs={lcs ?? []} />
      <div className="mt-6 overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">LC No</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(charges ?? []).map((c: any) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-2 text-gray-500">
                  {formatDate(c.charge_date)}
                  {c.creator?.full_name && <div className="text-[11px] text-gray-400">by {c.creator.full_name}</div>}
                </td>
                <td className="px-4 py-2">{c.lc_register?.lc_no ?? "-"}</td>
                <td className="px-4 py-2">{c.description || "-"}</td>
                <td className="px-4 py-2 text-right">{money(c.amount)}</td>
              </tr>
            ))}
            {(!charges || charges.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Bank Charge নেই</td></tr>
            )}
          </tbody>
          <tfoot className="border-t-2 font-semibold bg-gray-50">
            <tr><td colSpan={3} className="px-4 py-3 text-right">Total</td><td className="px-4 py-3 text-right">{money(total)}</td></tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}