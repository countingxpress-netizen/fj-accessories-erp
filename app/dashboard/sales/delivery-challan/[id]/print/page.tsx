import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { notFound } from "next/navigation";
import ChallanPrintView from "./ChallanPrintView";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("delivery_challans").select("challan_no").eq("id", id).maybeSingle();
  return { title: data?.challan_no ? `Challan ${data.challan_no}` : "Delivery Challan" };
}

export default async function ChallanPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: challan } = await supabase
    .from("delivery_challans")
    .select(`
      *,
      customers(name, address, phone),
      delivery_challan_items(
        id,
        print_label,
        quantity_pcs,
        packets,
        finished_goods(product_name)
      )
    `)
    .eq("id", id)
    .order("id", { referencedTable: "delivery_challan_items", ascending: true })
    .single();

  if (!challan) return notFound();

  const { data: company } = await supabase.from("company_profile").select("*").single();

  return (
    <ChallanPrintView
      challan={challan}
      company={company}
      challanDateLabel={formatDate(challan.challan_date)}
    />
  );
}
