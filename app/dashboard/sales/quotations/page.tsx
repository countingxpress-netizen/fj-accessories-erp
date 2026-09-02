import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import QuotationsTable from "./QuotationsTable";

export default async function QuotationListPage() {
  const supabase = await createClient();
  const { data: quotations } = await supabase
    .from("quotations")
    .select("*, customers(name), quotation_items(quantity_pcs, unit_price), creator:app_users!quotations_created_by_fkey(full_name)")
    .order("quotation_date", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Quotations</h1>
        <Link href="/dashboard/sales/quotations/new" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
          + নতুন Quotation
        </Link>
      </div>

      <QuotationsTable quotations={quotations ?? []} />
    </div>
  );
}
