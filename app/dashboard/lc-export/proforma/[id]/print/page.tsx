import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { notFound } from "next/navigation";
import PrintButton from "@/app/dashboard/PrintButton";

export default async function PIPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: pi } = await supabase
    .from("proforma_invoices")
    .select("*, customers(name, address, phone), pi_bookings(bookings(booking_no, quantity_pcs, finished_goods(product_name, length_cm, width_cm, thickness)))")
    .eq("id", id)
    .single();

  const { data: company } = await supabase.from("company_profile").select("*").single();
  if (!pi) return notFound();

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white text-gray-900 print:p-0">
      <PrintButton />
      <div className="text-center mb-6 border-b pb-4">
        <h1 className="text-2xl font-bold">{company?.name}</h1>
        <p className="text-sm text-gray-600">{company?.address}</p>
        <p className="text-sm text-gray-600">Phone: {company?.phone} | Email: {company?.email}</p>
      </div>
      <h2 className="text-xl font-semibold text-center mb-4">Proforma Invoice</h2>
      <div className="flex justify-between mb-6 text-sm">
        <div>
          <p className="font-medium">Buyer:</p>
          <p>{pi.customers?.name}</p>
          <p className="text-gray-600">{pi.customers?.address}</p>
          {pi.buyer_name && <p className="text-gray-600">Buyer: {pi.buyer_name}</p>}
          {pi.merchant_name && <p className="text-gray-600">Merchant: {pi.merchant_name}</p>}
        </div>
        <div className="text-right">
          <p><span className="text-gray-600">PI No: </span><strong>{pi.pi_no}</strong></p>
          <p><span className="text-gray-600">Date: </span>{formatDate(pi.pi_date)}</p>
          {pi.style && <p><span className="text-gray-600">Style: </span>{pi.style}</p>}
        </div>
      </div>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr className="border-b-2 border-gray-800">
            <th className="text-left py-2">Booking</th>
            <th className="text-left py-2">Product</th>
            <th className="text-right py-2">Size (cm)</th>
            <th className="text-right py-2">Qty</th>
          </tr>
        </thead>
        <tbody>
          {(pi.pi_bookings ?? []).map((pb: any, i: number) => (
            <tr key={i} className="border-b">
              <td className="py-2">{pb.bookings?.booking_no}</td>
              <td className="py-2">{pb.bookings?.finished_goods?.product_name}</td>
              <td className="text-right py-2">{pb.bookings?.finished_goods?.length_cm}×{pb.bookings?.finished_goods?.width_cm}×{pb.bookings?.finished_goods?.thickness}</td>
              <td className="text-right py-2">{pb.bookings?.quantity_pcs}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-800 font-semibold">
            <td colSpan={3} className="text-right py-2">Total Amount</td>
            <td className="text-right py-2">{pi.total_amount?.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="mt-16 flex justify-between text-sm">
        <div className="border-t border-gray-400 pt-2 w-40 text-center">Prepared By</div>
        <div className="border-t border-gray-400 pt-2 w-40 text-center">Authorized Signature</div>
      </div>
    </div>
  );
}