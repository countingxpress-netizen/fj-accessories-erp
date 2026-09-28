import ExcelJS from "exceljs";

// Excel Bulk Import for Manual Proforma Invoice — একই effect যা আগে script দিয়ে হতো
// (AT Accessories / Irish Garments historical PI entry), এখন UI থেকে। একটা row = একটা
// PI-এর একটা line item; একই "PI Group" মান থাকা পরপর row-গুলো একই PI-তে জমা হয় (multi-line
// PI সাপোর্টের জন্য)। Header field (Customer/Date/...) শুধু গ্রুপের প্রথম row-এ পড়া হয়,
// বাকিগুলোয় ফাঁকা রাখা যায়। Column অর্ডার fixed — position দিয়ে পড়া হয়, নাম দিয়ে না, তাই
// টেমপ্লেটের কলাম অর্ডার বদলানো যাবে না।

export const PI_IMPORT_HEADERS = [
  "PI Group", "Customer Name", "PI Date", "Valid Till", "Buyer Name", "Merchant Name",
  "Garments Name", "Garments Address", "Item Description", "Currency", "Exchange Rate",
  "Discount Type", "Discount Value", "Adjustment Amount", "HS Code", "BIN No",
  "Total Weight Kg", "Sales Invoice Value", "Commission Amount", "Amount Notes",
  "Description", "Measurement", "Qty Pcs", "Price Unit", "Price Basis",
  "Tube Inch", "Cutting Inch", "Thickness Mm",
] as const;

const EXAMPLE_ROWS: (string | number)[][] = [
  ["1", "AT Accessories", "2026-09-28", "", "H&M", "Masud", "", "", "Poly Bags", "USD", 107,
    "percentage", 2.5, 0, "3923.21.00", "000113803-1201", "", "", "", "",
    "St-1234 / BN-556/12", "L-10 x W-8 inch", 5000, 0.045, "pcs", 10, 8, 0.03],
  ["1", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
    "St-1234 / BN-556/13 (একই PI-র ২য় লাইন)", "L-12 x W-9 inch", 3000, 0.05, "pcs", 12, 9, 0.03],
  ["2", "Irish Garments", "2026-09-28", "", "", "", "", "", "Poly Bags", "USD", 107,
    "none", 0, 0, "3923.21.00", "000113803-1201", "", "", "", "",
    "St-9999", "L-14 x W-10 inch", 2000, 0.06, "pcs", "", "", ""],
];

export function buildPiImportTemplate(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("PI Import");
  ws.addRow([...PI_IMPORT_HEADERS]);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
  });
  EXAMPLE_ROWS.forEach((r) => ws.addRow(r));
  ws.columns.forEach((col) => { col.width = 16; });
  (ws.getColumn(21)).width = 26; // Description
  (ws.getColumn(1)).width = 10; // PI Group

  const help = wb.addWorksheet("নির্দেশনা");
  help.addRows([
    ["PI Group", "একই PI-র একাধিক লাইন হলে সবগুলোতে একই মান দিন (যেমন 1, 1, 2, 3, 3, 3)। প্রতি PI-র জন্য আলাদা মান।"],
    ["Customer Name", "অ্যাপে যে নামে Customer সেভ করা আছে হুবহু সেই নাম (বানান মিলতে হবে, ছোট/বড় হাতের অক্ষর সমস্যা না)। গ্রুপের ১ম row-এই দিন।"],
    ["PI Date / Valid Till", "YYYY-MM-DD ফরম্যাট। Valid Till ফাঁকা রাখলে PI Date + ২ মাস অটো বসবে।"],
    ["Currency", "USD / BDT / EUR — ফাঁকা রাখলে USD ধরা হবে।"],
    ["Discount Type", "none / percentage / fixed — ফাঁকা রাখলে none।"],
    ["Price Basis", "pcs / dzn — ফাঁকা রাখলে pcs।"],
    ["Tube Inch / Cutting Inch / Thickness Mm", "ঐচ্ছিক — তিনটাই দিলে ঐ লাইনের Weight অটো-ক্যালকুলেট হয়ে PI-র Total Weight-এ যোগ হবে। Total Weight Kg কলামে সরাসরি মান দিলে সেটাই প্রাধান্য পাবে।"],
    ["Header column-গুলো", "(PI Group থেকে Amount Notes পর্যন্ত) শুধু গ্রুপের প্রথম row-এ লাগবে, বাকি row-গুলোয় ফাঁকা রাখুন (উদাহরণ row ২ দেখুন)।"],
    ["Column অর্ডার", "বদলাবেন না — সিস্টেম পজিশন দিয়ে পড়ে, হেডার নাম দিয়ে না।"],
  ]);
  help.getColumn(1).width = 30;
  help.getColumn(2).width = 90;
  help.getColumn(1).font = { bold: true };

  return wb;
}

