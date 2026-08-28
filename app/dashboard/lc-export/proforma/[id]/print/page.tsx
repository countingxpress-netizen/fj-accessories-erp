import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { notFound } from "next/navigation";
import PrintButton from "@/app/dashboard/PrintButton";
import { amountInWords, currencySymbol } from "@/lib/numberToWords";

export default async function PIPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: pi } = await supabase
    .from("proforma_invoices")
    .select("*, customers(name, address, phone)")
    .eq("id", id).single();

  const { data: items } = await supabase.from("pi_items").select("*").eq("pi_id", id).order("sl_no");
  const { data: company } = await supabase.from("company_profile").select("*").single();

  if (!pi) return notFound();

  const sym = currencySymbol(pi.currency);

  // Terms Clause 10 = PI Validity Date (PI Date + সর্বোচ্চ ২ মাস) — terms টেক্সটে না থাকলে অটো যোগ
  const baseTerms = (pi.terms_conditions ?? "").trimEnd();
  const hasClause10 = /^\s*10[).]/m.test(baseTerms);
  const termsText = pi.valid_till && !hasClause10
    ? `${baseTerms}\n10) THIS PROFORMA INVOICE IS VALID UNTIL ${formatDate(pi.valid_till)}.`
    : baseTerms;

  const subtotal = (items ?? []).reduce((s, it: any) => {
    const amt = it.price_basis === "dzn" ? (it.qty_pcs / 12) * it.price_unit : it.qty_pcs * it.price_unit;
    return s + amt;
  }, 0);
  const discountAmount = pi.discount_type === "percentage" ? (subtotal * pi.discount_value) / 100
    : pi.discount_type === "fixed" ? pi.discount_value : 0;

  const totalQtyPcs = (items ?? []).reduce((s, it: any) => s + it.qty_pcs, 0);
  const totalQtyDzn = totalQtyPcs / 12;

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white text-gray-900 print:p-0">
      <PrintButton />

      <div className="text-center mb-4 border-b-2 border-gray-800 pb-3">
        <h1 className="text-3xl font-bold tracking-wide">{company?.name}</h1>
        <p className="text-sm text-gray-600">{company?.address}</p>
        <p className="text-lg font-semibold underline mt-2">PROFORMA INVOICE</p>
      </div>

      <div className="flex justify-between mb-4 text-sm">
        <div>
          <p><strong>INVOICE NO.</strong> {pi.pi_no}{pi.revision > 0 && ` (Rev-${pi.revision})`}</p>
          <p><strong>Date-</strong>{formatDate(pi.pi_date)}</p>
          <div className="mt-3">
            <p className="underline font-semibold pl-8">TO</p>
            {pi.garments_name || pi.garments_address ? (
              <>
                {pi.garments_name && <p className="text-base font-bold">{pi.garments_name}</p>}
                {pi.garments_address && <p className="whitespace-pre-line">{pi.garments_address}</p>}
              </>
            ) : (
              <>
                <p className="text-base font-bold">{pi.customers?.name}</p>
                {pi.customers?.address && <p className="whitespace-pre-line">{pi.customers.address}</p>}
              </>
            )}
            {pi.buyer_name && <p className="font-bold">Buyer: - {pi.buyer_name}</p>}
            {pi.item_description && <p className="font-bold">Item:- {pi.item_description}</p>}
          </div>
        </div>
        <div className="text-right text-sm">
          <p className="underline font-semibold mb-1">ADVISING BANK:</p>
          {pi.advising_bank_name && <p className="font-bold">{pi.advising_bank_name}</p>}
          {pi.advising_bank_branch && <p>{pi.advising_bank_branch}</p>}
          {pi.advising_bank_address && <p className="whitespace-pre-line">{pi.advising_bank_address}</p>}
          {pi.advising_bank_swift && <p>SWIFT &ndash; {pi.advising_bank_swift}</p>}
        </div>
      </div>

      <table className="w-full text-sm border-collapse mb-2">
        <thead>
          <tr className="border-2 border-gray-800 bg-gray-50">
            <th className="border border-gray-800 py-1 px-2">Sl No</th>
            <th className="border border-gray-800 py-1 px-2">Description</th>
            <th className="border border-gray-800 py-1 px-2">Measurement</th>
            <th className="border border-gray-800 py-1 px-2">Qty (Pcs)</th>
            <th className="border border-gray-800 py-1 px-2">Qty (Dzn)</th>
            <th className="border border-gray-800 py-1 px-2">Price/Unit</th>
            <th className="border border-gray-800 py-1 px-2">Total Amt</th>
          </tr>
        </thead>
        <tbody>
          {(items ?? []).map((it: any) => {
            const amount = it.price_basis === "dzn" ? (it.qty_pcs / 12) * it.price_unit : it.qty_pcs * it.price_unit;
            return (
              <tr key={it.id}>
                <td className="border border-gray-800 text-center py-1 px-2">{it.sl_no}</td>
                <td className="border border-gray-800 py-1 px-2 whitespace-pre-line">{it.description}</td>
                <td className="border border-gray-800 py-1 px-2">{it.measurement}</td>
                <td className="border border-gray-800 text-right py-1 px-2">{it.qty_pcs.toLocaleString()}</td>
                <td className="border border-gray-800 text-right py-1 px-2">{(it.qty_pcs / 12).toFixed(2)}</td>
                <td className="border border-gray-800 text-right py-1 px-2">{sym}{it.price_unit}/{it.price_basis}</td>
                <td className="border border-gray-800 text-right py-1 px-2">{sym}{amount.toFixed(2)}</td>
              </tr>
            );
          })}
          <tr className="font-semibold">
            <td className="border border-gray-800 text-center py-1" colSpan={3}>Total =</td>
            <td className="border border-gray-800 text-right py-1 px-2">{totalQtyPcs.toLocaleString()}</td>
            <td className="border border-gray-800 text-right py-1 px-2">{totalQtyDzn.toFixed(2)}</td>
            <td className="border border-gray-800"></td>
            <td className="border border-gray-800 text-right py-1 px-2">{sym}{subtotal.toFixed(2)}</td>
          </tr>
          {pi.discount_type !== "none" && (
            <tr>
              <td colSpan={6} className="border border-gray-800 text-right py-1 px-2">
                (-) Discount {pi.discount_type === "percentage" ? `${pi.discount_value}%` : ""} =
              </td>
              <td className="border border-gray-800 text-right py-1 px-2">{sym}{discountAmount.toFixed(2)}</td>
            </tr>
          )}
          <tr className="font-bold">
            <td colSpan={6} className="border border-gray-800 text-right py-1 px-2">Total =</td>
            <td className="border border-gray-800 text-right py-1 px-2">{sym}{pi.total_amount?.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <p className="text-sm font-semibold mb-1">SAY: {amountInWords(pi.total_amount ?? 0, pi.currency)}</p>
      {pi.total_weight_kg && <p className="text-sm mb-1">Total Invoice Weight = {pi.total_weight_kg} Kgs</p>}
      <p className="text-sm mb-1">H.S CODE NO: {pi.hs_code || "3923.21.00"}</p>
      <p className="text-sm mb-4">BIN No. {pi.bin_no || "000113803-1201"}</p>

      {termsText && (
        <div className="text-xs whitespace-pre-wrap mb-6">
          {termsText.split("\n").map((line: string, i: number) => {
            const isAdvisingBank = /advising\s*bank/i.test(line);
            return (
              <p key={i} className={isAdvisingBank ? "font-bold" : ""}>{line}</p>
            );
          })}
        </div>
      )}

      <div className="mt-16 flex justify-end text-sm">
        <div className="text-center">
          <p className="font-semibold">{company?.name}</p>
          <div className="mt-8 border-t border-gray-400 pt-1 w-40">Authorized Signature</div>
        </div>
      </div>
    </div>
  );
}
