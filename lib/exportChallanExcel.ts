import ExcelJS from "exceljs";
import { groupChallanItemsByProduct } from "./challanProductGroups";

type CompanyInfo = { name?: string | null; address?: string | null; phone?: string | null; email?: string | null } | null;

const GRAY = "FF6B7280";

// প্রিন্ট ভিউ (ChallanPrintView.tsx)-এর লেআউট হুবহু অনুসরণ করে exceljs দিয়ে স্টাইল করা
// (বর্ডার, বোল্ড হেডার, সেন্টার করা টাইটেল) Excel বানায় — এক্সেল ফাইলটাও প্রিন্ট/PDF-এর
// মতোই দেখায়, কারো কাছে সরাসরি সাবমিট করা যায়। একই স্টাইলের পরপর একাধিক লাইন থাকলে
// Product কলাম merge & center হয় (lib/challanProductGroups.ts)।
export function buildChallanWorkbook(params: {
  challan: any;
  company: CompanyInfo;
  challanDateLabel: string;
  measurementByItem: Record<string, string>;
}): ExcelJS.Workbook {
  const { challan, company, challanDateLabel, measurementByItem } = params;
  const items: any[] = challan.delivery_challan_items ?? [];
  const hasPackets = items.some((i) => i.packets != null);
  const totalCols = hasPackets ? 4 : 3;
  const totalQty = items.reduce((s, i) => s + Number(i.quantity_pcs || 0), 0);
  const totalPackets = items.reduce((s, i) => s + Number(i.packets || 0), 0);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Challan", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
    views: [{ showGridLines: false }],
  });

  ws.columns = hasPackets
    ? [{ width: 42 }, { width: 26 }, { width: 14 }, { width: 12 }]
    : [{ width: 46 }, { width: 30 }, { width: 16 }];

  function mergedRow(text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, totalCols);
    const cell = row.getCell(1);
    cell.font = { bold: !!opts.bold, size: opts.size ?? 11, color: { argb: opts.color ?? "FF111827" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    return row;
  }

  // দুই পাশে তথ্য — বামে (Deliver To ব্লক), ডানে (Challan No / Date), print view-এর
  // "flex justify-between" ব্লকের মতো
  function twoSideRow(leftText: string, leftBold: boolean, rightLabel?: string, rightValue?: string) {
    const row = ws.addRow([]);
    const leftSpan = Math.max(1, totalCols - 1);
    ws.mergeCells(row.number, 1, row.number, leftSpan);
    const leftCell = row.getCell(1);
    leftCell.value = leftText;
    leftCell.font = { bold: leftBold, size: 10.5 };
    leftCell.alignment = { horizontal: "left", vertical: "middle" };

    if (rightLabel || rightValue) {
      ws.mergeCells(row.number, leftSpan + 1, row.number, totalCols);
      const rightCell = row.getCell(leftSpan + 1);
      rightCell.value = {
        richText: [
          { font: { size: 10.5, color: { argb: GRAY } }, text: rightLabel ? `${rightLabel} ` : "" },
          { font: { size: 10.5, bold: true }, text: rightValue || "" },
        ],
      } as any;
      rightCell.alignment = { horizontal: "right", vertical: "middle" };
    }
    return row;
  }

  mergedRow(company?.name || "", { bold: true, size: 18 });
  mergedRow(company?.address || "", { size: 10, color: GRAY });
  mergedRow(`Phone: ${company?.phone || ""} | Email: ${company?.email || ""}`, { size: 10, color: GRAY });
  ws.addRow([]);
  mergedRow("Delivery Challan", { bold: true, size: 15 });
  ws.addRow([]);

  twoSideRow("Deliver To:", true, "Challan No:", String(challan.challan_no ?? ""));
  twoSideRow(challan.delivery_point || challan.customers?.name || "-", false, "Date:", challanDateLabel);
  if (challan.buyer_name) twoSideRow(`Buyer: ${challan.buyer_name}`, false);
  if (challan.merchant_name) twoSideRow(`Merchant: ${challan.merchant_name}`, false);
  if (challan.style) twoSideRow(`Style: ${challan.style}`, false);
  if (challan.customer_booking_ref) twoSideRow(`Customer Booking Ref: ${challan.customer_booking_ref}`, false);

  ws.addRow([]);

  const headerLabels = hasPackets ? ["Product", "Measurement", "Quantity", "Packets"] : ["Product", "Measurement", "Quantity"];
  const headerRow = ws.addRow(headerLabels);
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 10.5 };
    cell.alignment = { horizontal: colNumber >= 3 ? "right" : "left", vertical: "middle" };
    cell.border = { bottom: { style: "medium" } };
  });

  const grouped = groupChallanItemsByProduct(items);
  const productRowStart = headerRow.number + 1;

  grouped.forEach((g) => {
    const item = g.item;
    const rowValues = hasPackets
      ? [g.label, measurementByItem[item.id] || "-", `${Number(item.quantity_pcs || 0)} Pcs`, `${Number(item.packets || 0)} Pkts`]
      : [g.label, measurementByItem[item.id] || "-", `${Number(item.quantity_pcs || 0)} Pcs`];
    const row = ws.addRow(rowValues);
    row.eachCell((cell, colNumber) => {
      cell.font = { size: 10.5 };
      cell.alignment = {
        horizontal: colNumber >= 3 ? "right" : "left",
        vertical: "middle",
        wrapText: colNumber === 1 || colNumber === 2,
      };
      cell.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
    });
  });

  // পরপর একই Product একাধিক লাইনে থাকলে সেই রেঞ্জের Product কলাম merge & center
  let r = productRowStart;
  grouped.forEach((g) => {
    if (g.groupStart && g.groupSize > 1) {
      ws.mergeCells(r, 1, r + g.groupSize - 1, 1);
      const cell = ws.getCell(r, 1);
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }
    r += 1;
  });

  const totalValues = hasPackets
    ? ["Total", "", `${totalQty} Pcs`, `${totalPackets} Pkts`]
    : ["Total", "", `${totalQty} Pcs`];
  const totalRow = ws.addRow(totalValues);
  ws.mergeCells(totalRow.number, 1, totalRow.number, 2);
  totalRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10.5 };
    cell.alignment = { horizontal: "right", vertical: "middle" };
    cell.border = { top: { style: "medium" } };
  });

  ws.addRow([]);
  mergedRow("Received the above goods as per order with good condition.", { size: 10 }).getCell(1).alignment = {
    horizontal: "left",
  };
  ws.addRow([]);
  ws.addRow([]);
  ws.addRow([]);

  const sigRow = ws.addRow([]);
  const sigLeftSpan = Math.max(1, Math.floor(totalCols / 2));
  ws.mergeCells(sigRow.number, 1, sigRow.number, sigLeftSpan);
  const sigLeft = sigRow.getCell(1);
  sigLeft.value = "Receiver's Signature";
  sigLeft.font = { bold: true, size: 10 };
  sigLeft.alignment = { horizontal: "left" };
  sigLeft.border = { top: { style: "thin" } };

  ws.mergeCells(sigRow.number, sigLeftSpan + 1, sigRow.number, totalCols);
  const sigRight = sigRow.getCell(sigLeftSpan + 1);
  sigRight.value = "Authorized By";
  sigRight.font = { bold: true, size: 10 };
  sigRight.alignment = { horizontal: "right" };
  sigRight.border = { top: { style: "thin" } };

  return wb;
}

export async function downloadChallanExcel(params: {
  challan: any;
  company: CompanyInfo;
  challanDateLabel: string;
  measurementByItem: Record<string, string>;
}) {
  const wb = buildChallanWorkbook(params);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Challan-${params.challan.challan_no}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