export async function downloadPiImportTemplate() {
  const wb = buildPiImportTemplate();
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "PI-Bulk-Import-Template.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type ParsedPiItem = {
  description: string; measurement: string; qtyPcs: number; priceUnit: number; priceBasis: "pcs" | "dzn";
  tubeInch: number | null; cuttingInch: number | null; thicknessMm: number | null;
  amount: number; weightKg: number;
};

export type ParsedPiGroup = {
  group: string;
  customerName: string; customerId: string | null;
  piDate: string; validTill: string;
  buyerName: string; merchantName: string;
  garmentsName: string; garmentsId: string | null; garmentsAddress: string;
  itemDescription: string; currency: string; exchangeRate: number;
  discountType: "none" | "percentage" | "fixed"; discountValue: number; adjustmentAmount: number;
  hsCode: string; binNo: string; totalWeightKgOverride: number | null;
  realAmount: number | null; commissionAmount: number | null; amountNotes: string;
  items: ParsedPiItem[];
  subtotal: number; discountAmount: number; totalAmount: number; autoWeightKg: number;
  errors: string[];
};

function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && v && "text" in (v as any)) return String((v as any).text ?? "").trim();
  return String(v).trim();
}
function cellNumber(v: unknown): number {
  const t = cellText(v);
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function addMonthsISO(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export async function parsePiImportFile(
  file: File,
  customers: { id: string; name: string }[],
  garments: { id: string; customer_id: string; name: string; address: string | null }[],
): Promise<{ groups: ParsedPiGroup[]; fileError: string | null }> {
  const wb = new ExcelJS.Workbook();
  const buf = await file.arrayBuffer();
  try {
    await wb.xlsx.load(buf);
  } catch {
    return { groups: [], fileError: "Excel ফাইল পড়া যায়নি — .xlsx ফরম্যাটে আছে কিনা দেখুন।" };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { groups: [], fileError: "কোনো শিট পাওয়া যায়নি।" };

  const groupsByKey = new Map<string, ParsedPiGroup>();
  const order: string[] = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const cells = Array.from({ length: 28 }, (_, i) => row.getCell(i + 1).value);
    const groupKey = cellText(cells[0]);
    const description = cellText(cells[20]);
    const qtyPcs = cellNumber(cells[22]);
    if (!groupKey || (!description && qtyPcs <= 0)) return; // ফাঁকা/সারাংশহীন row বাদ

    let g = groupsByKey.get(groupKey);
    if (!g) {
      const customerName = cellText(cells[1]);
      const customer = customers.find((c) => c.name.trim().toLowerCase() === customerName.toLowerCase());
      const garmentsName = cellText(cells[6]);
      const garment = garmentsName && customer
        ? garments.find((gm) => gm.customer_id === customer.id && gm.name.trim().toLowerCase() === garmentsName.toLowerCase())
        : undefined;
      const piDate = cellText(cells[2]) || new Date().toISOString().slice(0, 10);
      const errors: string[] = [];
      if (!customerName) errors.push("Customer Name ফাঁকা");
      else if (!customer) errors.push(`Customer "${customerName}" খুঁজে পাওয়া যায়নি`);
      if (!cellText(cells[2])) errors.push("PI Date ফাঁকা");

      const currency = cellText(cells[9]) || "USD";
      const discountTypeRaw = cellText(cells[11]).toLowerCase();
      const discountType: ParsedPiGroup["discountType"] =
        discountTypeRaw === "percentage" || discountTypeRaw === "fixed" ? discountTypeRaw : "none";

      g = {
        group: groupKey,
        customerName, customerId: customer?.id ?? null,
        piDate, validTill: cellText(cells[3]) || addMonthsISO(piDate, 2),
        buyerName: cellText(cells[4]), merchantName: cellText(cells[5]),
        garmentsName, garmentsId: garment?.id ?? null,
        garmentsAddress: cellText(cells[7]) || garment?.address || "",
        itemDescription: cellText(cells[8]) || "Poly Bags",
        currency, exchangeRate: cellNumber(cells[10]) || 107,
        discountType, discountValue: cellNumber(cells[12]),
        adjustmentAmount: cellNumber(cells[13]),
        hsCode: cellText(cells[14]) || "3923.21.00", binNo: cellText(cells[15]) || "000113803-1201",
        totalWeightKgOverride: cellText(cells[16]) ? cellNumber(cells[16]) : null,
        realAmount: cellText(cells[17]) ? cellNumber(cells[17]) : null,
        commissionAmount: cellText(cells[18]) ? cellNumber(cells[18]) : null,
        amountNotes: cellText(cells[19]),
        items: [], subtotal: 0, discountAmount: 0, totalAmount: 0, autoWeightKg: 0,
        errors,
      };
      groupsByKey.set(groupKey, g);
      order.push(groupKey);
    }

    const priceBasisRaw = cellText(cells[24]).toLowerCase();
    const priceBasis: "pcs" | "dzn" = priceBasisRaw === "dzn" ? "dzn" : "pcs";
    const priceUnit = cellNumber(cells[23]);
    const amount = Math.round((priceBasis === "dzn" ? (qtyPcs / 12) * priceUnit : qtyPcs * priceUnit) * 100) / 100;
    const tubeInch = cellText(cells[25]) ? cellNumber(cells[25]) : null;
    const cuttingInch = cellText(cells[26]) ? cellNumber(cells[26]) : null;
    const thicknessMm = cellText(cells[27]) ? cellNumber(cells[27]) : null;
    const weightKg = tubeInch && cuttingInch && thicknessMm
      ? (qtyPcs * tubeInch * cuttingInch * thicknessMm) / 75000 / 2.2 : 0;

    if (!description) g.errors.push(`row ${rowNumber}: Description ফাঁকা`);
    if (qtyPcs <= 0) g.errors.push(`row ${rowNumber}: Qty Pcs শূন্য/ফাঁকা`);
    if (priceUnit <= 0) g.errors.push(`row ${rowNumber}: Price Unit শূন্য/ফাঁকা`);

    g.items.push({
      description, measurement: cellText(cells[21]), qtyPcs, priceUnit, priceBasis,
      tubeInch, cuttingInch, thicknessMm, amount, weightKg,
    });
  });

  const groups = order.map((k) => {
    const g = groupsByKey.get(k)!;
    g.subtotal = g.items.reduce((s, it) => s + it.amount, 0);
    g.discountAmount = g.discountType === "percentage" ? (g.subtotal * g.discountValue) / 100
      : g.discountType === "fixed" ? g.discountValue : 0;
    g.totalAmount = Math.max(g.subtotal - g.discountAmount + g.adjustmentAmount, 0);
    g.autoWeightKg = g.items.reduce((s, it) => s + it.weightKg, 0);
    if (g.items.length === 0) g.errors.push("অন্তত একটা লাইন আইটেম দরকার");
    return g;
  });

  return { groups, fileError: null };
}
