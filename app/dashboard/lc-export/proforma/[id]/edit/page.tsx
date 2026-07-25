import { createClient } from "@/lib/supabase/server";
import EditProformaForm from "./EditProformaForm";
import { notFound } from "next/navigation";

export default async function EditProformaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: pi } = await supabase.from("proforma_invoices").select("*").eq("id", id).single();
  if (!pi) return notFound();
  const { data: items } = await supabase.from("pi_items").select("*").eq("pi_id", id).order("sl_no");

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">PI এডিট করুন — {pi.pi_no}</h1>
      <EditProformaForm pi={pi} items={items ?? []} />
    </div>
  );
}