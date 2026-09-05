"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { toInches, hasAdhesiveCharge } from "@/lib/calcTubeCutting";
import { postBookingConsumptionJv } from "@/lib/inventoryCost";
import { getCurrentUserId } from "@/lib/currentUser";
import { resolveRate, type RateHistoryRow } from "@/lib/rateHistory";
import { money, qty as qtyFmt } from "@/lib/format";

type Customer = { id: string; name: string; address: string | null; default_print_rate: number | null; default_adhesive_rate: number | null; price_per_lbs: number | null };
type PriceHistoryRow = RateHistoryRow & { customer_id: string };
type Warehouse = { id: string; name: string };
type Material = { id: string; material_name: string };
type CustomLine = { material_id: string; percentage: string };
// simple:      Tube = W,               Cutting = L
// adhesive:    Tube = L + F/2,         Cutting = W
// gusset:      Tube = W + G + G,       Cutting = L
// flap_gusset: Tube = L + F/2 + G,     Cutting = W  (Gusset পুরোটাই, Flap-এর মতো অর্ধেক নয়)
// pillow:      Tube = L + P,           Cutting = W
type MeasurementType = "simple" | "adhesive" | "gusset" | "flap_gusset" | "pillow";
type Unit = "cm" | "inch";
type MaterialTypeVal = "pe_standard" | "pe_rld" | "pp" | "custom";

const MEASUREMENT_TYPE_LABELS: Record<MeasurementType, string> = {
  simple: "Simple (L x W)",
  adhesive: "Adhesive (L + F x W)",
  gusset: "Gusset (L x W + G + G)",
  flap_gusset: "Flap Gusset (L + F + G x W)",
  pillow: "Pillow (L + P x W)",
};

type PendingItem = {
  style: string;
  customerBookingRef: string;
  poNo: string;
  printLayoutNote: string;
  printLayoutFileUrl: string;
  productDetails: string;
  measurementType: MeasurementType;
  unit: Unit;
  lengthVal: number;
  widthVal: number;
  flapVal: number;
  gussetVal: number;
  pillowVal: number;
  thicknessMm: number;
  productionThicknessMm: number;
  piThicknessMm: number;
  materialType: MaterialTypeVal;
  quantity: number;
  warehouseId: string;
  warehouseName: string;
  finalLbs: number;
  hasPrint: boolean;
  printColors: number;
  ratePerColor: number;
  ratePerInch: number;
  kg: number;
  bags: number;
  materialsNeeded: { name: string; qty: number }[];
  lengthCm: number;
  widthCm: number;
  unitPrice: number;
  amount: number;
};

const LBS_PER_BAG = 55;
const CM_PER_INCH = 2.54;

const BASELINE_ROW_SEED: RowDefaults = {
  productDetails: "", measurementType: "simple", unit: "cm",
  thicknessMm: "", productionThicknessMm: "", piThicknessMm: "",
  hasPrint: false, printColors: "", ratePerColor: "0.20", ratePerInch: "0.02",
};

type BuyerMaster = {
  id: string;
  customer_id: string;
  name: string;
  booking_thickness_mm: number | null;
  production_thickness_mm: number | null;
  pi_thickness_mm: number | null;
  print_colors_default: number | null;
  adhesive_rate_per_inch: number | null;
};
type GarmentMaster = { id: string; customer_id: string; name: string; address: string | null };
type MerchantMaster = { id: string; name: string };

// একই স্টাইলে একাধিক মাপ (measurement) — কাস্টমারের বুকিং শীটে যেমন একটা স্টাইলে অনেকগুলো
// Size/Qty থাকে, তেমন একটা row। Thickness/Unit/Print/Adhesive প্রতিটা Row-এ আলাদা হতে
// পারে (একই স্টাইলের ভেতরেও ভিন্ন সাইজে ভিন্ন গজ/প্রিন্ট/এডহিসিভ চার্জ লাগতে পারে) — তাই এগুলো
// Style-level নয়, Row-level ফিল্ড। নতুন Row (+ Row / Bulk Paste) শুরু হয় শেষ Row-এর এই
// মানগুলো কপি করে (দেখুন nextRowSeed) — এরপর প্রতিটা Row-এ আলাদাভাবে বদলানো যায়।
type MeasurementRow = {
  rowId: string;
  productDetails: string;
  measurementType: MeasurementType;
  unit: Unit;
  lengthVal: string;
  widthVal: string;
  flapVal: string;
  gussetVal: string;
  pillowVal: string;
  quantity: string;
  thicknessMm: string;
  productionThicknessMm: string;
  piThicknessMm: string;
  hasPrint: boolean;
  printColors: string;
  ratePerColor: string;
  ratePerInch: string;
};

type RowDefaults = {
  productDetails: string;
  measurementType: MeasurementType;
  unit: Unit;
  thicknessMm: string;
  productionThicknessMm: string;
  piThicknessMm: string;
  hasPrint: boolean;
  printColors: string;
  ratePerColor: string;
  ratePerInch: string;
};

function makeEmptyRow(defaults: RowDefaults): MeasurementRow {
  return {
    rowId: crypto.randomUUID(),
    productDetails: defaults.productDetails,
    measurementType: defaults.measurementType,
    unit: defaults.unit,
    lengthVal: "",
    widthVal: "",
    flapVal: "",
    gussetVal: "",
    pillowVal: "",
    quantity: "",
    thicknessMm: defaults.thicknessMm,
    productionThicknessMm: defaults.productionThicknessMm,
    piThicknessMm: defaults.piThicknessMm,
    hasPrint: defaults.hasPrint,
    printColors: defaults.printColors,
    ratePerColor: defaults.ratePerColor,
    ratePerInch: defaults.ratePerInch,
  };
}

// Bulk Paste পার্সিং — কাস্টমারের শীটে যেমন থাকে (Description | Size | Qty) সেভাবে
// একাধিক লাইন পেস্ট করলে সব measurement row একসাথে বানিয়ে দেয় (বাকি ফিল্ড শেষ Row থেকে কপি হয়)।
//   "105x68"        → Simple:      L=105, W=68
//   "40+5x28"       → Adhesive:    L=40, Flap=5, W=28
//   "105x68x8"      → Gusset:      L=105, W=68, Gusset=8
//   "40+5+4x28"     → Flap Gusset: L=40, Flap=5, Gusset=4, W=28
// (Pillow-এর শেপ Adhesive-এর মতোই একই সংখ্যার প্যাটার্ন — তাই Bulk Paste থেকে আলাদা করা
// যায় না, Pillow Row ম্যানুয়ালি Type বদলে/যোগ করে দিতে হবে।)
function normalizeSizeToken(raw: string): string {
  return raw
    .replace(/×/g, "x")
    .replace(/\b(cm|inch|in|pcs?|pc)\b/gi, "")
    .replace(/\s+/g, "")
    .trim();
}

type ParsedSize = { measurementType: MeasurementType; lengthVal: number; widthVal: number; flapVal: number; gussetVal: number };

function parseSizeToken(raw: string): ParsedSize | null {
  const s = normalizeSizeToken(raw);
  // Flap Gusset: L+F+GxW (x-এর আগে দুইটা +)
  let m = s.match(/^(\d+(?:\.\d+)?)\+(\d+(?:\.\d+)?)\+(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i);
  if (m) return { measurementType: "flap_gusset", lengthVal: parseFloat(m[1]), flapVal: parseFloat(m[2]), gussetVal: parseFloat(m[3]), widthVal: parseFloat(m[4]) };
  // Adhesive: L+FxW (x-এর আগে একটা +)
  m = s.match(/^(\d+(?:\.\d+)?)\+(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i);
  if (m) return { measurementType: "adhesive", lengthVal: parseFloat(m[1]), flapVal: parseFloat(m[2]), widthVal: parseFloat(m[3]), gussetVal: 0 };
  // Gusset: LxWxG (তিনটা x-separated সংখ্যা, কোনো + নেই)
  m = s.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i);
  if (m) return { measurementType: "gusset", lengthVal: parseFloat(m[1]), widthVal: parseFloat(m[2]), gussetVal: parseFloat(m[3]), flapVal: 0 };
  // Simple: LxW
  m = s.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i);
  if (m) return { measurementType: "simple", lengthVal: parseFloat(m[1]), widthVal: parseFloat(m[2]), flapVal: 0, gussetVal: 0 };
  return null;
}

