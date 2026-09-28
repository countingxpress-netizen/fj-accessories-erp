import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/supabase/getCurrentAppUser";
import UploadPiForm from "./UploadPiForm";

export default async function UploadPiPage() {
  const appUser = await getCurrentAppUser();
  if (appUser?.role === "customer_pi_only") redirect("/dashboard/lc-export/proforma");

  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name, code").order("name");

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">PI Upload (Excel থেকে)</h1>
      <p className="text-sm text-gray-500 mb-4">
        আপনার নিজের PI Excel ফাইল (company letterhead-সহ আসল ফরম্যাট) আপলোড করুন — সিস্টেম Customer/Buyer/Item লাইন/দাম/ওজন নিজে থেকে পড়ে নিচে একটা ফর্মে বসিয়ে দেবে। চেক করে/দরকারে ঠিক করে তারপর &quot;PI তৈরি করুন&quot;।
      </p>
      <UploadPiForm customers={customers ?? []} />
    </div>
  );
}
