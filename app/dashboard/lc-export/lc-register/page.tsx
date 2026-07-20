import { createClient } from "@/lib/supabase/server";
import LCForm from "./LCForm";
import LCRow from "./LCRow";

export default async function LCRegisterPage() {
  const supabase = await createClient();
  const { data: banks } = await supabase.from("banks").select("id, bank_name").order("bank_name");
  const { data: customers } = await supabase.from("customers").select("id, name").order("name");
  const { data: suppliers } = await supabase.from("suppliers").select("id, name").order("name");
  const { data: pis } = await supabase.from("proforma_invoices").select("id, pi_no").order("pi_date", { ascending: false });
  const { data: lcs } = await supabase
    .from("lc_register")
    .select("*, banks(bank_name), customers(name), suppliers(name)")
    .order("lc_date", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">LC Register (Import &amp; Export)</h1>
      <LCForm banks={banks ?? []} customers={customers ?? []} suppliers={suppliers ?? []} pis={pis ?? []} />
      <div className="mt-6 overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">LC No</th>
              <th className="px-4 py-2">Bank</th>
              <th className="px-4 py-2">Party</th>
              <th className="px-4 py-2">LC Date</th>
              <th className="px-4 py-2">Expiry</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(lcs ?? []).map((lc) => <LCRow key={lc.id} lc={lc} />)}
            {(!lcs || lcs.length === 0) && (
              <tr><td colSpan={9} className="px-4 py-3 text-gray-400 italic">এখনো কোনো LC নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}