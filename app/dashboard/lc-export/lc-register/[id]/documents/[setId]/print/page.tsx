import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/app/dashboard/PrintButton";
import { buildPdfFilename } from "@/lib/saveAsPdf";
import { getCurrentAppUser } from "@/lib/supabase/getCurrentAppUser";
import { dotDate, setTotals, splitWeight, tenorText, usdWordsUpper } from "@/lib/lcMasterPi";
import { docsWithoutTemplate, lcRefNo, lcRefText, templatesFor } from "@/lib/lcDocuments";
import { OverridesProvider } from "../../../../lcdocs/Editable";
import { renderDoc, type DocCtx } from "../../../../lcdocs/Documents";
import type { DocRow } from "../../../../lcdocs/DocParts";

// "18 DEC 2025" — আসল ডকুমেন্টের Export LC/SC তারিখের ধরন
function upperDate(d: string | null | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  const mon = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][Number(m) - 1];
  return mon ? `${day} ${mon} ${y}` : d;
}

export default async function LcDocumentsPrintPage({
  params, searchParams,
}: {
  params: Promise<{ id: string; setId: string }>;
  searchParams: Promise<{ doc?: string }>;
}) {
  const { id, setId } = await params;
  const { doc } = await searchParams;
  const supabase = await createClient();

  const { data: lc } = await supabase.from("lc_register").select("*, lc_opening_banks(*)").eq("id", id).single();
  const { data: master } = await supabase.from("lc_master_pis").select("*, lc_master_pi_items(*)").eq("lc_id", id).maybeSingle();
  const { data: set } = await supabase
    .from("lc_document_sets")
    .select("*, lc_document_set_items(master_item_id, qty_pcs), creator:app_users!lc_document_sets_created_by_fkey(full_name, designation)")
    .eq("id", setId).eq("lc_id", id).maybeSingle();
  // Mushok-6.3-র দায়িত্বপ্রাপ্ত ব্যক্তি = যিনি ডকুমেন্ট সেট তৈরি করেছেন; পুরনো সেটে creator না থাকলে বর্তমান ইউজার
  const creator = (set as any)?.creator ?? (await getCurrentAppUser());
  const { data: company } = await supabase.from("company_profile").select("*").limit(1).maybeSingle();
  if (!lc || !master || !set) return notFound();

  const st = setTotals(master, master.lc_master_pi_items ?? [], set.lc_document_set_items ?? []);
  const nets = splitWeight(set.total_net_weight_kg, st.rows.map((r) => r.amount));
  const grosses = splitWeight(set.total_gross_weight_kg, st.rows.map((r) => r.amount));
  const rows: DocRow[] = st.rows.map((r, i) => ({
    id: r.item.id, sl: i + 1,
    description: r.item.description ?? "", measurement: r.item.measurement ?? "",
    qty: r.qty, price: Number(r.item.price_unit), basis: r.item.price_basis, amount: r.amount,
    net: nets[i], gross: grosses[i],
  }));

  const ob = lc.lc_opening_banks ?? {};
  const negotiatingBank = [
    master.advising_bank_name,
    master.advising_bank_branch ? `(${master.advising_bank_branch})` : "",
    master.advising_bank_address,
  ].filter(Boolean).join(", ").toUpperCase() + ".";

  const ctx: DocCtx = {
    company,
    piRefText: master.pi_ref_text ?? "",
    refText: lcRefText(lc.serial_no, lc.lc_date, lc.beneficiary_entity),
    buyerName: master.buyer_name ?? "",
    buyerAddress: master.buyer_address ?? "",
    rows,
    totals: {
      ...st,
      net: nets.reduce((s, n) => s + n, 0) || Number(set.total_net_weight_kg) || 0,
      gross: grosses.reduce((s, n) => s + n, 0) || Number(set.total_gross_weight_kg) || 0,
    },
    discountPct: Number(master.discount_pct) || 0,
    priceDecimals: master.price_decimals ?? 4,
    amountWords: usdWordsUpper(st.total),
    tenor: tenorText(lc.drafts_at),
    negotiatingBank,
    openingBankName: (ob.bank_name ?? "").toUpperCase(),
    openingBankAddr: [ob.branch, ob.address].filter(Boolean).join(", ").toUpperCase(),
    dcLine: `DC No: ${lc.lc_no} DATE-${dotDate(lc.lc_date)}`,
    lcLines: [
      lc.sales_contract_no ? `EXPORT LC/SC NO. ${lc.sales_contract_no}${lc.sales_contract_date ? ` DT: ${upperDate(lc.sales_contract_date)}` : ""}` : "",
      master.hs_code ? `H.S. CODE:${master.hs_code}` : "",
      ob.irc_no ? `APPLICANT'S IRC NO.- ${ob.irc_no}` : "",
      ob.applicant_bin ? `APPLICANT'S VAT NO.- ${ob.applicant_bin}` : "",
      ob.issuing_bank_bin ? `ISSUING BANK'S BIN - ${ob.issuing_bank_bin}` : "",
      master.beneficiary_bin ? `BENEFICIARY'S BIN - ${master.beneficiary_bin}` : "",
    ],
    invoiceNo: set.invoice_no ?? "",
    invoiceDate: dotDate(set.invoice_date),
    // Delivery/Truck Challan-এর TR/DC NO = LC Ref নম্বর (FNJ/423/2026); সেটে হাতে দেওয়া থাকলে সেটা
    challanNo: set.challan_no || lcRefNo(lc.serial_no, lc.lc_date, lc.beneficiary_entity),
    deliveryDate: dotDate(set.delivery_date),
    truckNo: set.truck_no ?? "",
    mushok: {
      // চালানপত্র নম্বর = শুধু LC সিরিয়াল (যেমন 423); সেটে হাতে দেওয়া থাকলে সেটা
      no: set.mushok_no || (lc.serial_no != null ? String(lc.serial_no) : ""), date: dotDate(set.mushok_date), time: set.mushok_time ?? "",
      bin: master.bin_no ?? company?.bin_vat ?? "", applicantBin: ob.applicant_bin ?? "",
      personName: creator?.full_name ?? "", personDesignation: creator?.designation ?? "",
    },
  };

  const templates = templatesFor(lc.required_documents);
  const shown = doc ? templates.filter((t) => t.key === doc) : templates;
  const missing = docsWithoutTemplate(lc.required_documents);
  const base = `/dashboard/lc-export/lc-register/${id}`;
  const tab = (active: boolean) => `rounded-lg px-3 py-1.5 text-xs ${active ? "bg-gray-900 text-white" : "border bg-white text-gray-700 hover:bg-gray-50"}`;

  return (
    <div>
      <div className="print:hidden mb-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Link href={base} className="text-sm text-gray-500 hover:underline">← LC {lc.lc_no}</Link>
            <h1 className="text-xl font-semibold">ডকুমেন্ট সেট #{set.set_no} {set.invoice_no ? `(${set.invoice_no})` : ""}</h1>
          </div>
          <Link href={`${base}/documents/${setId}/edit`} className="rounded-lg border px-3 py-1.5 text-sm">✏️ সেট Edit (Qty / No / তারিখ)</Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/documents/${setId}/print`} className={tab(!doc)}>সব</Link>
          {templates.map((t) => (
            <Link key={t.key} href={`${base}/documents/${setId}/print?doc=${t.key}`} className={tab(doc === t.key)}>{t.title}</Link>
          ))}
        </div>
        <p className="text-xs text-gray-500">হলুদ হাইলাইটে ক্লিক করে যেকোনো লেখা বদলানো যায় — বাইরে ক্লিক করলে সেভ হয়; ↺ দিয়ে অটো টেক্সটে ফেরানো যায়।</p>
        {missing.length > 0 && <p className="text-xs text-amber-600">টেমপলেট এখনো নেই: {missing.join(", ")}</p>}
        {lc.serial_no == null && (
          <p className="text-xs text-amber-600">এই LC-র Serial No নেই — ডকুমেন্টে Ref খালি থাকবে। <Link href={base} className="underline">LC পেজে</Link> Serial বসান।</p>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="print:hidden rounded-xl border bg-white p-6 text-sm text-gray-500">
          এই LC-র Required Documents-এ কোনো প্রিন্টযোগ্য ডকুমেন্ট বাছা নেই — <Link href={base} className="text-blue-600 underline">LC পেজে</Link> বাছুন।
        </p>
      ) : (
        <>
          <PrintButton pdfFilename={buildPdfFilename([`LC-${lc.lc_no}`, `Set-${set.set_no}`, doc ?? "Documents"])} />
          <OverridesProvider setId={setId} initial={(set.overrides ?? {}) as Record<string, string>}>
            <div id="pdf-area">
              {shown.map((t, i) => (
                <section key={t.key} className={`mx-auto mb-6 max-w-3xl bg-white p-8 text-gray-900 shadow-sm print:mb-0 print:max-w-none print:p-0 print:shadow-none ${i < shown.length - 1 ? "break-after-page" : ""}`}>
                  {renderDoc(t.key, ctx)}
                </section>
              ))}
            </div>
          </OverridesProvider>
        </>
      )}
    </div>
  );
}
