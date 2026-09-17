import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { notFound } from "next/navigation";
import { currencySymbol } from "@/lib/numberToWords";
import NewRevisionButton from "./NewRevisionButton";
import ProformaViewActions from "./ProformaViewActions";
import { money } from "@/lib/format";
import { getCurrentAppUser } from "@/lib/supabase/getCurrentAppUser";
import { AT_DEFAULT_MARKUP_PERCENTAGE } from "@/lib/atCommission";
import { calcInvoiceCommission } from "@/lib/commission";

export default async function ProformaViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: pi } = await supabase
    .from("proforma_invoices")
    .select("*, customers(name, address, phone, code, commission_enabled, commission_percentage)")
    .eq("id", id).single();

  if (!pi) return notFound();

  const appUser = await getCurrentAppUser();
  const isPiOnly = appUser?.role === "customer_pi_only";
  // role='customer_pi_only' — ID দিয়ে সরাসরি অন্য কাস্টমারের PI-তে ঢোকার চেষ্টা আটকানো
  // (list-level filter শুধু UI, এটাই আসল guard)
  if (isPiOnly && pi.customer_id !== appUser?.restricted_customer_id) return notFound();

  const { data: items } = await supabase
    .from("pi_items")
    .select("*, bookings(id, booking_no, buyer_id, required_lbs, measurement_type, measurement_unit, length_val, width_val, flap_val, gusset_val)")
    .eq("pi_id", id).order("sl_no");

  const sym = currencySymbol(pi.currency);

  // এই PI-এর সাথে যুক্ত বুকিংগুলোর বিপরীতে Booking/Sales Invoice/Delivery Challan লিংক এবং
  // Sales Invoice Value + Commission — role='customer_pi_only'-এর জন্য দেখানো হয় না, কারণ
  // ওই লিংকগুলো (Booking/Invoice/Challan পেজ) তাদের জন্য proxy.ts-এ ব্লকড, আর Commission
  // সংবেদনশীল অভ্যন্তরীণ তথ্য।
  const bookingIds = Array.from(new Set((items ?? []).map((it: any) => it.booking_id).filter(Boolean))) as string[];
  const bookingById: Record<string, any> = {};
  (items ?? []).forEach((it: any) => { if (it.bookings) bookingById[it.bookings.id] = it.bookings; });

  let bookingLinks: { id: string; booking_no: string }[] = [];
  let salesInvoiceLinks: { id: string; invoice_no: string; invoice_type: string }[] = [];
  let challanLinks: { id: string; challan_no: string; challan_date: string }[] = [];
  let salesInvoiceValue = 0;
  let commission: number | null = null;

  if (!isPiOnly && bookingIds.length > 0) {
    // একই booking_no একাধিক booking row-এ শেয়ার হতে পারে (এক Booking Group-এর আলাদা
    // measurement লাইন) — booking_no দিয়ে dedupe করা হচ্ছে, যেকোনো একটা id দিয়ে লিংক করলেই
    // পুরো Booking Group-এর ভিউ খুলবে (bookings/[id]/page.tsx booking_group_id দিয়ে সব আনে)।
    bookingLinks = Array.from(
      new Map((items ?? []).filter((it: any) => it.bookings).map((it: any) => [it.bookings.booking_no, { id: it.bookings.id, booking_no: it.bookings.booking_no }])).values()
    );

    const [{ data: invoiceItems }, { data: challanItems }] = await Promise.all([
      supabase
        .from("sales_invoice_items")
        .select("booking_id, unit_price, quantity_pcs, amount, sales_invoices(id, invoice_no, invoice_type)")
        .in("booking_id", bookingIds),
      supabase
        .from("delivery_challan_items")
        .select("booking_id, delivery_challans(id, challan_no, challan_date)")
        .in("booking_id", bookingIds),
    ]);

    const invoiceMap = new Map<string, { id: string; invoice_no: string; invoice_type: string }>();
    (invoiceItems ?? []).forEach((it: any) => {
      salesInvoiceValue += it.amount || 0;
      if (it.sales_invoices) invoiceMap.set(it.sales_invoices.id, { id: it.sales_invoices.id, invoice_no: it.sales_invoices.invoice_no, invoice_type: it.sales_invoices.invoice_type ?? "standard" });
    });
    salesInvoiceLinks = Array.from(invoiceMap.values()).sort((a, b) => a.invoice_no.localeCompare(b.invoice_no));

    const challanMap = new Map<string, { id: string; challan_no: string; challan_date: string }>();
    (challanItems ?? []).forEach((it: any) => {
      const dc = it.delivery_challans;
      if (dc) challanMap.set(dc.id, { id: dc.id, challan_no: dc.challan_no, challan_date: dc.challan_date });
    });
    challanLinks = Array.from(challanMap.values()).sort((a, b) => a.challan_date.localeCompare(b.challan_date));

    const buyerIds = Array.from(new Set(Object.values(bookingById).map((b: any) => b.buyer_id).filter(Boolean))) as string[];
    const { data: buyers } = buyerIds.length
      ? await supabase.from("buyers").select("id, name, markup_percentage").in("id", buyerIds)
      : { data: [] };
    const markupMap: Record<string, number> = {};
    const buyerNameMap: Record<string, string> = {};
    (buyers ?? []).forEach((b: any) => { markupMap[b.id] = b.markup_percentage ?? AT_DEFAULT_MARKUP_PERCENTAGE; buyerNameMap[b.id] = b.name; });

    const commissionItems = (invoiceItems ?? []).map((it: any) => {
      const b = bookingById[it.booking_id];
      return {
        unit_price: it.unit_price || 0, quantity_pcs: it.quantity_pcs || 0, amount: it.amount || 0,
        order_lbs: b?.required_lbs || 0,
        markup_pct: b?.buyer_id ? (markupMap[b.buyer_id] ?? AT_DEFAULT_MARKUP_PERCENTAGE) : AT_DEFAULT_MARKUP_PERCENTAGE,
        buyer_name: b?.buyer_id ? (buyerNameMap[b.buyer_id] ?? null) : null,
        measurement: b ? {
          type: b.measurement_type ?? null, length: b.length_val ?? null, width: b.width_val ?? null,
          flap: b.flap_val ?? null, gusset: b.gusset_val ?? null, unit: b.measurement_unit ?? null,
        } : null,
      };
    });
    const autoCommission = calcInvoiceCommission(
      pi.customers?.code ?? null,
      !!pi.customers?.commission_enabled,
      Number(pi.customers?.commission_percentage ?? 1),
      commissionItems,
    );
    // হাতে-বসানো commission_amount থাকলে সেটাই প্রাধান্য পায় (PI লিস্টের ঠিক একই নিয়ম)
    commission = pi.commission_amount != null ? Number(pi.commission_amount) : autoCommission;
    if (pi.real_amount != null) salesInvoiceValue = Number(pi.real_amount);
  }

  return (
    <div>
      <Link href="/dashboard/lc-export/proforma" className="text-sm text-gray-500 hover:underline">← সব PI-এর তালিকায় ফিরুন</Link>
      <div className="flex items-center justify-between mt-2 mb-4">
        <h1 className="text-2xl font-semibold">{pi.pi_no} {pi.revision > 0 && `(Rev-${pi.revision})`}</h1>
        <div className="flex gap-2">
          <ProformaViewActions piId={id} piNo={pi.pi_no} />
          {!isPiOnly && <NewRevisionButton piId={id} />}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm mb-4 text-sm flex flex-wrap justify-between gap-6">
        <div className="space-y-1">
          <p><span className="text-gray-500">Customer:</span> {pi.customers?.name ?? "Manual"}</p>
          <p><span className="text-gray-500">Date:</span> {formatDate(pi.pi_date)}</p>
          <p><span className="text-gray-500">Currency:</span> {pi.currency}</p>
          <p><span className="text-gray-500">Status:</span> {pi.status}</p>
        </div>
        {!isPiOnly && bookingIds.length > 0 && (
          <div className="space-y-1 text-right">
            <p><span className="text-gray-500">Sales Invoice Value:</span> <strong>{money(salesInvoiceValue)}</strong></p>
            {commission != null && <p><span className="text-gray-500">Commission:</span> <strong className="text-purple-700">{money(commission)}</strong></p>}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Sl</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2">Measurement</th>
              <th className="px-4 py-2 text-right">Qty (Pcs)</th>
              <th className="px-4 py-2 text-right">Qty (Dzn)</th>
              <th className="px-4 py-2 text-right">Price/Unit</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((it: any) => {
              const amount = it.price_basis === "dzn" ? (it.qty_pcs / 12) * it.price_unit : it.qty_pcs * it.price_unit;
              return (
                <tr key={it.id} className="border-t">
                  <td className="px-4 py-2">{it.sl_no}</td>
                  <td className="px-4 py-2 whitespace-pre-line">
                    {it.description}
                    {it.bookings && !isPiOnly && (
                      <>
                        {" ("}
                        <Link href={`/dashboard/sales/bookings/${it.bookings.id}`} className="text-blue-700 hover:underline text-xs">{it.bookings.booking_no}</Link>
                        {")"}
                      </>
                    )}
                    {it.bookings && isPiOnly && <span className="text-xs text-gray-400"> ({it.bookings.booking_no})</span>}
                  </td>
                  <td className="px-4 py-2">{it.measurement}</td>
                  <td className="px-4 py-2 text-right">{it.qty_pcs}</td>
                  <td className="px-4 py-2 text-right">{money((it.qty_pcs / 12))}</td>
                  <td className="px-4 py-2 text-right">{sym}{Number(it.price_unit).toFixed(pi.price_decimals ?? 4)}/{it.price_basis}</td>
                  <td className="px-4 py-2 text-right">{sym}{money(amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm max-w-sm ml-auto mb-4 text-sm">
        <p>Total: <strong>{pi.currency} {money(pi.total_amount)}</strong></p>
      </div>

      {!isPiOnly && (
        <div className="rounded-xl border bg-white p-4 shadow-sm text-sm space-y-3">
          <div>
            <p className="font-semibold mb-1">Booking No/Nos: -</p>
            {bookingLinks.length > 0 ? (
              <ol className="list-decimal list-inside">
                {bookingLinks.map((b) => (
                  <li key={b.id}>
                    <Link href={`/dashboard/sales/bookings/${b.id}`} className="text-blue-700 hover:underline">{b.booking_no}</Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-gray-400 italic">কোনো Booking যুক্ত নেই (Manual PI)</p>
            )}
          </div>
          <div>
            <p className="font-semibold mb-1">Sales Invoice No/Nos: -</p>
            {salesInvoiceLinks.length > 0 ? (
              <ol className="list-decimal list-inside">
                {salesInvoiceLinks.map((inv) => (
                  <li key={inv.id}>
                    <Link href={`/dashboard/sales/invoices/${inv.id}/${inv.invoice_type === "lbs" ? "print-lbs" : "print"}`} target="_blank" className="text-blue-700 hover:underline">{inv.invoice_no}</Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-gray-400 italic">এখনো কোনো Sales Invoice তৈরি হয়নি</p>
            )}
          </div>
          <div>
            <p className="font-semibold mb-1">Delivery Challan No/Nos: -</p>
            {challanLinks.length > 0 ? (
              <ol className="list-decimal list-inside">
                {challanLinks.map((c) => (
                  <li key={c.id}>
                    <Link href={`/dashboard/sales/delivery-challan/${c.id}/print`} target="_blank" className="text-blue-700 hover:underline">{c.challan_no}</Link> – DT-{formatDate(c.challan_date)}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-gray-400 italic">এখনো কোনো Delivery Challan তৈরি হয়নি</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
