import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import LCTable from "./LCTable";

export default async function LCRegisterPage() {
  const supabase = await createClient();
  const { data: lcs } = await supabase
    .from("lc_register")
    .select(`*, banks(bank_name), customers(name), suppliers(name),
      creator:app_users!lc_register_created_by_fkey(full_name),
      lc_pi_items(pi_id, proforma_invoices(pi_no)),
      linked_pi:proforma_invoices!lc_register_linked_pi_id_fkey(pi_no)`)
    .order("lc_date", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">LC Register (Import &amp; Export)</h1>
        <Link href="/dashboard/lc-export/lc-register/new" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">+ নতুন LC</Link>
      </div>
      <LCTable lcs={lcs ?? []} />
    </div>
  );
}
