import ExcelJS from "exceljs";
import type { ParsedPiGroup, ParsedPiItem } from "./piBulkImport";

// বাস্তব/ঐতিহাসিক PI Excel ফাইল (F&J-এর নিজস্ব পুরনো টেমপ্লেট — company header, INVOICE NO./
// Date, BUYER ব্লক (=Garments), "Buyer: -X" লাইন (=buyer_name), ADVISING BANK, item table
// Sl No/Description/Measurement/Qty(Pcs)/Qty(Dzn)/Price/Total Amt, Tube/Cutting/Thickness
// হেল্পার কলাম, Total/SAY/H.S CODE/BIN/টার্মস) সরাসরি পড়ে একটা PI বানানোর জন্য যা লাগে তা বের
// করে — position-fixed না, লেবেল/anchor খুঁজে (রিয়েল ফাইলে address-এর লাইনসংখ্যা, হেডার-রো
// পজিশন, extra কলাম ইত্যাদি ফাইলভেদে বদলায়, যেমন E:\...\PI-NCL-653-Miles.xlsx-এ দেখা গেছে)।
// আউটপুট ParsedPiGroup-এর মতোই শেপ — bulk-import-এর insertPiGroup() দিয়েই সেভ হয় — কিন্তু
// customerId/অনেক কিছু ভুল/null হতে পারে বলে এটা সরাসরি insert না করে একটা এডিটেবল রিভিউ
// ফর্মে (UploadPiForm.tsx) প্রিফিল হয়, ইউজার চেক করে দরকারে ঠিক করে তারপর সাবমিট করে।

type Cell = { row: number; col: number; text: string };

function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && v) {
    const o = v as any;
    if ("richText" in o) return (o.richText as any[]).map((r) => r.text ?? "").join("").trim();
    if ("result" in o) return cellText(o.result);
    if ("text" in o) return String(o.text ?? "").trim();
    if ("formula" in o) return "";
  }
  return String(v).trim();
}
function cellNumber(v: unknown): number {
  const t = cellText(v).replace(/,/g, "");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function parseLooseDate(text: string): string | null {
  const t = text.trim();
  let m = t.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})/); // DD.MM.YYYY
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  m = t.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/); // YYYY-MM-DD
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function addMonthsISO(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]/g, "");
}

export type SmartParsedPi = ParsedPiGroup & {
  sourceFileName: string; sourcePiNoRaw: string; warnings: string[];
  advisingBankName: string; advisingBankBranch: string; advisingBankAddress: string; advisingBankSwift: string;
};

