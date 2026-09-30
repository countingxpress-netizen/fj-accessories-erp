import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DocSetForm from "../DocSetForm";

export default async function NewDocSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: lc } = await supabase.from("lc_register").select("id, lc_no").eq("id", id).single();
  const { data: master } = await supabase.from("lc_master_pis").select("*, lc_master_pi_items(*)").eq("lc_id", id).maybeSingle();
  if (!lc || !master) return notFound();

  const { data: sets } = await supabase.from("lc_document_sets").select("set_no, lc_document_set_items(master_item_id, qty_pcs)").eq("lc_id", id);
  const otherSetsQty: Record<string, number> = {};
  for (const s of (sets ?? []) as any[]) {
    for (const it of s.lc_document_set_items ?? []) otherSetsQty[it.master_item_id] = (otherSetsQty[it.master_item_id] ?? 0) + Number(it.qty_pcs);
  }
  const nextSetNo = Math.max(0, ...((sets ?? []) as any[]).map((s) => s.set_no)) + 1;
  const masterItems = [...(master.lc_master_pi_items ?? [])].sort((a: any, b: any) => a.sl_no - b.sl_no);

  return (
    <div>
      <Link href={`/dashboard/lc-export/lc-register/${id}`} className="text-sm text-gray-500 hover:underline">← LC {lc.lc_no}</Link>
      <h1 className="mb-4 text-2xl font-semibold">নতুন ডকুমেন্ট সেট #{nextSetNo}</h1>
      <DocSetForm lcId={id} master={master} masterItems={masterItems} otherSetsQty={otherSetsQty} nextSetNo={nextSetNo} />
    </div>
  );
}
