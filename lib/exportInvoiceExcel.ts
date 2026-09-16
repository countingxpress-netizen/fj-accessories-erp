import ExcelJS from "exceljs";

const GRAY = "FF6B7280";

export type InvoiceExcelItem = {
  style: string;
  product: string;
  measurement: string;
  quantity_pcs: number;
  unit_price: number;
  amount: number;
  line_label?: string | null;
};

export type InvoiceExcelParams = {
  company: { name?: string | null; address?: string | null; phone?: string | null; email?: string | null } | null;
  invoiceNo: string;
  invoiceDateLabel: string;
  deliveryPoint?: string | null;
  buyerName?: string | null;
  merchantName?: string | null;
  customerBookingRef?: string | null;
  customer: { name?: string | null; address?: string | null; phone?: string | null } | null;
  isOther: boolean;
  items: InvoiceExcelItem[];
  total: number;
  amountInWordsText: string;
  summary: {
    previousLabel: string;
    prevDue: number;
    thisBillLabel: string;
    thisBill: number;
    totalDue: number;
    paidLabel: string;
    paid: number;
    runningDue: number;
  };
  note?: string | null;
};

function fmtMoney(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// প্রিন্ট ভিউ (print/page.tsx)-এর লেআউট হুবহু অনুসরণ করে exceljs দিয়ে স্টাইল করা
// (বর্ডার, বোল্ড হেডার, সেন্টার করা টাইটেল) Excel বানায় — Delivery Challan Excel-এর
// (lib/exportChallanExcel.ts) একই প্যাটার্ন। পরপর একই Style একাধিক লাইনে থাকলে
// Style কলাম merge & center হয়।
export function buildInvoiceWorkbook(params: InvoiceExcelParams): ExcelJS.Workbook {
  const { company, invoiceNo, invoiceDateLabel, deliveryPoint, buyerName, merchantName, customerBookingRef, customer, isOther, items, total, amountInWordsText, summary, note } = params;

  const totalCols = isOther ? 5 : 7;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Invoice", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
    views: [{ showGridLines: false }],
  });

  ws.columns = isOther
    ? [{ width: 6 }, { width: 40 }, { width: 10 }, { width: 12 }, { width: 14 }]
    : [{ width: 6 }, { width: 18 }, { width: 26 }, { width: 20 }, { width: 10 }, { width: 12 }, { width: 14 }];

  function mergedRow(text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, totalCols);
    const cell = row.getCell(1);
    cell.font = { bold: !!opts.bold, size: opts.size ?? 11, color: { argb: opts.color ?? "FF111827" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    return row;
  }

  // দুই পাশে তথ্য — বামে (Bill To ব্লক), ডানে (Invoice No / Date), print view-এর
  // "flex justify-between" ব্লকের মতো
  function twoSideRow(leftText: string, leftBold: boolean, rightLabel?: string, rightValue?: string) {
    const row = ws.addRow([]);
    const leftSpan = Math.max(1, totalCols - 2);
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
  mergedRow("Sales Invoice", { bold: true, size: 15 });
  ws.addRow([]);

  twoSideRow("Bill To:", true, "Invoice No:", invoiceNo);
  twoSideRow(customer?.name || "", false, "Date:", invoiceDateLabel);
  if (customer?.address) twoSideRow(customer.address, false, deliveryPoint ? "Delivery Point:" : undefined, deliveryPoint || undefined);
  if (customer?.phone) twoSideRow(customer.phone, false);
  if (buyerName) twoSideRow(`Buyer: ${buyerName}`, false);
  if (merchantName) twoSideRow(`Merchant: ${merchantName}`, false);
  if (customerBookingRef) twoSideRow(`Customer Booking Ref: ${customerBookingRef}`, false);

  ws.addRow([]);

  const headerLabels = isOther
    ? ["Sl", "Description", "Qty", "Unit Price", "Amount"]
    : ["Sl", "Style", "Product", "Measurement", "Qty", "Unit Price", "Amount"];
  const headerRow = ws.addRow(headerLabels);
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 10.5 };
    cell.alignment = { horizontal: colNumber >= (isOther ? 3 : 5) ? "right" : "left", vertical: "middle" };
    cell.border = { bottom: { style: "medium" } };
  });

  const itemRowStart = headerRow.number + 1;
  items.forEach((item, i) => {
    const rowValues = isOther
      ? [i + 1, item.line_label || "", item.quantity_pcs, fmtMoney(item.unit_price), fmtMoney(item.amount)]
      : [i + 1, item.style, item.product, item.measurement, item.quantity_pcs, fmtMoney(item.unit_price), fmtMoney(item.amount)];
    const row = ws.addRow(rowValues);
    row.eachCell((cell, colNumber) => {
      cell.font = { size: 10.5 };
      cell.alignment = {
        horizontal: colNumber >= (isOther ? 3 : 5) ? "right" : "left",
        vertical: "middle",
        wrapText: !isOther && (colNumber === 2 || colNumber === 3),
      };
      cell.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
    });
  });

  // পরপর একই Style একাধিক লাইনে থাকলে সেই রেঞ্জের Style কলাম merge & center
  if (!isOther) {
    let r = itemRowStart;
    let i = 0;
    while (i < items.length) {
      let j = i + 1;
      while (j < items.length && items[j].style === items[i].style) j++;
      const groupSize = j - i;
      if (groupSize > 1) {
        ws.mergeCells(r, 2, r + groupSize - 1, 2);
        const cell = ws.getCell(r, 2);
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      }
      r += groupSize;
      i = j;
    }
  }

  const totalRow = ws.addRow(
    isOther
      ? ["Total", "", "", "", fmtMoney(total)]
      : ["Total", "", "", "", "", "", fmtMoney(total)],
  );
  ws.mergeCells(totalRow.number, 1, totalRow.number, totalCols - 1);
  totalRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10.5 };
    cell.alignment = { horizontal: "right", vertical: "middle" };
    cell.border = { top: { style: "medium" } };
  });

  ws.addRow([]);
  mergedRow("Amount In Word (BDT):", { bold: true, size: 10.5 }).getCell(1).alignment = { horizontal: "left" };
  mergedRow(amountInWordsText, { size: 10.5 }).getCell(1).alignment = { horizontal: "left" };
  ws.addRow([]);

  function summaryRow(label: string, value: number) {
    const row = ws.addRow([]);
    ws.mergeCells(row.number, 1, row.number, totalCols - 2);
    const leftCell = row.getCell(1);
    leftCell.value = label;
    leftCell.font = { size: 10.5 };
    leftCell.alignment = { horizontal: "left", vertical: "middle" };
    ws.mergeCells(row.number, totalCols - 1, row.number, totalCols);
    const rightCell = row.getCell(totalCols - 1);
    rightCell.value = `BDT ${fmtMoney(value)}`;
    rightCell.font = { size: 10.5, bold: true };
    rightCell.alignment = { horizontal: "right", vertical: "middle" };
    return row;
  }

  summaryRow(`${summary.previousLabel} Due =`, summary.prevDue);
  summaryRow(`${summary.thisBillLabel} =`, summary.thisBill);
  summaryRow("Total Due =", summary.totalDue);
  summaryRow(`${summary.paidLabel} =`, summary.paid);
  summaryRow("Running Due =", summary.runningDue);

  if (note) {
    ws.addRow([]);
    mergedRow(`Note: ${note}`, { size: 10 }).getCell(1).alignment = { horizontal: "left", wrapText: true };
  }

  ws.addRow([]);
  ws.addRow([]);

  const sigRow = ws.addRow([]);
  const sigLeftSpan = Math.max(1, Math.floor(totalCols / 2));
  ws.mergeCells(sigRow.number, 1, sigRow.number, sigLeftSpan);
  const sigLeft = sigRow.getCell(1);
  sigLeft.value = "Received By";
  sigLeft.font = { bold: true, size: 10 };
  sigLeft.alignment = { horizontal: "left" };
  sigLeft.border = { top: { style: "thin" } };

  ws.mergeCells(sigRow.number, sigLeftSpan + 1, sigRow.number, totalCols);
  const sigRight = sigRow.getCell(sigLeftSpan + 1);
  sigRight.value = "Authorised Signature";
  sigRight.font = { bold: true, size: 10 };
  sigRight.alignment = { horizontal: "right" };
  sigRight.border = { top: { style: "thin" } };

  return wb;
}

export async function downloadInvoiceExcel(params: InvoiceExcelParams & { filename: string }) {
  const wb = buildInvoiceWorkbook(params);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = params.filename.endsWith(".xlsx") ? params.filename : `${params.filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
