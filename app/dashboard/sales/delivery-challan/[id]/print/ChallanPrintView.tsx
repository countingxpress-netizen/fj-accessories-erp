"use client";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import ChallanPrintButton from "./ChallanPrintButton";
import { downloadChallanExcel } from "@/lib/exportChallanExcel";
import { groupChallanItemsByProduct } from "@/lib/challanProductGroups";

const nf = new Intl.NumberFormat("en-US");

export default function ChallanPrintView({
  challan, company, challanDateLabel, measurementByItem = {},
}: {
  challan: any; company: any; challanDateLabel: string;
  measurementByItem?: Record<string, string>;
}) {
  const supabase = createClient();
  const sheetRef = useRef<HTMLDivElement>(null);
  const warnRef = useRef<HTMLSpanElement>(null);

  const items: any[] = challan.delivery_challan_items ?? [];
  const totalQty = items.reduce((s, i) => s + Number(i.quantity_pcs || 0), 0);
  const totalPackets = items.reduce((s, i) => s + Number(i.packets || 0), 0);
  const hasPackets = items.some((i) => i.packets != null);

  async function handleExcelDownload() {
    await downloadChallanExcel({ challan, company, challanDateLabel, measurementByItem });
  }

  // এক পেজে না আঁটলে নন-প্রিন্ট ওয়ার্নিং — re-render ছাড়াই DOM-এ
  useEffect(() => {
    const content = sheetRef.current?.querySelector(".challan-body");
    if (content && warnRef.current && content.scrollHeight > content.clientHeight + 4) {
      warnRef.current.style.display = "inline";
    }
  }, []);

  // মার্জ করা Product সেল এডিট করলে গ্রুপের সবগুলো লাইনেই লেবেল বসে — যাতে পরে qty/packets
  // বদলে গ্রুপ ভেঙে গেলেও প্রতিটা লাইনের লেবেল ঠিক থাকে
  async function saveLabel(itemIds: string[], text: string, fallback: string) {
    const clean = text.trim();
    await supabase
      .from("delivery_challan_items")
      .update({ print_label: clean && clean !== fallback ? clean : null })
      .in("id", itemIds);
  }

  const groupedItems = groupChallanItemsByProduct(items);

  return (
    <div className="mx-auto max-w-[210mm] bg-white text-gray-900 challan-root">
      <style>{`
        @page { size: A4; margin: 0; }
        .challan-sheet { padding: 12mm 15mm; height: 297mm; display: flex; flex-direction: column; overflow: hidden; }
        .challan-body { flex: 1 1 auto; min-height: 0; overflow: hidden; }
        .cell-edit:focus { outline: 1px dashed #9ca3af; outline-offset: 2px; border-radius: 2px; }
        @media print {
          .no-print { display: none !important; }
          .challan-root { max-width: none; }
          /* চালান নিজের 12mm sheet padding রাখে — dashboard <main>-এর print padding বাদ */
          main { padding: 0 !important; }
        }
      `}</style>

      <div className="no-print flex items-center justify-end gap-3 px-4 pt-4">
        <span ref={warnRef} style={{ display: "none" }} className="text-xs text-red-600">
          ⚠ এই চালান এক পেজে আঁটছে না — লাইন কমান
        </span>
        <button
          onClick={handleExcelDownload}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm text-white"
        >
          📊 Excel ডাউনলোড
        </button>
        <ChallanPrintButton challanId={challan.id} currentStatus={challan.delivery_status ?? "challan_ready"} />
      </div>

      <div ref={sheetRef} className="challan-sheet">
        <div className="challan-body">
          <div className="mb-4 flex items-center justify-center gap-4 border-b pb-3">
            {company?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo_url} alt="" className="h-14 w-14 shrink-0 object-contain" />
            )}
            <div className="text-center">
              <h1 className="text-2xl font-bold">{company?.name}</h1>
              <p className="text-xs text-gray-600">{company?.address}</p>
              <p className="text-xs text-gray-600">Phone: {company?.phone} | Email: {company?.email}</p>
            </div>
          </div>

          <h2 className="mb-3 text-center text-lg font-semibold">Delivery Challan</h2>

          <div className="mb-4 flex justify-between text-sm">
            <div>
              <p className="font-medium">Deliver To:</p>
              <p className="text-gray-700">{challan.delivery_point || challan.customers?.name || "-"}</p>
              {challan.buyer_name && <p className="text-gray-600">Buyer: {challan.buyer_name}</p>}
              {challan.merchant_name && <p className="text-gray-600">Merchant: {challan.merchant_name}</p>}
              {challan.style && <p className="text-gray-600">Style: {challan.style}</p>}
              {challan.customer_booking_ref && <p className="text-gray-600">Customer Booking Ref: {challan.customer_booking_ref}</p>}
            </div>
            <div className="text-right">
              <p><span className="text-gray-600">Challan No: </span><strong>{challan.challan_no}</strong></p>
              <p><span className="text-gray-600">Date: </span>{challanDateLabel}</p>
            </div>
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-gray-800">
                <th className="py-1.5 text-left">Product</th>
                <th className="py-1.5 text-left">Measurement</th>
                <th className="w-32 py-1.5 text-right">Quantity</th>
                {hasPackets && <th className="w-24 py-1.5 text-right">Packets</th>}
              </tr>
            </thead>
            <tbody>
              {groupedItems.map((g, idx) => {
                const item = g.item;
                return (
                  <tr key={item.id} className="border-b">
                    {g.groupStart && (
                      <td
                        className={`py-1.5 pr-3 align-middle${g.groupSize > 1 ? " text-center" : ""}`}
                        rowSpan={g.groupSize}
                      >
                        <span
                          className="cell-edit inline-block min-w-[3rem]"
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(e) => {
                            const groupIds = groupedItems.slice(idx, idx + g.groupSize).map((x) => x.item.id);
                            saveLabel(groupIds, e.currentTarget.textContent || "", g.label);
                          }}
                        >
                          {g.label}
                        </span>
                      </td>
                    )}
                    <td className="py-1.5 pr-3 text-gray-700">{measurementByItem[item.id] || "-"}</td>
                    <td className="py-1.5 text-right">{nf.format(Number(item.quantity_pcs || 0))} Pcs</td>
                    {hasPackets && <td className="py-1.5 text-right">{Number(item.packets || 0)} Pkts</td>}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-800 font-semibold">
                <td className="py-1.5 text-right" colSpan={2}>Total</td>
                <td className="py-1.5 text-right">{nf.format(totalQty)} Pcs</td>
                {hasPackets && <td className="py-1.5 text-right">{totalPackets} Pkts</td>}
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="shrink-0 pt-4 text-sm">
          <p>Received the above goods as per order with good condition.</p>
          <div className="mt-14 flex items-start justify-between">
            <div className="w-56">
              <div className="border-t border-gray-500 pt-1 font-medium">Receiver&apos;s Signature</div>
              <div className="text-gray-600">Name Seal</div>
            </div>
            <div className="w-56 text-right">
              <div className="border-t border-gray-500 pt-1 font-medium">Authorized By</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