type BulkParseResult = { ok: true; row: MeasurementRow } | { ok: false; error: string };

function parseBulkPasteLine(line: string, defaults: RowDefaults): BulkParseResult {
  const parts = line.includes("\t")
    ? line.split("\t").map((p) => p.trim()).filter((p) => p !== "")
    : line.split("|").map((p) => p.trim()).filter((p) => p !== "");

  let desc = defaults.productDetails;
  let sizeStr: string;
  let qtyStr: string;
  if (parts.length >= 3) {
    desc = parts[0];
    sizeStr = parts[1];
    qtyStr = parts[2];
  } else if (parts.length === 2) {
    sizeStr = parts[0];
    qtyStr = parts[1];
  } else {
    return { ok: false, error: `"${line}" — বুঝতে পারিনি (Description | Size | Qty ফরম্যাটে দিন)` };
  }

  const parsedSize = parseSizeToken(sizeStr);
  if (!parsedSize) {
    return { ok: false, error: `"${line}" — Size (${sizeStr}) বুঝতে পারিনি` };
  }
  const quantity = parseFloat(qtyStr.replace(/,/g, ""));
  if (!quantity || quantity <= 0) {
    return { ok: false, error: `"${line}" — Qty (${qtyStr}) সংখ্যা নয়` };
  }

  return {
    ok: true,
    row: {
      ...makeEmptyRow(defaults),
      productDetails: desc,
      measurementType: parsedSize.measurementType,
      lengthVal: String(parsedSize.lengthVal),
      widthVal: String(parsedSize.widthVal),
      flapVal: parsedSize.flapVal ? String(parsedSize.flapVal) : "",
      gussetVal: parsedSize.gussetVal ? String(parsedSize.gussetVal) : "",
      quantity: String(quantity),
    },
  };
}

