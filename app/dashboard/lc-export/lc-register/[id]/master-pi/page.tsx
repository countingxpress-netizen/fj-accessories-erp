import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MasterPiEditForm from "./MasterPiEditForm";

export default async function MasterPiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: lc } = await supabase.from("lc_register").select("id, lc_no").eq("id", id).single();
  if (!lc) return notFound();
  const { data: master } = await supabase.from("lc_master_pis").select("*, lc_master_pi_items(*)").eq("lc_id", id).maybeSingle();
  if (!master) return notFound();

  const piIds = Array.from(new Set(((master.lc_master_pi_items ?? []) as any[]).map((it) => it.source_pi_id).filter(Boolean)));
  const { data: pis } = piIds.length
    ? await supabase.from("proforma_invoices").select("id, pi_no").in("id", piIds)
    : { data: [] as { id: string; pi_no: string }[] };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/dashboard/lc-export/lc-register/${id}`} className="text-sm text-gray-500 hover:underline">← LC {lc.lc_no}</Link>
          <h1 className="text-2xl font-semibold">Master PI — View &amp; Edit</h1>
        </div>
        <Link href={`/dashboard/lc-export/lc-register/${id}/master-pi/print`} className="rounded-lg border px-4 py-2 text-sm">🖨 Print</Link>
      </div>
      <MasterPiEditForm
        lcId={id}
        master={master}
        piNoById={Object.fromEntries((pis ?? []).map((p) => [p.id, p.pi_no]))}
      />
    </div>
  );
}
