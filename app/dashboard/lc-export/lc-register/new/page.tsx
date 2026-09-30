import { createClient } from "@/lib/supabase/server";
import NewLCForm from "./NewLCForm";

export default async function NewLCPage() {
  const supabase = await createClient();
  const { data: banks } = await supabase.from("banks").select("id, bank_name").order("bank_name");
  const { data: lcOpeningBanks } = await supabase
    .from("lc_opening_banks")
    .select("id, bank_name, branch, address, applicant_bin, bond_license_no, boi_no, erc_no, irc_no, issuing_bank_bin")
    .order("bank_name");
  const { data: customers } = await supabase.from("customers").select("id, name, address").order("name");
  const { data: suppliers } = await supabase.from("suppliers").select("id, name").order("name");
  const { data: garments } = await supabase.from("garments").select("id, customer_id, name, address").order("name");
  const { data: pis } = await supabase
    .from("proforma_invoices")
    .select("id, pi_no, pi_date, customer_id, total_amount, customers(name)")
    .order("pi_date", { ascending: false });

  // সব Export LC মিলিয়ে একটাই সিরিয়াল ক্রম — নতুন LC-তে সর্বোচ্চ + 1 (ফর্মে এডিটযোগ্য)
  const { data: lastSerial } = await supabase
    .from("lc_register").select("serial_no")
    .eq("lc_type", "export").not("serial_no", "is", null)
    .order("serial_no", { ascending: false }).limit(1).maybeSingle();
  const nextSerialNo = (lastSerial?.serial_no ?? 0) + 1;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">নতুন LC</h1>
      <NewLCForm
        banks={banks ?? []} lcOpeningBanks={lcOpeningBanks ?? []}
        customers={customers ?? []} suppliers={suppliers ?? []} garments={garments ?? []}
        pis={(pis ?? []) as any}
        nextSerialNo={nextSerialNo}
      />
    </div>
  );
}
