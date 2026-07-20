import { createClient } from "@/lib/supabase/server";
import EXPForm from "./EXPForm";
import EXPRow from "./EXPRow";

export default async function EXPTrackingPage() {
  const supabase = await createClient();
  const { data: invoices } = await supabase.from("export_invoices").select("id, invoice_no").order("invoice_date", { ascending: false });
  const { data: exps } = await supabase
    .from("exp_tracking")
    .select("*, export_invoices(invoice_no)")
    .order("submission_date", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">EXP Tracking</h1>
      <EXPForm invoices={invoices ?? []} />
      <div className="mt-6 overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">EXP No</th>
              <th className="px-4 py-2">Invoice</th>
              <th className="px-4 py-2">Submission Date</th>
              <th className="px-4 py-2">Realization Date</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(exps ?? []).map((exp) => <EXPRow key={exp.id} exp={exp} />)}
            {(!exps || exps.length === 0) && (
              <tr><td colSpan={6} className="px-4 py-3 text-gray-400 italic">এখনো কোনো EXP এন্ট্রি নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}