export default function BookingForm({
  customers, warehouses, materials, buyersMaster, garmentsMaster, merchantsMaster, priceHistory,
}: {
  customers: Customer[]; warehouses: Warehouse[]; materials: Material[];
  buyersMaster: BuyerMaster[]; garmentsMaster: GarmentMaster[]; merchantsMaster: MerchantMaster[]; priceHistory: PriceHistoryRow[];
}) {
  // পুরো বুকিং-এর জন্য কমন (একবার দিলেই সব স্টাইলে থাকবে)
  const [customerId, setCustomerId] = useState("");
  const [customerNameInput, setCustomerNameInput] = useState("");
  const [garmentsId, setGarmentsId] = useState("");
  const [garmentsNameInput, setGarmentsNameInput] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [buyerNameInput, setBuyerNameInput] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [merchantNameInput, setMerchantNameInput] = useState("");
  const [priceOverride, setPriceOverride] = useState("");
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryPoint, setDeliveryPoint] = useState("");

  // Style Info — এক স্টাইলের সব মাপের জন্য কমন। "এই স্টাইল বুকিং-এ যোগ করুন" চাপলে রিসেট হবে।
  const [style, setStyle] = useState("");
  const [customerBookingRef, setCustomerBookingRef] = useState("");
  const [poNo, setPoNo] = useState("");
  const [materialType, setMaterialType] = useState<MaterialTypeVal>("pe_standard");
  const [customLines, setCustomLines] = useState<CustomLine[]>([
    { material_id: "", percentage: "" },
    { material_id: "", percentage: "" },
  ]);
  const [warehouseId, setWarehouseId] = useState("");

  // Print Layout Note/File — Style Info-র অংশ, কিন্তু "স্টাইল যোগ করুন"-এ রিসেট হয় না
  // (দেখুন resetStyleFields) — তাই একই বুকিং-এর সব Style-এ একই লেআউট থাকলে একবার আপলোড
  // করলেই চলে, আবার কোনো Style-এ আলাদা লেআউট লাগলে সেটা বদলে/নতুন আপলোড করে দেওয়া যায়।
  const [printLayoutNote, setPrintLayoutNote] = useState("");
  const [printLayoutFileUrl, setPrintLayoutFileUrl] = useState("");
  const [printLayoutFileName, setPrintLayoutFileName] = useState("");
  const [uploadingLayout, setUploadingLayout] = useState(false);
  const [layoutUploadError, setLayoutUploadError] = useState("");

  async function handleLayoutFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) {
      setLayoutUploadError("শুধু ছবি (JPG/PNG/WEBP) অথবা PDF আপলোড করা যাবে।");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setLayoutUploadError("ফাইল সাইজ ৮ MB-এর বেশি হতে পারবে না।");
      return;
    }

    setLayoutUploadError("");
    setUploadingLayout(true);

    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("print-layouts").upload(path, file, { contentType: file.type });

    if (uploadError) {
      setUploadingLayout(false);
      setLayoutUploadError(`আপলোড ব্যর্থ হয়েছে: ${uploadError.message}`);
      return;
    }

    const { data } = supabase.storage.from("print-layouts").getPublicUrl(path);
    setPrintLayoutFileUrl(data.publicUrl);
    setPrintLayoutFileName(file.name);
    setUploadingLayout(false);
  }

  function removeLayoutFile() {
    setPrintLayoutFileUrl("");
    setPrintLayoutFileName("");
  }

  // এই স্টাইলের Measurement Row-গুলো (একাধিক সাইজ)। আলাদা "Row Defaults"/"Default Product
  // Details" প্যানেল নেই — নতুন Row (+ Row / Bulk Paste) সবসময় শেষ Row-এর Description/Type/
  // Unit/Thickness/Print/Adhesive কপি করে শুরু হয়, তাই বারবার একই জিনিস টাইপ করতে হয় না,
  // কিন্তু যেকোনো Row-এই আলাদা করে বদলানো যায়।
  function nextRowSeed(currentRows: MeasurementRow[]): RowDefaults {
    const last = currentRows[currentRows.length - 1];
    return last ? { ...last } : BASELINE_ROW_SEED;
  }

  const [rows, setRows] = useState<MeasurementRow[]>([makeEmptyRow(BASELINE_ROW_SEED)]);
  const [bulkPasteText, setBulkPasteText] = useState("");
  const [bulkPasteErrors, setBulkPasteErrors] = useState<string[]>([]);

  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [customersList, setCustomersList] = useState(customers);
  const [buyersList, setBuyersList] = useState(buyersMaster);
  const [garmentsList, setGarmentsList] = useState(garmentsMaster);
  const [merchantsList, setMerchantsList] = useState(merchantsMaster);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function updateCustomLine(i: number, field: keyof CustomLine, value: string) {
    setCustomLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  }
  function addCustomLine() {
    setCustomLines((prev) => [...prev, { material_id: "", percentage: "" }]);
  }
  function removeCustomLine(i: number) {
    setCustomLines((prev) => prev.filter((_, idx) => idx !== i));
  }
  const customTotalPercent = customLines.reduce((s, l) => s + (parseFloat(l.percentage) || 0), 0);

  // Price/Pc হিসাব — Sales Invoice ঠিক যেভাবে করে সেভাবেই (customer price_per_lbs + rate_history,
  // booking_date ধরে effective rate বের করে)। priceOverride দিলে সেটাই প্রাধান্য পাবে।
  const selectedCustomer = customersList.find((c) => c.id === customerId);
  const historyForCustomer = priceHistory.filter((h) => h.customer_id === customerId);
  const resolvedPricePerLbs = resolveRate(historyForCustomer, bookingDate, selectedCustomer?.price_per_lbs ?? 0);
  const pricePerLbs = parseFloat(priceOverride) || resolvedPricePerLbs;

  function updateRow(rowId: string, field: keyof MeasurementRow, value: string | boolean) {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, [field]: value } : r)));
  }

  // Measurement Row-এর ইনপুটে Enter চাপলে ফর্ম সাবমিট না হয়ে (ডিফল্ট আচরণ) পরের ইনপুটে কার্সর
  // চলে যায় — এক্সেলের মতো টাইপ করে Enter, টাইপ করে Enter করে দ্রুত সব Row পূরণ করা যায়।
  function focusNextOnEnter(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const form = (e.currentTarget as HTMLElement).closest("form");
    if (!form) return;
    const focusable = Array.from(
      form.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([type="file"]), select, textarea')
    ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1 && el.offsetParent !== null);
    const idx = focusable.indexOf(e.currentTarget as HTMLElement);
    if (idx >= 0 && idx < focusable.length - 1) {
      const next = focusable[idx + 1];
      next.focus();
      if (next instanceof HTMLInputElement && next.type !== "checkbox") next.select();
    }
  }

  // Measurement Row-এর ভেতরের ইনপুটে Enter — শুধু Row-গুলোর মধ্যেই খোঁজে (Bulk Paste-এর
  // textarea এই স্কোপের বাইরে, তাই ওখানে কখনো চলে যাবে না), শেষ Row-এর শেষ ইনপুটে থাকলে
  // "+ Row যোগ করুন" বাটনে ফোকাস চলে যায়।
  const measurementRowsRef = useRef<HTMLDivElement>(null);
  const addRowBtnRef = useRef<HTMLButtonElement>(null);
  function focusNextRowFieldOrAddButton(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const container = measurementRowsRef.current;
    if (!container) return;
    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([type="file"]), select')
    ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1 && el.offsetParent !== null);
    const idx = focusable.indexOf(e.currentTarget as HTMLElement);
    if (idx >= 0 && idx < focusable.length - 1) {
      const next = focusable[idx + 1];
      next.focus();
      if (next instanceof HTMLInputElement && next.type !== "checkbox") next.select();
    } else {
      addRowBtnRef.current?.focus();
    }
  }

  function addEmptyRow() {
    setRows((prev) => [...prev, makeEmptyRow(nextRowSeed(prev))]);
  }
  function removeRow(rowId: string) {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  }

  function handleParseBulkPaste() {
    const lines = bulkPasteText.split("\n").map((l) => l.trim()).filter((l) => l !== "");
    if (lines.length === 0) return;

    const defaults = nextRowSeed(rows);
    const newRows: MeasurementRow[] = [];
    const errors: string[] = [];
    lines.forEach((line, idx) => {
      const result = parseBulkPasteLine(line, defaults);
      if (result.ok) newRows.push(result.row);
      else errors.push(`লাইন ${idx + 1}: ${result.error}`);
    });

    if (newRows.length > 0) {
      setRows((prev) => {
        const isSingleEmptyRow = prev.length === 1 && !prev[0].lengthVal && !prev[0].widthVal && !prev[0].quantity;
        return isSingleEmptyRow ? newRows : [...prev, ...newRows];
      });
      setBulkPasteText("");
    }
    setBulkPasteErrors(errors);
  }

  // একটা row-এর Tube/Cutting/Required Lbs/Price/Material split হিসাব — সব ইনপুট এই row থেকেই আসে
  function computeRowCalc(row: MeasurementRow) {
    const L = parseFloat(row.lengthVal) || 0;
    const W = parseFloat(row.widthVal) || 0;
    const F = parseFloat(row.flapVal) || 0;
    const G = parseFloat(row.gussetVal) || 0;
    const P = parseFloat(row.pillowVal) || 0;
    const qtyN = parseFloat(row.quantity) || 0;
    const T = parseFloat(row.thicknessMm) || 0;
    const PT = parseFloat(row.productionThicknessMm) || 0;

    let tube = 0, cutting = 0;
    if (row.measurementType === "simple") { tube = W; cutting = L; }
    else if (row.measurementType === "adhesive") { tube = L + F / 2; cutting = W; }
    else if (row.measurementType === "gusset") { tube = W + G + G; cutting = L; }
    else if (row.measurementType === "flap_gusset") { tube = L + F / 2 + G; cutting = W; }
    else { tube = L + P; cutting = W; } // pillow

    if (!qtyN || !tube || !cutting || !T || !PT) return null;

    const { tubeInch, cuttingInch } = toInches(tube, cutting, row.unit, materialType, row.hasPrint);
    const baseLbs = (qtyN * tubeInch * cuttingInch * PT) / 75000;
    const finalLbs = Math.ceil(baseLbs);

    let lldpe = 0, ldpe = 0, pp = 0, rld = 0;
    let customSplit: { material_id: string; qty: number }[] = [];

    if (materialType === "pe_standard") {
      lldpe = (finalLbs * 5) / 6;
      ldpe = finalLbs / 6;
    } else if (materialType === "pe_rld") {
      lldpe = finalLbs / 3;
      rld = finalLbs / 3;
      ldpe = finalLbs / 3;
    } else if (materialType === "pp") {
      pp = finalLbs;
    } else if (materialType === "custom") {
      customSplit = customLines
        .filter((l) => l.material_id && parseFloat(l.percentage) > 0)
        .map((l) => ({ material_id: l.material_id, qty: (finalLbs * parseFloat(l.percentage)) / 100 }));
    }

    // Price/Pc — Sales Invoice-এর ঠিক একই ফর্মুলা: Order Thickness (T) ব্যবহার করে
    // (Production Thickness নয়), + এই Row-এর নিজস্ব Print charge + Adhesive charge। ২ দশমিকে রাউন্ড।
    // Adhesive Rate/Inch চার্জ Adhesive আর Flap Gusset — দুই টাইপেই লাগে (দুটোতেই Flap থাকে)।
    let unitPrice = 0;
    if (pricePerLbs && T) {
      const baseUnitPrice = (pricePerLbs * tubeInch * cuttingInch * T) / 75000;
      const printCharge = row.hasPrint ? (parseInt(row.printColors) || 0) * (parseFloat(row.ratePerColor) || 0.20) : 0;
      const adhesiveCharge = hasAdhesiveCharge(row.measurementType) ? cuttingInch * (parseFloat(row.ratePerInch) || 0.02) : 0;
      unitPrice = Math.round((baseUnitPrice + printCharge + adhesiveCharge) * 100) / 100;
    }
    const amount = Math.floor(qtyN * unitPrice);

    return {
      tube, cutting, qty: qtyN, baseLbs, finalLbs,
      kg: finalLbs * 0.453592,
      bags: finalLbs / LBS_PER_BAG,
      lldpe, ldpe, pp, rld, customSplit,
      unitPrice, amount,
    };
  }

  function buildPendingItemFromRow(row: MeasurementRow): PendingItem | null {
    const calc = computeRowCalc(row);
    if (!calc || !warehouseId) return null;

    const materialsNeeded: { name: string; qty: number }[] = [];
    if (materialType === "pe_standard") {
      materialsNeeded.push({ name: "LLDPE", qty: calc.lldpe });
      materialsNeeded.push({ name: "LDPE", qty: calc.ldpe });
    } else if (materialType === "pe_rld") {
      materialsNeeded.push({ name: "LLDPE", qty: calc.lldpe });
      materialsNeeded.push({ name: "Recycled Chips", qty: calc.rld });
      materialsNeeded.push({ name: "LDPE", qty: calc.ldpe });
    } else if (materialType === "pp") {
      materialsNeeded.push({ name: "PP", qty: calc.pp });
    } else {
      calc.customSplit.forEach((c) => {
        const mat = materials.find((m) => m.id === c.material_id);
        if (mat) materialsNeeded.push({ name: mat.material_name, qty: c.qty });
      });
    }

    const L = parseFloat(row.lengthVal) || 0;
    const W = parseFloat(row.widthVal) || 0;
    const F = parseFloat(row.flapVal) || 0;
    const G = parseFloat(row.gussetVal) || 0;
    const P = parseFloat(row.pillowVal) || 0;
    const T = parseFloat(row.thicknessMm) || 0;
    const PT = parseFloat(row.productionThicknessMm) || 0;

    const lengthCm = row.unit === "cm" ? calc.cutting : calc.cutting * CM_PER_INCH;
    const widthCm = row.unit === "cm" ? calc.tube : calc.tube * CM_PER_INCH;
    const warehouseName = warehouses.find((w) => w.id === warehouseId)?.name ?? "-";

    return {
      style, customerBookingRef, poNo, printLayoutNote, printLayoutFileUrl, productDetails: row.productDetails,
      measurementType: row.measurementType, unit: row.unit, lengthVal: L, widthVal: W, flapVal: F, gussetVal: G, pillowVal: P, thicknessMm: T,
      productionThicknessMm: PT,
      piThicknessMm: parseFloat(row.piThicknessMm) || 0,
      materialType, quantity: calc.qty, warehouseId, warehouseName,
      finalLbs: calc.finalLbs, kg: calc.kg, bags: calc.bags,
      materialsNeeded, lengthCm, widthCm, hasPrint: row.hasPrint, printColors: parseInt(row.printColors) || 0,
      ratePerColor: parseFloat(row.ratePerColor) || 0.20,
      ratePerInch: parseFloat(row.ratePerInch) || 0.02,
      unitPrice: calc.unitPrice, amount: calc.amount,
    };
  }

  async function checkDuplicateStyle() {
    if (!customerId || !style) return;
    const { data } = await supabase
      .from("bookings").select("booking_no").eq("customer_id", customerId).eq("style", style).limit(1);
    if (data && data.length > 0) {
      setWarning(`⚠ এই কাস্টমারের জন্য "${style}" স্টাইলে আগে থেকেই বুকিং আছে (${data[0].booking_no})। এটা কি সঠিক?`);
    } else {
      setWarning("");
    }
  }

  // Garments-এর ঠিকানা পাওয়া গেলে সেটাই বসবে, না পেলে Customer-এর ঠিকানা, সেটাও না থাকলে
  // Customer-এর নাম fallback হিসেবে বসবে (একদম খালি রাখার চেয়ে অন্তত একটা শুরুর মান থাকা ভালো)।
  function handleGarmentsChange(id: string) {
    setGarmentsId(id);
    const g = garmentsList.find((gm) => gm.id === id);
    setGarmentsNameInput(g?.name ?? "");
    if (g?.address) {
      setDeliveryPoint(g.address);
    } else {
      const c = customersList.find((c) => c.id === customerId);
      setDeliveryPoint(c?.address || c?.name || "");
    }
  }

  // Buyer বাছলে তার ডিফল্ট Thickness/Rate — এখনো কোনো মাপ/Qty না দেওয়া (অস্পর্শিত) Row-গুলোতেই
  // সরাসরি বসিয়ে দেওয়া হয় (আলাদা কোনো "Default" প্যানেল নেই, Row-এই সাথে সাথে দেখা যাবে)।
  function applyBuyerDefaults(selectedBuyerId: string) {
    if (!selectedBuyerId) return;

    const selectedBuyer = buyersList.find((b) => b.id === selectedBuyerId);
    if (!selectedBuyer) return;

    setRows((prev) => prev.map((r) => {
      const isUntouched = !r.lengthVal && !r.widthVal && !r.quantity;
      if (!isUntouched) return r;
      return {
        ...r,
        thicknessMm: selectedBuyer.booking_thickness_mm != null ? String(selectedBuyer.booking_thickness_mm) : r.thicknessMm,
        productionThicknessMm: selectedBuyer.production_thickness_mm != null ? String(selectedBuyer.production_thickness_mm) : r.productionThicknessMm,
        piThicknessMm: selectedBuyer.pi_thickness_mm != null ? String(selectedBuyer.pi_thickness_mm) : r.piThicknessMm,
        ratePerColor: selectedBuyer.print_colors_default != null ? String(selectedBuyer.print_colors_default) : r.ratePerColor,
        ratePerInch: selectedBuyer.adhesive_rate_per_inch != null ? String(selectedBuyer.adhesive_rate_per_inch) : r.ratePerInch,
      };
    }));
  }

  async function ensureCustomer() {
    const trimmedName = customerNameInput.trim();
    if (customerId) {
      const selected = customersList.find((c) => c.id === customerId);
      return { customerId, customerName: selected?.name ?? null };
    }
    if (!trimmedName) return { customerId: null as string | null, customerName: null as string | null };

    const existingCustomer = customersList.find((c) => c.name.toLowerCase() === trimmedName.toLowerCase());
    if (existingCustomer) {
      setCustomerId(existingCustomer.id);
      setCustomerNameInput(existingCustomer.name);
      return { customerId: existingCustomer.id, customerName: existingCustomer.name };
    }

    const { data, error } = await supabase
      .from("customers")
      .insert({ name: trimmedName })
      .select("id, name, address, price_per_lbs")
      .single();

    if (error) throw error;
    if (data) {
      setCustomersList((prev) => [...prev, { id: data.id, name: data.name, address: data.address ?? null, default_print_rate: null, default_adhesive_rate: null, price_per_lbs: data.price_per_lbs ?? null }]);
      setCustomerId(data.id);
      setCustomerNameInput(data.name);
      return { customerId: data.id, customerName: data.name };
    }
    return { customerId: null, customerName: trimmedName };
  }

  async function ensureMerchant() {
    const trimmedName = merchantNameInput.trim();
    if (merchantId) {
      const selected = merchantsList.find((m) => m.id === merchantId);
      return { merchantId, merchantName: selected?.name ?? null };
    }
    if (!trimmedName) return { merchantId: null as string | null, merchantName: null as string | null };

    const existingMerchant = merchantsList.find((m) => m.name.toLowerCase() === trimmedName.toLowerCase());
    if (existingMerchant) {
      setMerchantId(existingMerchant.id);
      setMerchantNameInput(existingMerchant.name);
      return { merchantId: existingMerchant.id, merchantName: existingMerchant.name };
    }

    const { data, error } = await supabase
      .from("merchants")
      .insert({ name: trimmedName })
      .select("id, name")
      .single();

    if (error) throw error;
    if (data) {
      setMerchantsList((prev) => [...prev, { id: data.id, name: data.name }]);
      setMerchantId(data.id);
      setMerchantNameInput(data.name);
      return { merchantId: data.id, merchantName: data.name };
    }
    return { merchantId: null, merchantName: trimmedName };
  }

  async function ensureBuyerForCurrentCustomer(resolvedCustomerId: string | null) {
    const trimmedName = buyerNameInput.trim();
    if (!resolvedCustomerId) return { buyerId: null as string | null, buyerName: null as string | null };

    if (buyerId) {
      const selectedBuyer = buyersList.find((b) => b.id === buyerId);
      return { buyerId, buyerName: (selectedBuyer?.name ?? buyerNameInput.trim()) || null };
    }

    if (!trimmedName) return { buyerId: null, buyerName: null };

    const existingBuyer = buyersList.find(
      (b) => b.customer_id === resolvedCustomerId && b.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (existingBuyer) {
      setBuyerId(existingBuyer.id);
      setBuyerNameInput(existingBuyer.name);
      return { buyerId: existingBuyer.id, buyerName: existingBuyer.name };
    }

    const { data, error } = await supabase
      .from("buyers")
      .insert({
        customer_id: resolvedCustomerId,
        name: trimmedName,
        pricing_rule: "manual",
        percentage_value: 0,
        rate_per_lbs_value: 0,
      })
      .select("id, name")
      .single();

    if (error) throw error;
    if (data) {
      setBuyersList((prev) => [
        ...prev,
        {
          id: data.id,
          customer_id: resolvedCustomerId,
          name: data.name,
          booking_thickness_mm: null,
          production_thickness_mm: null,
          pi_thickness_mm: null,
          print_colors_default: null,
          adhesive_rate_per_inch: null,
        },
      ]);
      setBuyerId(data.id);
      setBuyerNameInput(data.name);
      return { buyerId: data.id, buyerName: data.name };
    }

    return { buyerId: null, buyerName: trimmedName };
  }

  async function ensureGarmentsForCurrentCustomer(resolvedCustomerId: string | null) {
    const trimmedName = garmentsNameInput.trim();
    if (!resolvedCustomerId) return { garmentsId: null as string | null, garmentsName: null as string | null };

    if (garmentsId) {
      const selectedGarment = garmentsList.find((g) => g.id === garmentsId);
      return { garmentsId, garmentsName: (selectedGarment?.name ?? garmentsNameInput.trim()) || null };
    }

    if (!trimmedName) return { garmentsId: null, garmentsName: null };

    const existingGarment = garmentsList.find(
      (g) => g.customer_id === resolvedCustomerId && g.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (existingGarment) {
      setGarmentsId(existingGarment.id);
      setGarmentsNameInput(existingGarment.name);
      return { garmentsId: existingGarment.id, garmentsName: existingGarment.name };
    }

    const { data, error } = await supabase
      .from("garments")
      .insert({
        customer_id: resolvedCustomerId,
        name: trimmedName,
        address: deliveryPoint.trim() || null,
      })
      .select("id, name, address")
      .single();

    if (error) throw error;
    if (data) {
      setGarmentsList((prev) => [...prev, { id: data.id, customer_id: resolvedCustomerId, name: data.name, address: data.address ?? null }]);
      setGarmentsId(data.id);
      setGarmentsNameInput(data.name);
      if (data.address) setDeliveryPoint(data.address);
      return { garmentsId: data.id, garmentsName: data.name };
    }

    return { garmentsId: null, garmentsName: trimmedName };
  }

  function resetStyleFields() {
    setStyle("");
    setCustomerBookingRef("");
    setPoNo("");
    setMaterialType("pe_standard");
    setCustomLines([{ material_id: "", percentage: "" }, { material_id: "", percentage: "" }]);
    setWarehouseId("");
    setBulkPasteText("");
    setBulkPasteErrors([]);
    setWarning("");
    setRows([makeEmptyRow(BASELINE_ROW_SEED)]);
    if (buyerId) applyBuyerDefaults(buyerId);
  }

  function handleAddStyleToBooking() {
    setError("");
    if (materialType === "custom" && Math.abs(customTotalPercent - 100) > 0.1) {
      setError(`Custom Material-এর মোট শতাংশ ১০০% হতে হবে (বর্তমানে ${customTotalPercent.toFixed(1)}%)।`);
      return;
    }
    if (!warehouseId) {
      setError("Warehouse বাছুন।");
      return;
    }
    const candidateRows = rows.filter((r) => (parseFloat(r.quantity) || 0) > 0);
    if (candidateRows.length === 0) {
      setError("অন্তত একটা Measurement Row-এ Length/Width ও Quantity ঠিকমতো দিন।");
      return;
    }

    const newItems: PendingItem[] = [];
    const failedRows: string[] = [];
    for (const row of candidateRows) {
      const item = buildPendingItemFromRow(row);
      if (item) newItems.push(item);
      else failedRows.push(row.productDetails || `${row.lengthVal}x${row.widthVal}`);
    }

    if (newItems.length === 0) {
      setError("কোনো Row-এর হিসাব মিলছে না — Length/Width/Thickness ঠিকমতো দিন।");
      return;
    }

    setPendingItems((prev) => [...prev, ...newItems]);
    if (failedRows.length > 0) {
      setWarning(`⚠ কিছু Row (${failedRows.join(", ")}) হিসাব করা যায়নি এবং যোগ হয়নি — মাপ/Thickness চেক করুন।`);
    }
    resetStyleFields();
  }

  function removePendingItem(index: number) {
    setPendingItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const unsavedRows = rows.filter((r) => (parseFloat(r.quantity) || 0) > 0);

    if (materialType === "custom" && unsavedRows.length > 0 && Math.abs(customTotalPercent - 100) > 0.1) {
      setError(`Custom Material-এর মোট শতাংশ ১০০% হতে হবে (বর্তমানে ${customTotalPercent.toFixed(1)}%)।`);
      return;
    }

    // যদি বর্তমান স্টাইলে Row ভরা আছে কিন্তু "স্টাইল যোগ করুন" চাপা না হয়ে থাকে, সেটাও যোগ করে নিন
    const currentRowItems = unsavedRows
      .map((row) => buildPendingItemFromRow(row))
      .filter((item): item is PendingItem => item !== null);

    const allItems = currentRowItems.length > 0 ? [...pendingItems, ...currentRowItems] : pendingItems;

    if ((!customerId && !customerNameInput.trim()) || allItems.length === 0) {
      setError("Customer বাছুন এবং অন্তত একটা প্রোডাক্ট (Measurement + Quantity + Warehouse) যোগ করুন।");
      return;
    }

    setLoading(true);

    const groupId = crypto.randomUUID();
    const sharedBookingNo = await generateNextDocNo(supabase, "bookings", "booking_no", "BK", "booking_date", bookingDate);
    const createdBy = await getCurrentUserId(supabase);

    let resolvedMerchantId: string | null = null;
    try {
      const result = await ensureMerchant();
      resolvedMerchantId = result.merchantId;
    } catch (err: any) {
      setLoading(false);
      setError(`Merchant সেভ করতে ব্যর্থ হয়েছে: ${err?.message ?? "অজানা কারণ"}`);
      return;
    }

    const { data: allMaterials } = await supabase.from("raw_materials").select("id, material_name");
    const materialMap: Record<string, string> = {};
    (allMaterials ?? []).forEach((m) => (materialMap[m.material_name] = m.id));

    let resolvedCustomerId: string | null = null;
    try {
      const result = await ensureCustomer();
      resolvedCustomerId = result.customerId;
    } catch (err: any) {
      setLoading(false);
      setError(`Customer সেভ করতে ব্যর্থ হয়েছে: ${err?.message ?? "অজানা কারণ"}`);
      return;
    }
    if (!resolvedCustomerId) {
      setLoading(false);
      setError("Customer বাছুন অথবা নতুন Customer-এর নাম লিখুন।");
      return;
    }

    const { buyerId: resolvedBuyerId } = await ensureBuyerForCurrentCustomer(resolvedCustomerId);
    const { garmentsId: resolvedGarmentsId, garmentsName: resolvedGarmentsName } = await ensureGarmentsForCurrentCustomer(resolvedCustomerId);

    for (const item of allItems) {
      // Finished Goods খুঁজুন/তৈরি করুন
      const productName = item.productDetails || `${item.style || "Product"} (${item.lengthCm.toFixed(1)}x${item.widthCm.toFixed(1)})`;
      const { data: existingProduct } = await supabase
        .from("finished_goods").select("id")
        .eq("length_cm", Number(item.lengthCm.toFixed(3)))
        .eq("width_cm", Number(item.widthCm.toFixed(3)))
        .eq("thickness", item.thicknessMm)
        .maybeSingle();

      let productId = existingProduct?.id;
      if (!productId) {
        const { data: newProduct } = await supabase
          .from("finished_goods")
          .insert({ product_name: productName, length_cm: item.lengthCm, width_cm: item.widthCm, thickness: item.thicknessMm })
          .select().single();
        productId = newProduct?.id;
      }
      if (!productId) continue;

      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          booking_no: sharedBookingNo, customer_id: resolvedCustomerId, buyer_id: resolvedBuyerId, merchant_id: resolvedMerchantId,
          style: item.style, product_details: item.productDetails, product_id: productId,
          measurement_type: item.measurementType, measurement_unit: item.unit,
          length_val: item.lengthVal, width_val: item.widthVal,
          flap_val: item.flapVal || null, gusset_val: item.gussetVal || null, pillow_val: item.pillowVal || null,
          thickness_mm: item.thicknessMm, production_thickness_mm: item.productionThicknessMm,
          pi_thickness_mm: item.piThicknessMm,
          material_type: item.materialType,
          quantity_pcs: item.quantity, booking_date: bookingDate,
          required_lbs: Number(item.finalLbs.toFixed(2)),
          required_kg: Number(item.kg.toFixed(2)),
          required_bags: Number(item.bags.toFixed(2)),
          delivery_point: deliveryPoint, print_layout_note: item.printLayoutNote || null,
          print_layout_file_url: item.printLayoutFileUrl || null,
          has_print: item.hasPrint, print_colors: item.printColors,
          rate_per_color: item.ratePerColor, rate_per_inch: item.ratePerInch,
          quoted_unit_price: item.unitPrice || null, quoted_amount: item.amount || null,
          garments_name: resolvedGarmentsName ?? null,
          garments_id: resolvedGarmentsId || null, booking_group_id: groupId,
          customer_booking_ref: item.customerBookingRef || null,
          po_no: item.poNo || null,
          warehouse_id: item.warehouseId, status: "in_production",
          created_by: createdBy,
        })
        .select().single();

      if (bookingError || !booking) {
        setLoading(false);
        setError(`"${item.style || item.productDetails || 'একটি প্রোডাক্ট'}" সেভ করতে ব্যর্থ হয়েছে: ${bookingError?.message ?? 'অজানা কারণ'}`);
        return;
      }

      const productionNo = await generateNextDocNo(supabase, "production_orders", "production_no", "PROD", "order_date", bookingDate);
      const { data: productionOrder } = await supabase
        .from("production_orders")
        .insert({
          production_no: productionNo, booking_id: booking.id, product_id: productId,
          quantity_pcs: item.quantity, stage: "blowing", required_lbs: item.finalLbs, order_date: bookingDate,
        })
        .select().single();

      for (const m of item.materialsNeeded) {
        const materialId = materialMap[m.name];
        if (!materialId || m.qty <= 0) continue;

        await supabase.from("booking_materials").insert({
          booking_id: booking.id, material_id: materialId, quantity_lbs: m.qty,
        });

        const { data: stock } = await supabase
          .from("raw_material_stock").select("*")
          .eq("material_id", materialId).eq("warehouse_id", item.warehouseId).maybeSingle();

        if (stock) {
          await supabase.from("raw_material_stock")
            .update({ quantity_lbs: stock.quantity_lbs - m.qty, updated_at: new Date().toISOString() })
            .eq("id", stock.id);
        } else {
          // স্টক রো আগে থেকে না থাকলেও তৈরি করুন — ঘাটতি (negative) হলেও যেন দেখা যায়
          await supabase.from("raw_material_stock").insert({
            material_id: materialId, warehouse_id: item.warehouseId, quantity_lbs: -m.qty,
          });
        }

        await supabase.from("stock_ledger").insert({
          item_type: "raw_material", item_id: materialId, warehouse_id: item.warehouseId,
          txn_type: "out", quantity: m.qty, reference_type: "production",
          reference_id: productionOrder?.id, txn_date: bookingDate,
        });

        if (productionOrder) {
          await supabase.from("material_consumption").insert({
            production_id: productionOrder.id, material_id: materialId,
            quantity_lbs: m.qty, consumption_date: bookingDate,
          });
        }
      }

      // Perpetual inventory — issue করা কাঁচামালের মূল্য WIP-এ তোলা (Dr 1300 / Cr material inv)
      if (productionOrder) {
        const invVoucherId = await postBookingConsumptionJv(supabase, {
          date: bookingDate,
          bookingNo: sharedBookingNo,
          productionOrderId: productionOrder.id,
          lines: item.materialsNeeded
            .map((m) => ({ materialId: materialMap[m.name], qtyLbs: m.qty }))
            .filter((l) => l.materialId && l.qtyLbs > 0),
        });
        if (invVoucherId) {
          await supabase.from("bookings").update({ inventory_voucher_id: invVoucherId }).eq("id", booking.id);
        }
      }
    }

    setLoading(false);
    router.push("/dashboard/sales/bookings");
    router.refresh();
  }

  const rowCalcs = rows.map((r) => ({ row: r, calc: computeRowCalc(r) }));
  const validRowCalcs = rowCalcs.map((rc) => rc.calc).filter((c): c is NonNullable<typeof c> => c !== null);
  const styleTotalQty = validRowCalcs.reduce((s, c) => s + c.qty, 0);
  const styleTotalLbs = validRowCalcs.reduce((s, c) => s + c.finalLbs, 0);
  const styleTotalLldpe = validRowCalcs.reduce((s, c) => s + c.lldpe, 0);
  const styleTotalLdpe = validRowCalcs.reduce((s, c) => s + c.ldpe, 0);
  const styleTotalPp = validRowCalcs.reduce((s, c) => s + c.pp, 0);
  const styleTotalRld = validRowCalcs.reduce((s, c) => s + c.rld, 0);
  const styleTotalAmount = validRowCalcs.reduce((s, c) => s + c.amount, 0);
  const currentStyleItemCount = rows.filter((r) => (parseFloat(r.quantity) || 0) > 0).length;
  const finalSubmitCount = pendingItems.length + validRowCalcs.length;

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-[1700px]">
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm text-gray-600 mb-1">Customer</label>
          <select
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              const selected = customersList.find((c) => c.id === e.target.value);
              setCustomerNameInput(selected?.name ?? "");
              setWarning("");
              setBuyerId("");
              setBuyerNameInput("");
              setGarmentsId("");
              setGarmentsNameInput("");
              // Delivery Point-এর জন্য এখনো Garments বাছা হয়নি — Customer-এর ঠিকানা, না থাকলে
              // নাম fallback হিসেবে বসিয়ে দেওয়া; Garments বাছলে তার ঠিকানা এটা override করবে
              setDeliveryPoint(selected?.address || selected?.name || "");
            }}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">-- বাছুন --</option>
            {customersList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input
            value={customerNameInput}
            onChange={(e) => { setCustomerNameInput(e.target.value); if (!e.target.value.trim()) setCustomerId(""); }}
            onBlur={(e) => { if (!customerId && e.target.value.trim() && !deliveryPoint.trim()) setDeliveryPoint(e.target.value.trim()); }}
            className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="নতুন Customer লিখুন"
          />
          <p className="mt-1 text-xs text-gray-500">নতুন Customer লিখলে সাবমিটের সময় অটোমেটিক যোগ হবে</p>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm text-gray-600 mb-1">Garments</label>
          <select value={garmentsId} onChange={(e) => handleGarmentsChange(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
            <option value="">-- বাছুন --</option>
            {garmentsList.filter((g) => g.customer_id === customerId).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <input value={garmentsNameInput} onChange={(e) => { setGarmentsNameInput(e.target.value); if (!e.target.value.trim()) setGarmentsId(""); }} className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" placeholder="নতুন Garments লিখুন" />
          <p className="mt-1 text-xs text-gray-500">নতুন Garments লিখলে সাবমিটের সময় অটোমেটিক যোগ হবে</p>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm text-gray-600 mb-1">Buyer</label>
          <select
            value={buyerId}
            onChange={(e) => {
              const nextBuyerId = e.target.value;
              setBuyerId(nextBuyerId);
              const selected = buyersList.find((b) => b.id === nextBuyerId);
              setBuyerNameInput(selected?.name ?? "");
              if (nextBuyerId) {
                applyBuyerDefaults(nextBuyerId);
              }
            }}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">-- বাছুন --</option>
            {buyersList.filter((b) => b.customer_id === customerId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input value={buyerNameInput} onChange={(e) => { setBuyerNameInput(e.target.value); if (!e.target.value.trim()) setBuyerId(""); }} className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" placeholder="নতুন Buyer লিখুন" />
          <p className="mt-1 text-xs text-gray-500">নতুন Buyer লিখলে সাবমিটের সময় অটোমেটিক যোগ হবে</p>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm text-gray-600 mb-1">Merchant</label>
          <select
            value={merchantId}
            onChange={(e) => {
              const nextMerchantId = e.target.value;
              setMerchantId(nextMerchantId);
              const selected = merchantsList.find((m) => m.id === nextMerchantId);
              setMerchantNameInput(selected?.name ?? "");
            }}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">-- বাছুন --</option>
            {merchantsList.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input value={merchantNameInput} onChange={(e) => { setMerchantNameInput(e.target.value); if (!e.target.value.trim()) setMerchantId(""); }} className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" placeholder="নতুন Merchant লিখুন" />
          <p className="mt-1 text-xs text-gray-500">নতুন Merchant লিখলে সাবমিটের সময় অটোমেটিক যোগ হবে</p>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-sm text-gray-600 mb-1">Price/Lbs (৳, Estimate-এর জন্য)</label>
          <input
            type="number" step="0.01" value={priceOverride} onChange={(e) => setPriceOverride(e.target.value)}
            placeholder={resolvedPricePerLbs ? String(resolvedPricePerLbs) : "0"}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-400">Customer Default: {money(resolvedPricePerLbs)}</p>
        </div>
      </div>

      {warning && <p className="text-sm text-orange-600 bg-orange-50 border border-orange-200 rounded-lg p-2">{warning}</p>}

      {/* ===== Style Info: এক স্টাইলের জন্য একবার — সব মাপে কমন থাকবে, এক লাইনে (Note+Upload-সহ) ===== */}
      <div className="rounded-lg border-2 border-gray-300 p-4 space-y-3 bg-gray-50">
        <p className="text-sm font-semibold text-gray-800">Style Info (এই স্টাইলের সব মাপে কমন থাকবে)</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Style</label>
            <input value={style} onChange={(e) => setStyle(e.target.value)} onBlur={checkDuplicateStyle} onKeyDown={focusNextOnEnter} className="w-24 rounded-lg border px-2 py-2 text-sm" placeholder="1024" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Customer Booking Ref</label>
            <input value={customerBookingRef} onChange={(e) => setCustomerBookingRef(e.target.value)} onKeyDown={focusNextOnEnter} className="w-32 rounded-lg border px-2 py-2 text-sm" placeholder="বুকিং নম্বর" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">PO No</label>
            <input value={poNo} onChange={(e) => setPoNo(e.target.value)} onKeyDown={focusNextOnEnter} className="w-28 rounded-lg border px-2 py-2 text-sm" placeholder="PO নম্বর" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Material Type</label>
            <select value={materialType} onChange={(e) => setMaterialType(e.target.value as MaterialTypeVal)} onKeyDown={focusNextOnEnter} className="w-44 rounded-lg border px-2 py-2 text-sm">
              <option value="pe_standard">PE (5:1)</option>
              <option value="pe_rld">PE-RLD (2.5:2.5:2.5)</option>
              <option value="pp">PP</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Warehouse</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} onKeyDown={focusNextOnEnter} className="w-36 rounded-lg border px-2 py-2 text-sm">
              <option value="">-- বাছুন --</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-gray-500 mb-1">Print Layout Note</label>
            <input
              value={printLayoutNote} onChange={(e) => setPrintLayoutNote(e.target.value)} onKeyDown={focusNextOnEnter}
              className="w-full rounded-lg border px-2 py-2 text-sm" placeholder="লেআউট নোট (ঐচ্ছিক)"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Print Layout ফাইল</label>
            <label className="inline-flex items-center rounded-lg border border-gray-400 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer whitespace-nowrap">
              {uploadingLayout ? "আপলোড হচ্ছে..." : "📎 ছবি/PDF বাছুন"}
              <input
                type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleLayoutFileChange} disabled={uploadingLayout} className="hidden"
              />
            </label>
          </div>
        </div>
        {style && !style.startsWith("ST-") && <p className="text-xs text-gray-500">দেখাবে: ST-{style}</p>}
        {layoutUploadError && <p className="text-xs text-red-600">{layoutUploadError}</p>}
        {printLayoutFileUrl && (
          <div className="flex items-center gap-3 rounded border bg-white p-2 w-fit">
            {/\.(jpe?g|png|webp)$/i.test(printLayoutFileUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={printLayoutFileUrl} alt="Print layout" className="h-16 w-16 object-cover rounded border" />
            ) : (
              <span className="text-lg">📄</span>
            )}
            <a href={printLayoutFileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline truncate max-w-[200px]">
              {printLayoutFileName || "ফাইল দেখুন"}
            </a>
            <button type="button" onClick={removeLayoutFile} className="text-xs text-red-600 hover:underline ml-2">সরান</button>
          </div>
        )}

        {materialType === "custom" && (
          <div className="w-full rounded-lg border p-3 bg-white space-y-2">
            <p className="text-xs text-gray-500">প্রতিটা Material-এর শতাংশ (%) দিন, মোট ১০০% হতে হবে</p>
            {customLines.map((line, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select value={line.material_id} onChange={(e) => updateCustomLine(i, "material_id", e.target.value)} onKeyDown={focusNextOnEnter} className="flex-1 rounded border px-2 py-1 text-sm">
                  <option value="">-- Material বাছুন --</option>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.material_name}</option>)}
                </select>
                <input type="number" step="0.1" placeholder="%" value={line.percentage} onChange={(e) => updateCustomLine(i, "percentage", e.target.value)} onKeyDown={focusNextOnEnter} className="w-24 rounded border px-2 py-1 text-sm" />
                {customLines.length > 2 && (
                  <button type="button" onClick={() => removeCustomLine(i)} className="text-red-600 text-xs hover:underline">সরান</button>
                )}
              </div>
            ))}
            <button type="button" onClick={addCustomLine} className="text-xs text-gray-600 border border-dashed rounded px-2 py-1 hover:bg-gray-100">
              + আরেকটি Material যোগ করুন
            </button>
            <p className={`text-xs ${Math.abs(customTotalPercent - 100) < 0.1 ? "text-green-600" : "text-orange-600"}`}>
              মোট: {customTotalPercent.toFixed(1)}% {Math.abs(customTotalPercent - 100) < 0.1 ? "✓" : "(১০০% হতে হবে)"}
            </p>
          </div>
        )}
      </div>

      {/* ===== Measurement Rows: এই স্টাইলের প্রতিটা Size একেকটা কার্ড — দুই লাইনে ===== */}
      <div className="rounded-lg border p-4 space-y-3 bg-white">
        <p className="text-sm font-semibold text-gray-700">Measurement Rows (এই স্টাইলের সব Size — প্রতিটার থিকনেস/প্রিন্ট/এডহিসিভ আলাদা হতে পারে)</p>

        <div className="space-y-2" ref={measurementRowsRef}>
          {rowCalcs.map(({ row, calc }) => (
            <div key={row.rowId} className="rounded-lg border p-2 bg-gray-50 space-y-2">
              {/* লাইন ১: মাপ ও পরিমাণ */}
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Measurement Type</label>
                  <select
                    value={row.measurementType}
                    onChange={(e) => updateRow(row.rowId, "measurementType", e.target.value)}
                    onKeyDown={focusNextRowFieldOrAddButton}
                    className="w-40 rounded border px-1.5 py-1.5 text-xs"
                  >
                    {(Object.keys(MEASUREMENT_TYPE_LABELS) as MeasurementType[]).map((mt) => (
                      <option key={mt} value={mt}>{MEASUREMENT_TYPE_LABELS[mt]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Description</label>
                  <input value={row.productDetails} onChange={(e) => updateRow(row.rowId, "productDetails", e.target.value)} onKeyDown={focusNextRowFieldOrAddButton} className="w-32 rounded border px-1.5 py-1.5 text-xs" placeholder="Description" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Unit</label>
                  <select value={row.unit} onChange={(e) => updateRow(row.rowId, "unit", e.target.value)} onKeyDown={focusNextRowFieldOrAddButton} className="w-16 rounded border px-1 py-1.5 text-xs">
                    <option value="cm">cm</option>
                    <option value="inch">inch</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">L</label>
                  <input type="number" step="0.01" value={row.lengthVal} onChange={(e) => updateRow(row.rowId, "lengthVal", e.target.value)} onKeyDown={focusNextRowFieldOrAddButton} className="w-16 rounded border px-1.5 py-1.5 text-xs" />
                </div>
                {(row.measurementType === "adhesive" || row.measurementType === "flap_gusset") && (
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Flap</label>
                    <input type="number" step="0.01" value={row.flapVal} onChange={(e) => updateRow(row.rowId, "flapVal", e.target.value)} onKeyDown={focusNextRowFieldOrAddButton} className="w-16 rounded border px-1.5 py-1.5 text-xs" />
                  </div>
                )}
                {(row.measurementType === "gusset" || row.measurementType === "flap_gusset") && (
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Gusset</label>
                    <input type="number" step="0.01" value={row.gussetVal} onChange={(e) => updateRow(row.rowId, "gussetVal", e.target.value)} onKeyDown={focusNextRowFieldOrAddButton} className="w-16 rounded border px-1.5 py-1.5 text-xs" />
                  </div>
                )}
                {row.measurementType === "pillow" && (
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Pillow</label>
                    <input type="number" step="0.01" value={row.pillowVal} onChange={(e) => updateRow(row.rowId, "pillowVal", e.target.value)} onKeyDown={focusNextRowFieldOrAddButton} className="w-16 rounded border px-1.5 py-1.5 text-xs" />
                  </div>
                )}
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">W</label>
                  <input type="number" step="0.01" value={row.widthVal} onChange={(e) => updateRow(row.rowId, "widthVal", e.target.value)} onKeyDown={focusNextRowFieldOrAddButton} className="w-16 rounded border px-1.5 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Qty (Pcs)</label>
                  <input type="number" step="1" value={row.quantity} onChange={(e) => updateRow(row.rowId, "quantity", e.target.value)} onKeyDown={focusNextRowFieldOrAddButton} className="w-20 rounded border px-1.5 py-1.5 text-xs" />
                </div>
                <button type="button" onClick={() => removeRow(row.rowId)} className="text-red-600 text-xs hover:underline ml-auto">✕ সরান</button>
              </div>

              {/* লাইন ২: থিকনেস/প্রিন্ট/এডহিসিভ + হিসাব */}
              <div className="flex flex-wrap gap-2 items-end pt-1 border-t border-dashed">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Order Th. (mm)</label>
                  <input type="number" step="0.001" min="0" max="30" value={row.thicknessMm} onChange={(e) => updateRow(row.rowId, "thicknessMm", e.target.value)} onKeyDown={focusNextRowFieldOrAddButton} className="w-16 rounded border px-1.5 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Prod. Th. (mm)</label>
                  <input type="number" step="0.001" min="0" max="30" value={row.productionThicknessMm} onChange={(e) => updateRow(row.rowId, "productionThicknessMm", e.target.value)} onKeyDown={focusNextRowFieldOrAddButton} className="w-16 rounded border px-1.5 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">PI Th. (mm)</label>
                  <input type="number" step="0.001" min="0" max="30" value={row.piThicknessMm} onChange={(e) => updateRow(row.rowId, "piThicknessMm", e.target.value)} onKeyDown={focusNextRowFieldOrAddButton} className="w-16 rounded border px-1.5 py-1.5 text-xs" />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-gray-700">
                  <input type="checkbox" checked={row.hasPrint} onChange={(e) => updateRow(row.rowId, "hasPrint", e.target.checked)} onKeyDown={focusNextRowFieldOrAddButton} />
                  Print?
                </label>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Colors</label>
                  <input type="number" min="0" value={row.printColors} onChange={(e) => updateRow(row.rowId, "printColors", e.target.value)} onKeyDown={focusNextRowFieldOrAddButton} className="w-14 rounded border px-1.5 py-1.5 text-xs" disabled={!row.hasPrint} />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Rate/Color</label>
                  <input type="number" step="0.01" value={row.ratePerColor} onChange={(e) => updateRow(row.rowId, "ratePerColor", e.target.value)} onKeyDown={focusNextRowFieldOrAddButton} className="w-16 rounded border px-1.5 py-1.5 text-xs" disabled={!row.hasPrint} />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Rate/Inch</label>
                  <input
                    type="number" step="0.001" value={row.ratePerInch} onChange={(e) => updateRow(row.rowId, "ratePerInch", e.target.value)} onKeyDown={focusNextRowFieldOrAddButton}
                    className="w-16 rounded border px-1.5 py-1.5 text-xs" disabled={!hasAdhesiveCharge(row.measurementType)}
                  />
                </div>
                <span className="text-xs text-gray-500 ml-2">Tube: <strong className="text-gray-700">{calc ? money(calc.tube) : "-"}</strong></span>
                <span className="text-xs text-gray-500">Cutting: <strong className="text-gray-700">{calc ? money(calc.cutting) : "-"}</strong></span>
                <span className="text-xs text-blue-700">Req.Lbs: <strong>{calc ? money(calc.finalLbs) : "-"}</strong></span>
                <span className="text-xs text-gray-600">Price/Pc: <strong>{calc && calc.unitPrice > 0 ? money(calc.unitPrice) : "-"}</strong></span>
                <span className="text-xs text-green-700">Total Amt: <strong>{calc && calc.amount > 0 ? money(calc.amount) : "-"}</strong></span>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-center text-xs text-gray-400 py-3">কোনো Row নেই — নিচের বাটনে Row যোগ করুন</p>
          )}
        </div>

        <button type="button" ref={addRowBtnRef} onClick={addEmptyRow} className="text-xs text-gray-600 border border-dashed rounded px-3 py-1.5 hover:bg-gray-100">
          + Row যোগ করুন
        </button>

        {validRowCalcs.length > 0 && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-1">
            <p className="text-sm font-medium text-blue-900">
              এই স্টাইলের মোট Qty: <strong>{qtyFmt(styleTotalQty)}</strong> Pcs | মোট Required: <strong>{money(styleTotalLbs)} Lbs</strong> ≈ {money(styleTotalLbs * 0.453592)} Kg ≈ {money(styleTotalLbs / LBS_PER_BAG)} Bags
            </p>
            {styleTotalAmount > 0 && (
              <p className="text-sm font-medium text-blue-900">মোট Amount (Estimate): <strong>{money(styleTotalAmount)}</strong></p>
            )}
            {materialType === "pe_standard" && (
              <p className="text-sm text-blue-800">LLDPE: {money(styleTotalLldpe)} Lbs | LDPE: {money(styleTotalLdpe)} Lbs</p>
            )}
            {materialType === "pe_rld" && (
              <p className="text-sm text-blue-800">LLDPE: {money(styleTotalLldpe)} Lbs | Recycled Chips: {money(styleTotalRld)} Lbs | LDPE: {money(styleTotalLdpe)} Lbs</p>
            )}
            {materialType === "pp" && (
              <p className="text-sm text-blue-800">PP: {money(styleTotalPp)} Lbs</p>
            )}
          </div>
        )}

        {/* ===== Bulk Paste: কাস্টমারের শীট থেকে একসাথে অনেক Size যোগ করুন ===== */}
        <div className="rounded-lg border border-dashed p-3 bg-gray-50 space-y-2">
          <p className="text-xs font-medium text-gray-700">Bulk Paste (একসাথে অনেক Size যোগ করুন)</p>
          <p className="text-xs text-gray-500">
            প্রতি লাইনে: <code className="bg-white border rounded px-1">Description | Size | Qty</code> — Size:{" "}
            <code className="bg-white border rounded px-1">105x68</code> = Simple (LxW),{" "}
            <code className="bg-white border rounded px-1">40+5x28</code> = Adhesive (L+Flap x W),{" "}
            <code className="bg-white border rounded px-1">105x68x8</code> = Gusset (LxWxG),{" "}
            <code className="bg-white border rounded px-1">40+5+4x28</code> = Flap Gusset (L+Flap+Gusset x W) — Pillow ম্যানুয়ালি Type বদলে যোগ করুন
          </p>
          <textarea
            value={bulkPasteText}
            onChange={(e) => setBulkPasteText(e.target.value)}
            rows={4}
            className="w-full rounded-lg border px-3 py-2 text-xs font-mono"
            placeholder={"BLISTER POLY | 105x68 | 237\nPCS POLY | 40+5x28 | 3623\nPCS POLY | 40+5+4x28 | 1817"}
          />
          <button type="button" onClick={handleParseBulkPaste} className="rounded-lg border border-gray-400 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
            Parse করে Row যোগ করুন
          </button>
          {bulkPasteErrors.length > 0 && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 space-y-0.5">
              {bulkPasteErrors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleAddStyleToBooking}
        className="rounded-lg border-2 border-dashed border-gray-500 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 w-full"
      >
        ✓ এই স্টাইলের {currentStyleItemCount} টি Row বুকিং তালিকায় যোগ করুন (নতুন স্টাইলের জন্য ফর্ম রিসেট হবে)
      </button>

      {pendingItems.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
            যোগ করা প্রোডাক্ট তালিকা ({pendingItems.length}টি)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-3 py-2">Style</th>
                  <th className="px-3 py-2">Ref</th>
                  <th className="px-3 py-2">PO No</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Required Lbs</th>
                  <th className="px-3 py-2">Warehouse</th>
                  <th className="px-3 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {pendingItems.map((item, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{item.style || "-"}</td>
                    <td className="px-3 py-2">{item.customerBookingRef || "-"}</td>
                    <td className="px-3 py-2">{item.poNo || "-"}</td>
                    <td className="px-3 py-2">{item.productDetails || "-"}</td>
                    <td className="px-3 py-2 text-right">{item.quantity}</td>
                    <td className="px-3 py-2 text-right">{money(item.finalLbs)}</td>
                    <td className="px-3 py-2">{item.warehouseName}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => removePendingItem(i)} className="text-red-600 text-xs hover:underline">সরান</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Booking Date</label>
          <input type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
        <div className="flex-1 min-w-[280px]">
          <label className="block text-sm text-gray-600 mb-1">Delivery Point (পূর্ণ ঠিকানা)</label>
          {garmentsId && garmentsMaster.find((g) => g.id === garmentsId)?.address && (
            <button
              type="button"
              onClick={() => setDeliveryPoint(garmentsMaster.find((g) => g.id === garmentsId)!.address!)}
              className="text-xs text-blue-600 hover:underline mb-1"
            >
              Garments-এর ঠিকানা ব্যবহার করুন
            </button>
          )}
          <input value={deliveryPoint} onChange={(e) => setDeliveryPoint(e.target.value)} list="delivery-point-options" className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="সম্পূর্ণ ডেলিভারি ঠিকানা লিখুন" required />
          <datalist id="delivery-point-options">
            {garmentsList.filter((g) => g.customer_id === customerId && g.address).map((g) => (
              <option key={g.id} value={g.address ?? ""} />
            ))}
          </datalist>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : `Booking সেভ করুন (${finalSubmitCount}টি প্রোডাক্ট, + Production Order অটো তৈরি)`}
      </button>
    </form>
  );
}
