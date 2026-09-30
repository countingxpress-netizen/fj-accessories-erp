// Export LC-র Required Documents — F&J-এর "Export LC form.xlsx" + real LC Doc ফাইল অনুযায়ী
// ক্রম। Mushok-6.3 ইউজারের অনুরোধে যোগ (2026-09-30)।
export const REQUIRED_DOCUMENT_OPTIONS = [
  "Bill Of Exchange 1",
  "Bill Of Exchange 2",
  "Commercial Invoice",
  "Delivery Challan",
  "Truck Challan",
  "Packing List",
  "BENEFICIARY'S CERTIFICATE",
  "Certificate of Origin",
  "Inspection Certificate",
  "APPLICANT'S CERTIFICATE",
  "Mushok-6.3",
];

// যেসব ডকুমেন্টের প্রিন্ট টেমপলেট আছে (Documents - $ 31384.07.xlsx-এর শীট থেকে) —
// Required Documents-এ বাছা থাকলে ডকুমেন্ট সেটের প্রিন্টে এই ক্রমে আসে।
export const DOC_TEMPLATES: { key: string; name: string; title: string }[] = [
  { key: "bill1", name: "Bill Of Exchange 1", title: "Bill of Exchange 01" },
  { key: "bill2", name: "Bill Of Exchange 2", title: "Bill of Exchange 02" },
  { key: "deli", name: "Delivery Challan", title: "Delivery Challan" },
  { key: "tc", name: "Truck Challan", title: "Truck Challan" },
  { key: "comm", name: "Commercial Invoice", title: "Commercial Invoice" },
  { key: "pak", name: "Packing List", title: "Packing List" },
  { key: "bc", name: "BENEFICIARY'S CERTIFICATE", title: "Beneficiary's Certificate" },
  { key: "mushok", name: "Mushok-6.3", title: "Mushok-6.3" },
];

// ডকুমেন্টের রেফারেন্স — "Ref: FNJ/423/2026" (Export LC সিরিয়াল + LC-র সাল)। Mushok-6.3-এ ছাপা হয় না।
// "FNJ/423/2026" — Delivery/Truck Challan-এ TR/DC NO হিসেবে এটাই বসে
export function lcRefNo(serialNo: number | null | undefined, lcDate: string | null | undefined, beneficiary?: string | null): string {
  if (serialNo == null) return "";
  const code = beneficiary === "MK Accessories" ? "MK" : "FNJ";
  const year = (lcDate ?? "").slice(0, 4) || String(new Date().getFullYear());
  return `${code}/${serialNo}/${year}`;
}

export function lcRefText(serialNo: number | null | undefined, lcDate: string | null | undefined, beneficiary?: string | null): string {
  const no = lcRefNo(serialNo, lcDate, beneficiary);
  return no ? `Ref: ${no}` : "";
}

export function templatesFor(requiredDocuments: string[] | null | undefined) {
  const req = new Set((requiredDocuments ?? []).map((d) => d.toLowerCase()));
  return DOC_TEMPLATES.filter((t) => req.has(t.name.toLowerCase()));
}

export function docsWithoutTemplate(requiredDocuments: string[] | null | undefined): string[] {
  const known = new Set(DOC_TEMPLATES.map((t) => t.name.toLowerCase()));
  return (requiredDocuments ?? []).filter((d) => !known.has(d.toLowerCase()));
}
