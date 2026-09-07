import { createClient } from "@/lib/supabase/server";
import OtherSalesInvoiceForm from "./OtherSalesInvoiceForm";

export default async function NewOtherSalesInvoicePage() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name").order("name");

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">নতুন Other Sales Invoice</h1>
      <p className="text-sm text-gray-500 mb-4">
        বুকিং ছাড়া সরাসরি বিক্রি (scrap/ঝুট, die-cylinder charge, transport, sample ইত্যাদি)।
        সেভ করলে স্ট্যান্ডার্ড invoice-এর মতোই Journal Voucher হবে।
      </p>
      <OtherSalesInvoiceForm customers={customers ?? []} />
    </div>
  );
}
