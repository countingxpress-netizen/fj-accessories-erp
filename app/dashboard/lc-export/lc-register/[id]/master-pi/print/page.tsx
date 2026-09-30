import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/app/dashboard/PrintButton";
import { buildPdfFilename } from "@/lib/saveAsPdf";
import { money } from "@/lib/format";
import { lineAmount, masterTotals, usdWordsUpper } from "@/lib/lcMasterPi";
import { OverridesProvider } from "../../../lcdocs/Editable";
import { ItemsTable, Letterhead, Signature, type DocRow } from "../../../lcdocs/DocParts";

// Master PI প্রিন্ট — "Documents - $ ....xlsx"-এর "PI" শীটের মতো (সব PI No হেডারে, সব লাইন একসাথে)
export default async function MasterPiPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: lc } = await supabase.from("lc_register").select("id, lc_no").eq("id", id).single();
  const { data: master } = await supabase.from("lc_master_pis").select("*, lc_master_pi_items(*)").eq("lc_id", id).maybeSingle();
  const { data: company } = await supabase.from("company_profile").select("*").limit(1).maybeSingle();
  if (!lc || !master) return notFound();

  const items = [...((master.lc_master_pi_items ?? []) as any[])].sort((a, b) => a.sl_no - b.sl_no);
  const totals = masterTotals(master, items);
  const rows: DocRow[] = items.map((it, i) => ({
    id: it.id, sl: i + 1, description: it.description ?? "", measurement: it.measurement ?? "",
    qty: Number(it.qty_pcs), price: Number(it.price_unit), basis: it.price_basis,
    amount: lineAmount(Number(it.qty_pcs), Number(it.price_unit), it.price_basis),
  }));

  return (
    <div>
      <div className="print:hidden mb-2 flex items-center justify-between">
        <Link href={`/dashboard/lc-export/lc-register/${id}`} className="text-sm text-gray-500 hover:underline">← LC {lc.lc_no}</Link>
        <Link href={`/dashboard/lc-export/lc-register/${id}/master-pi`} className="rounded-lg border px-3 py-1.5 text-sm">✏️ View &amp; Edit</Link>
      </div>
      <PrintButton pdfFilename={buildPdfFilename([`Master-PI-LC-${lc.lc_no}`])} />
      <OverridesProvider setId={null} initial={{}}>
        <div id="pdf-area" className="mx-auto max-w-3xl bg-white p-8 text-gray-900 print:max-w-none print:p-0">
          <Letterhead company={company} title="PROFORMA INVOICE" docKey="pi" />
          <p className="mb-3 text-center text-[11px] font-bold whitespace-pre-line">{master.pi_ref_text}</p>
          <div className="mb-3 flex justify-between gap-4 text-sm">
            <div>
              <p className="font-semibold underline">BUYER</p>
              <p className="font-bold">{master.buyer_name}</p>
              <p className="whitespace-pre-line">{master.buyer_address}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold underline">ADVISING BANK:</p>
              {master.advising_bank_name && <p className="font-bold">{master.advising_bank_name}</p>}
              {master.advising_bank_branch && <p>{master.advising_bank_branch}</p>}
              {master.advising_bank_address && <p className="whitespace-pre-line">{master.advising_bank_address}</p>}
              {master.advising_bank_swift && <p>SWIFT : {master.advising_bank_swift}</p>}
            </div>
          </div>
          <ItemsTable rows={rows} variant="invoice" totals={totals} discountPct={Number(master.discount_pct) || 0} priceDecimals={master.price_decimals ?? 4} />
          <p className="text-[11px] font-bold">SAY: {usdWordsUpper(totals.total)}</p>
          {master.hs_code && <p className="text-[11px] font-semibold">H.S CODE NO:{master.hs_code}</p>}
          {master.bin_no && <p className="text-[11px] font-semibold">BIN No. {master.bin_no}</p>}
          {master.terms_conditions && <div className="mt-2 whitespace-pre-line text-[11px]">{master.terms_conditions}</div>}
          <Signature company={company} />
          <p className="print:hidden mt-4 text-right text-xs text-gray-400">Total ${money(totals.total)}</p>
        </div>
      </OverridesProvider>
    </div>
  );
}
