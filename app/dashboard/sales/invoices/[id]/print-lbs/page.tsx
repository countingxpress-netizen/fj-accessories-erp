import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { notFound, redirect } from "next/navigation";
import PrintButton from "@/app/dashboard/PrintButton";
import { amountInWords } from "@/lib/numberToWords";
import { lbsFormatMeasurement } from "@/lib/lbsInvoice";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function qtyFmt(n: number) {
  return Math.round(n).toLocaleString("en-IN");
}

// চার্জ লাইনের qty basis-এর একক
function chargeUnit(lineType: string) {
  if (lineType === "lbs_printing" || lineType === "lbs_nonprint") return "Pcs";
  if (lineType === "lbs_adhesive") return "Inch";
  return "Lbs"; // powder, making
}

export default async function LbsInvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("sales_invoices")
    .select(`*, customers(name, code, address, phone, opening_balance, opening_balance_date),
      creator:app_users!sales_invoices_created_by_fkey(signature_url),
      sales_invoice_items(quantity_pcs, unit_price, amount, line_type, line_label, required_lbs,
        bookings(booking_no, style, measurement_type, measurement_unit,
          length_val, width_val, flap_val, gusset_val, pillow_val))`)
    .eq("id", id)
    .single();

  const { data: company } = await supabase.from("company_profile").select("*").single();

  if (!invoice) return notFound();
  // স্ট্যান্ডার্ড invoice হলে সাধারণ print page-এ পাঠাও
  if (invoice.invoice_type !== "lbs") redirect(`/dashboard/sales/invoices/${id}/print`);

  const items = (invoice.sales_invoice_items ?? []) as any[];
  const productRows = items.filter((i) => i.line_type === "lbs_product");
  const chargeRows = items.filter((i) => String(i.line_type).startsWith("lbs_") && i.line_type !== "lbs_product");
  const total = items.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);

  // ── Previous Bill / This Bill / Running Due (স্ট্যান্ডার্ড print page-এর মতোই) ──
  const { data: allInvoices } = await supabase
    .from("sales_invoices")
    .select("id, invoice_no, invoice_date, sales_invoice_items(amount)")
    .eq("customer_id", invoice.customer_id);
  const { data: payments } = await supabase
    .from("customer_payments")
    .select("amount, payment_date")
    .eq("customer_id", invoice.customer_id);

  const invoicesWithTotal = (allInvoices ?? [])
    .map((inv: any) => ({
      id: inv.id, invoice_no: inv.invoice_no, invoice_date: inv.invoice_date,
      total: (inv.sales_invoice_items ?? []).reduce((s: number, i: any) => s + (i.amount || 0), 0),
    }))
    .sort((a: any, b: any) =>
      a.invoice_date === b.invoice_date ? a.invoice_no.localeCompare(b.invoice_no) : a.invoice_date.localeCompare(b.invoice_date),
    );

  const currentIndex = invoicesWithTotal.findIndex((inv: any) => inv.id === invoice.id);
  const previousInvoice = currentIndex > 0 ? invoicesWithTotal[currentIndex - 1] : null;
  const openingBalance = invoice.customers?.opening_balance || 0;
  const openingDate = invoice.customers?.opening_balance_date || "2000-01-01";
  const previousDate = previousInvoice ? previousInvoice.invoice_date : openingDate;

  const invoicesUpToPrevious = currentIndex > 0 ? invoicesWithTotal.slice(0, currentIndex) : [];
  const sumInvoicesUpToPrevious = invoicesUpToPrevious.reduce((s: number, inv: any) => s + inv.total, 0);
  const paymentsUpToPrevious = (payments ?? []).filter((p: any) => p.payment_date <= previousDate).reduce((s: number, p: any) => s + p.amount, 0);

  const previousDue = openingBalance + sumInvoicesUpToPrevious - paymentsUpToPrevious;
  const totalDue = previousDue + total;
  const paidBetween = (payments ?? [])
    .filter((p: any) => p.payment_date > previousDate && p.payment_date <= invoice.invoice_date)
    .reduce((s: number, p: any) => s + p.amount, 0);
  const runningDue = totalDue - paidBetween;
  const paymentDatesBetween = (payments ?? [])
    .filter((p: any) => p.payment_date > previousDate && p.payment_date <= invoice.invoice_date)
    .map((p: any) => p.payment_date).sort();
  const lastPaymentDate = paymentDatesBetween.length ? paymentDatesBetween[paymentDatesBetween.length - 1] : null;

  const signatureUrl = invoice.creator?.signature_url || company?.signature_url;

  const PRODUCT_SLOTS = Math.max(7, productRows.length);
  const emptyProductRows = PRODUCT_SLOTS - productRows.length;

  const cellCls = "border border-gray-400 px-2 py-1 text-sm";

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white text-gray-900 print:p-0">
      <PrintButton />

      <div className="text-center mb-1">
        <div className="flex items-center justify-center gap-3">
          {company?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logo_url} alt="Logo" className="h-14 w-14 object-contain shrink-0" />
          )}
          <h1 className="text-3xl font-bold tracking-wide text-purple-800">{company?.name ?? "F & J ACCESSORIES"}</h1>
        </div>
        <p className="text-xs text-gray-600">{company?.address}</p>
        <p className="text-xs text-gray-600">
          Contact No- {company?.phone} &nbsp; E-Mail- {company?.email}
        </p>
      </div>

      <div className="flex items-stretch border border-gray-500 text-sm mt-3">
        <div className="px-2 py-1 border-r border-gray-500 flex-1">
          <span className="font-semibold">Sl No- </span>{invoice.invoice_no}
        </div>
        <div className="px-2 py-1 border-r border-gray-500 font-bold text-purple-800 text-center w-32">INVOICE</div>
        <div className="px-2 py-1 flex-1 text-right">
          <span className="font-semibold">Date:- </span>{formatDate(invoice.invoice_date)}
        </div>
      </div>

      <div className="flex border-x border-b border-gray-500 text-sm">
        <div className="px-2 py-1 border-r border-gray-500 flex-1">
          <span className="font-semibold">Bill To - </span>{invoice.customers?.name}
          {invoice.customers?.address && <div className="text-gray-600 text-xs">Address: {invoice.customers.address}</div>}
        </div>
        <div className="px-2 py-1 w-40">
          <span className="font-semibold">WO # </span>{invoice.customer_booking_ref || ""}
        </div>
      </div>

      <div className="flex border-x border-b border-gray-500 text-sm mb-3">
        <div className="px-2 py-1 border-r border-gray-500 flex-1">
          <span className="font-semibold">Buyer- </span>{invoice.buyer_name || ""}
        </div>
        <div className="px-2 py-1 flex-1 text-right">
          <span className="font-semibold">Attn:- </span>{invoice.merchant_name || ""}
        </div>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-700 text-white">
            <th className={cellCls + " w-10"}>Sl #</th>
            <th className={cellCls + " text-left"}>Item Description</th>
            <th className={cellCls + " text-left"}>Measurement</th>
            <th className={cellCls + " text-right w-24"}>Quantity (Pcs)</th>
            <th className={cellCls + " text-right w-20"}>Unit Price</th>
            <th className={cellCls + " text-right w-24"}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {productRows.map((r: any, i: number) => (
            <tr key={`p${i}`}>
              <td className={cellCls + " text-center"}>{String(i + 1).padStart(2, "0")}</td>
              <td className={cellCls}>{r.line_label}</td>
              <td className={cellCls}>{r.bookings ? lbsFormatMeasurement(r.bookings) : ""}</td>
              <td className={cellCls + " text-right"}>{qtyFmt(r.quantity_pcs)} Pcs</td>
              <td className={cellCls + " text-right"}>{qtyFmt(r.required_lbs || 0)} Lbs</td>
              <td className={cellCls} />
            </tr>
          ))}
          {Array.from({ length: emptyProductRows }).map((_, i) => (
            <tr key={`e${i}`}>
              <td className={cellCls + " text-center text-gray-400"}>{String(productRows.length + i + 1).padStart(2, "0")}</td>
              <td className={cellCls} /><td className={cellCls} /><td className={cellCls} /><td className={cellCls} /><td className={cellCls} />
            </tr>
          ))}
          {chargeRows.map((r: any, i: number) => (
            <tr key={`c${i}`}>
              <td className={cellCls + " text-center"}>{String(PRODUCT_SLOTS + i + 1).padStart(2, "0")}</td>
              <td className={cellCls} />
              <td className={cellCls + " font-medium"}>{r.line_label}</td>
              <td className={cellCls + " text-right"}>
                {Number(r.quantity_pcs) ? `${qtyFmt(r.quantity_pcs)} ${chargeUnit(r.line_type)}` : ""}
              </td>
              <td className={cellCls + " text-right"}>{fmt(Number(r.unit_price) || 0)}</td>
              <td className={cellCls + " text-right"}>{Number(r.amount) ? fmt(Number(r.amount)) : "-"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td className="px-2 py-2 text-right" colSpan={5}>Total  =</td>
            <td className="border-t-2 border-b-4 border-double border-gray-800 px-2 py-2 text-right">{fmt(total)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="my-3 text-sm">
        <span className="font-semibold">Amount In Word (BDT) = </span>
        {amountInWords(total, "BDT")}
      </div>

      <table className="text-xs border-collapse w-full max-w-sm ml-auto mb-8 border border-gray-500" style={{ tableLayout: "fixed" }}>
        <colgroup><col style={{ width: "60%" }} /><col style={{ width: "40%" }} /></colgroup>
        <tbody>
          <tr>
            <td className="px-2 py-1 border-b border-gray-400 whitespace-nowrap overflow-hidden text-ellipsis">
              Previous Bill{previousInvoice ? ` - ${previousInvoice.invoice_no}` : " (Opening Balance)"} - Due =
            </td>
            <td className="px-2 py-1 border-b border-l border-gray-400 text-right whitespace-nowrap">BDT {fmt(previousDue)}</td>
          </tr>
          <tr>
            <td className="px-2 py-1 border-b border-gray-400 whitespace-nowrap overflow-hidden text-ellipsis">This Bill - {invoice.invoice_no} =</td>
            <td className="px-2 py-1 border-b border-l border-gray-400 text-right whitespace-nowrap">BDT {fmt(total)}</td>
          </tr>
          <tr className="font-semibold">
            <td className="px-2 py-1 border-b border-gray-400 whitespace-nowrap">Total Due =</td>
            <td className="px-2 py-1 border-b border-l border-gray-400 text-right whitespace-nowrap">BDT {fmt(totalDue)}</td>
          </tr>
          <tr>
            <td className="px-2 py-1 border-b border-gray-400 whitespace-nowrap overflow-hidden text-ellipsis">
              Less: Payment{lastPaymentDate ? ` (${formatDate(lastPaymentDate)})` : ""} =
            </td>
            <td className="px-2 py-1 border-b border-l border-gray-400 text-right whitespace-nowrap">{paidBetween > 0 ? `BDT ${fmt(paidBetween)}` : "BDT 0.00"}</td>
          </tr>
          <tr className="font-bold bg-yellow-100">
            <td className="px-2 py-1 whitespace-nowrap">Running Due =</td>
            <td className="px-2 py-1 border-l border-gray-400 text-right whitespace-nowrap">BDT {fmt(runningDue)}</td>
          </tr>
        </tbody>
      </table>

      <div className="flex justify-between items-end text-sm pt-6">
        <div className="border-t border-gray-500 pt-1 w-40 text-center">Received By</div>
        <div className="border-t border-gray-500 pt-1 w-40 text-center">Prepared By</div>
        <div className="w-44 text-center">
          {signatureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signatureUrl} alt="Authorised Signature" className="h-14 mx-auto object-contain" />
          ) : (
            <div className="border-t border-gray-500 pt-1">Authorised Signature</div>
          )}
        </div>
      </div>
    </div>
  );
}