export async function parsePiDocument(
  file: File,
  customers: { id: string; name: string }[],
): Promise<{ result: SmartParsedPi | null; fileError: string | null }> {
  const wb = new ExcelJS.Workbook();
  const buf = await file.arrayBuffer();
  try {
    await wb.xlsx.load(buf);
  } catch {
    return { result: null, fileError: "Excel ফাইল পড়া যায়নি — .xlsx ফরম্যাটে আছে কিনা দেখুন।" };
  }
  // ফাইলে একাধিক শিট থাকতে পারে (পুরনো PI-র কপি রয়ে যায় অনেক সময়) — শেষেরটাই সবচেয়ে
  // হালনাগাদ, এটাই ধরা হয়।
  const ws = wb.worksheets[wb.worksheets.length - 1];
  if (!ws) return { result: null, fileError: "কোনো শিট পাওয়া যায়নি।" };

  const cells: Cell[] = [];
  ws.eachRow((row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = cellText(cell.value);
      if (text) cells.push({ row: rowNumber, col: colNumber, text });
    });
  });
  const cellAt = (row: number, col: number) => cells.find((c) => c.row === row && c.col === col)?.text ?? "";
  const find = (re: RegExp) => cells.find((c) => re.test(c.text));
  const findAll = (re: RegExp) => cells.filter((c) => re.test(c.text));

  const warnings: string[] = [];

  // ---- Header table row (Sl No + Description একই row-এ) ----
  const slNoCells = findAll(/^sl\s*no\.?$/i);
  let headerRow: number | null = null;
  let headerCells: Cell[] = [];
  for (const c of slNoCells) {
    const rowCells = cells.filter((x) => x.row === c.row);
    if (rowCells.some((x) => /^description$/i.test(x.text))) { headerRow = c.row; headerCells = rowCells; break; }
  }
  if (headerRow == null) {
    return { result: null, fileError: "আইটেম টেবিলের হেডার (Sl No/Description) খুঁজে পাওয়া যায়নি — এই ফাইলের লেআউট চেনা টেমপ্লেটের মতো না।" };
  }

  function headerCol(re: RegExp, pick: "first" | "last" = "first"): number | null {
    const matches = headerCells.filter((c) => re.test(c.text)).sort((a, b) => a.col - b.col);
    if (matches.length === 0) return null;
    return pick === "last" ? matches[matches.length - 1].col : matches[0].col;
  }
  const descCol = headerCol(/^description$/i);
  const measCol = headerCol(/measurement/i);
  const qtyPcsCol = headerCol(/qty.*pcs|pcs.*qty/i);
  const priceCol = headerCol(/^\s*price\s*\/?\(?(dzn|doz|pcs?)\)?/i, "first");
  const tubeCols = headerCells.filter((c) => /^tube/i.test(c.text)).sort((a, b) => a.col - b.col);
  const cuttingCols = headerCells.filter((c) => /^cutting/i.test(c.text)).sort((a, b) => a.col - b.col);
  const thicknessCol = headerCol(/thi[ck]*ness/i);
  const priceIsDzn = priceCol != null && /dzn|doz/i.test(cellAt(headerRow, priceCol));

  if (descCol == null || qtyPcsCol == null || priceCol == null) {
    return { result: null, fileError: "আইটেম টেবিলের Description/Qty(Pcs)/Price কলাম চিনতে পারিনি।" };
  }

  // ---- Item rows: headerRow-এর পরের row থেকে, "Total"/blank রো না পাওয়া পর্যন্ত ----
  const items: ParsedPiItem[] = [];
  let blankStreak = 0;
  for (let r = headerRow + 1; r <= headerRow + 60 && blankStreak < 3; r++) {
    const firstColText = cellAt(r, 1);
    if (/^total\s*=?$/i.test(firstColText)) break;
    const description = cellAt(r, descCol);
    const qtyPcs = cellNumber(cellAt(r, qtyPcsCol));
    if (!description && qtyPcs <= 0) { blankStreak++; continue; }
    blankStreak = 0;

    const priceUnit = cellNumber(cellAt(r, priceCol));
    const priceBasis: "pcs" | "dzn" = priceIsDzn ? "dzn" : "pcs";
    const amount = Math.round((priceBasis === "dzn" ? (qtyPcs / 12) * priceUnit : qtyPcs * priceUnit) * 100) / 100;

    let tubeInch: number | null = null;
    if (tubeCols.length >= 2) { const cm = cellNumber(cellAt(r, tubeCols[0].col)); tubeInch = cm > 0 ? cm / 2.54 : null; }
    else if (tubeCols.length === 1) { const v = cellNumber(cellAt(r, tubeCols[0].col)); tubeInch = v > 0 ? v : null; }
    let cuttingInch: number | null = null;
    if (cuttingCols.length >= 2) { const cm = cellNumber(cellAt(r, cuttingCols[0].col)); cuttingInch = cm > 0 ? cm / 2.54 : null; }
    else if (cuttingCols.length === 1) { const v = cellNumber(cellAt(r, cuttingCols[0].col)); cuttingInch = v > 0 ? v : null; }
    const thicknessMm = thicknessCol != null ? (cellNumber(cellAt(r, thicknessCol)) || null) : null;
    const weightKg = tubeInch && cuttingInch && thicknessMm
      ? (qtyPcs * tubeInch * cuttingInch * thicknessMm) / 75000 / 2.2 : 0;

    items.push({
      description, measurement: measCol != null ? cellAt(r, measCol) : "",
      qtyPcs, priceUnit, priceBasis, tubeInch, cuttingInch, thicknessMm, amount, weightKg,
    });
  }
  if (items.length === 0) warnings.push("কোনো লাইন আইটেম পার্স করতে পারিনি — নিচে ফর্মে ম্যানুয়ালি যোগ করুন।");

  // ---- Header fields (anchor-based, সারা শিট জুড়ে খোঁজা) ----
  const invoiceNoCell = find(/invoice\s*no\.?\s*.+/i);
  const sourcePiNoRaw = invoiceNoCell ? (invoiceNoCell.text.match(/invoice\s*no\.?\s*(.+)/i)?.[1] ?? "").trim() : "";

  const dateCell = find(/^date\s*:?\s*.+/i);
  const piDate = dateCell ? (parseLooseDate(dateCell.text.replace(/^date\s*:?/i, "")) ?? new Date().toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10);
  if (!dateCell) warnings.push("PI Date খুঁজে পাওয়া যায়নি — আজকের তারিখ বসানো হয়েছে, চেক করুন।");

  // "BUYER" লেবেল (একা, colon ছাড়া) → এর নিচে কয়েক লাইন = আমাদের schema-র Garments (TO block)
  const buyerLabelCell = cells.find((c) => /^buyer$/i.test(c.text));
  let garmentsName = "", garmentsAddress = "";
  if (buyerLabelCell) {
    const lines: string[] = [];
    for (let r = buyerLabelCell.row + 1; r <= buyerLabelCell.row + 5; r++) {
      const t = cellAt(r, buyerLabelCell.col);
      if (!t || /^buyer\s*:/i.test(t) || /^item\s*:-?/i.test(t)) break;
      lines.push(t);
    }
    garmentsName = lines[0] ?? "";
    garmentsAddress = lines.slice(1).map((l) => l.replace(/,\s*$/, "")).join(", ");
  } else {
    warnings.push('"BUYER" ব্লক (Garments/TO তথ্য) খুঁজে পাওয়া যায়নি।');
  }

  // "Buyer: -X" লাইন → আমাদের schema-র buyer_name (export buyer, যেমন H&M/GP/Miles)
  const buyerNameCell = find(/^buyer\s*:\s*-?\s*.+/i);
  const buyerName = buyerNameCell ? (buyerNameCell.text.match(/^buyer\s*:\s*-?\s*(.+)/i)?.[1] ?? "").trim() : "";

  const itemDescCell = find(/^item\s*:-?\s*.+/i);
  const itemDescription = itemDescCell ? (itemDescCell.text.match(/^item\s*:-?\s*(.+)/i)?.[1] ?? "").trim() : "Poly Bags";

  const advisingLabelCell = cells.find((c) => /advising\s*bank/i.test(c.text));
  let advisingBankName = "", advisingBankBranch = "", advisingBankAddress = "", advisingBankSwift = "";
  if (advisingLabelCell) {
    const lines: string[] = [];
    for (let r = advisingLabelCell.row + 1; r <= advisingLabelCell.row + 6; r++) {
      const t = cellAt(r, advisingLabelCell.col);
      if (!t) break;
      lines.push(t);
    }
    const swiftLine = lines.find((l) => /swift/i.test(l));
    advisingBankSwift = swiftLine ? (swiftLine.match(/swift\s*:?\s*[-–]?\s*(.+)/i)?.[1] ?? "").trim() : "";
    const rest = lines.filter((l) => l !== swiftLine);
    advisingBankName = rest[0] ?? "";
    advisingBankBranch = rest[1] ?? "";
    advisingBankAddress = rest.slice(2).join(", ");
  }

  const rateCell = find(/\$\s*1\s*=\s*bdt\s*[\d.]+/i);
  const exchangeRate = rateCell ? cellNumber(rateCell.text.match(/bdt\s*([\d.]+)/i)?.[1] ?? "") || 107 : 107;

  const usdHeaderCell = headerCells.find((c) => /total\s*amt/i.test(c.text));
  const currencyMatch = usdHeaderCell?.text.match(/\(([A-Z]{3})\)/);
  const currency = currencyMatch ? currencyMatch[1] : "USD";

  const hsCell = find(/h\.?\s*s\.?\s*code\s*no\.?\s*:?\s*.+/i);
  const hsCode = hsCell ? (hsCell.text.match(/h\.?\s*s\.?\s*code\s*no\.?\s*:?\s*(.+)/i)?.[1] ?? "").trim() || "3923.21.00" : "3923.21.00";
  const binCell = find(/bin\s*no\.?\s*:?\s*.+/i);
  const binNo = binCell ? (binCell.text.match(/bin\s*no\.?\s*:?\s*(.+)/i)?.[1] ?? "").trim() || "000113803-1201" : "000113803-1201";

  const termLines = findAll(/^\d{2}\)/).sort((a, b) => a.row - b.row).map((c) => c.text);
  const termsConditions = termLines.join("\n");
  let validTill = addMonthsISO(piDate, 2);
  const validTillLine = termLines.find((l) => /valid/i.test(l));
  if (validTillLine) {
    const d = parseLooseDate(validTillLine);
    if (d) validTill = d;
  }

  const discountCell = find(/discount/i);
  let discountType: "none" | "percentage" | "fixed" = "none";
  let discountValue = 0;
  if (discountCell) {
    const pctMatch = discountCell.text.match(/discount.*?([\d.]+)\s*%/i);
    if (pctMatch) { discountType = "percentage"; discountValue = parseFloat(pctMatch[1]) || 0; }
  }

  const subtotal = items.reduce((s, it) => s + it.amount, 0);
  const dt = discountType as ParsedPiGroup["discountType"];
  const discountAmount = dt === "percentage" ? (subtotal * discountValue) / 100 : dt === "fixed" ? discountValue : 0;
  const totalAmount = Math.max(subtotal - discountAmount, 0);
  const autoWeightKg = items.reduce((s, it) => s + it.weightKg, 0);

  // ---- Customer matching (fuzzy — real customer master data নামের সাথে হুবহু মিলবে না প্রায়ই) ----
  const normGarments = normalizeName(garmentsName);
  const customerMatch = normGarments
    ? customers.find((c) => {
        const nc = normalizeName(c.name);
        return nc.length > 2 && (normGarments.includes(nc) || nc.includes(normGarments));
      })
    : undefined;
  if (!customerMatch) warnings.push(`Customer "${garmentsName || "(পাওয়া যায়নি)"}" ডেটাবেজের কোনো Customer-এর সাথে মিলাতে পারিনি — নিচে ম্যানুয়ালি বাছুন।`);

  const errors: string[] = [];
  if (!customerMatch) errors.push("Customer বাছাই করুন");
  if (items.length === 0) errors.push("অন্তত একটা লাইন আইটেম দরকার");

  const result: SmartParsedPi = {
    group: "1",
    customerName: garmentsName, customerId: customerMatch?.id ?? null,
    piDate, validTill,
    buyerName, merchantName: "",
    garmentsName, garmentsId: null, garmentsAddress,
    itemDescription, currency, exchangeRate,
    discountType, discountValue, adjustmentAmount: 0,
    hsCode, binNo, totalWeightKgOverride: null,
    realAmount: null, commissionAmount: null,
    amountNotes: sourcePiNoRaw ? `Source: ${sourcePiNoRaw} (${file.name})` : `Source file: ${file.name}`,
    items, subtotal, discountAmount, totalAmount, autoWeightKg,
    errors,
    sourceFileName: file.name, sourcePiNoRaw, warnings,
    advisingBankName, advisingBankBranch, advisingBankAddress, advisingBankSwift,
  };

  return { result, fileError: null };
}
