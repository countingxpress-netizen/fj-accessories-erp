import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/supabase/getCurrentAppUser";
import BulkImportForm from "./BulkImportForm";

export default async function PiBulkImportPage() {
  const appUser = await getCurrentAppUser();
  if (appUser?.role === "customer_pi_only") redirect("/dashboard/lc-export/proforma");

  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name, code").order("name");
  const { data: garments } = await supabase.from("garments").select("id, customer_id, name, address").order("name");

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">PI Bulk Import (Excel)</h1>
      <p className="text-sm text-gray-500 mb-4">
        Excel থেকে একসাথে অনেকগুলো Manual PI তৈরি করুন — প্রতিটা PI &quot;is_manual&quot; হিসেবে সেভ হবে (Booking ছাড়া), ঠিক Manual PI ফর্মের মতোই ফিল্ড।
      </p>
      <BulkImportForm customers={customers ?? []} garments={garments ?? []} />
    </div>
  );
}
