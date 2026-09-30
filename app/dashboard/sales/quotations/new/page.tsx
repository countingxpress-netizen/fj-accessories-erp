import { createClient } from "@/lib/supabase/server";
import QuotationForm from "./QuotationForm";
import { fetchAllRows } from "@/lib/fetchAll";

export default async function NewQuotationPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name").order("name");
  const products = await fetchAllRows<any>(supabase, "finished_goods", "id, product_name", (q) => q.order("product_name"));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">নতুন Quotation</h1>
      <QuotationForm customers={customers ?? []} products={products ?? []} />
    </div>
  );
}