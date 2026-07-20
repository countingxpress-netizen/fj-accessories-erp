import { createClient } from "@/lib/supabase/server";
import QuotationForm from "./QuotationForm";

export default async function NewQuotationPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name").order("name");
  const { data: products } = await supabase.from("finished_goods").select("id, product_name").order("product_name");

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">নতুন Quotation</h1>
      <QuotationForm customers={customers ?? []} products={products ?? []} />
    </div>
  );
}