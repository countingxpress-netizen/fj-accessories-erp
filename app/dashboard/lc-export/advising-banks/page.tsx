import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AddAdvisingBankForm from "./AddAdvisingBankForm";
import AdvisingBanksTable from "./AdvisingBanksTable";

export default async function AdvisingBanksPage() {
  const supabase = await createClient();
  const { data: banks } = await supabase.from("advising_banks").select("*").order("name");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Advising Banks</h1>
        <Link href="/dashboard/lc-export" className="text-sm text-gray-500 hover:underline">← LC &amp; Export-এ ফিরুন</Link>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Proforma Invoice-এ Advising Bank dropdown থেকে বাছাই করলে Branch / Address / SWIFT অটো বসবে।
      </p>

      <AddAdvisingBankForm />
      <AdvisingBanksTable banks={banks ?? []} />
    </div>
  );
}
