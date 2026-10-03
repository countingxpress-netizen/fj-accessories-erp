// মাসিক টপশীটের data-র ধরন ও যোগফলের হিসাব (pure — কোনো ডাটাবেস কল নেই)।
// lib/topSheet.ts (ERP থেকে শীট বানানো) ও lib/rawCost.ts (কাঁচামালের মাসিক দর) দুটোই এটা ব্যবহার করে;
// এডিটর/পুরনো import-এর জন্য lib/topSheet.ts থেকেও re-export করা আছে।

export const LBS_PER_BAG = 55;
/** Adhesive (কার্টনে গোনা) — কাঁচামালের মিশ্র দরের বাইরে, নিজের দরে */
export const ADHESIVE_CODE = "1204";
/** এম কে এক্সেসোরিজের গুদাম (নাম দিয়ে চেনা) — টপশীটে "এম কে" কলাম */
export const MK_WAREHOUSE_PATTERN = /\bmk\b|এম\s*কে/i;

// key = ERP উৎস (acct:<code> / party:<g|c>:<id>) — হাতে বদলানো নাম পরের মাসে বহাল রাখতে; হাতে যোগ করা সারিতে নেই
export type TsRow = { key?: string; label: string; amount: number };
export type TsLbsRow = { label: string; lbs: number };
export type TsMaterial = { name: string; ownBags: number; mkBags: number };

export type TopSheetData = {
  version: 1;
  year: number;
  month: number;
  parties: TsRow[];
  liabilities: TsRow[];
  otherAssets: TsRow[];
  expenses: TsRow[];
  materials: TsMaterial[];
  made: TsLbsRow[];   // বানানো আছে (+ Lbs)
  unmade: TsLbsRow[]; // বানানো বাকি (− Lbs)
  adhesiveCartons: number;
  adhesiveRate: number;
  opening: { lbs: number; amount: number; source: "snapshot" | "erp" };
  purchase: { lbs: number; amount: number };
  sales: { lbs: number; amount: number };
  rmSale: { lbs: number; amount: number };
  wastageSaleAmount: number;
  lillahPct: number;
  /** ERP-এর নিজস্ব হিসাবে (income − expense) এই মাসের লাভ/লস — শুধু তুলনার জন্য */
  erpNetProfit: number;
};

const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + (Number(f(r)) || 0), 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** শীটের সব যোগফল/ফলাফল — সেভ করা data থেকে সবসময় নতুন করে হিসাব হয় (এডিটরও এটাই ব্যবহার করে)। */
export function topSheetTotals(d: TopSheetData) {
  const partyTotal = sum(d.parties, (r) => r.amount);
  const liabilityTotal = sum(d.liabilities, (r) => r.amount);
  const otherAssetTotal = sum(d.otherAssets, (r) => r.amount);
  const expenseTotal = sum(d.expenses, (r) => r.amount);

  const ownBags = sum(d.materials, (m) => m.ownBags);
  const mkBags = sum(d.materials, (m) => m.mkBags);
  const madeLbs = sum(d.made, (r) => r.lbs);
  const unmadeLbs = sum(d.unmade, (r) => r.lbs);
  // খাতার মতো: মূল্য = ব্যাগ×৫৫-এর আসল Lbs × দর (আগে Lbs রাউন্ড করলে দু-চার দশ টাকা সরে যায়); Lbs দেখানো হয় রাউন্ড করে
  // বানানো আছে/বাকি — খাতার Excel-এর মতো আগে ব্যাগে (২ দশমিক) রূপান্তর, তারপর ব্যাগ × ৫৫
  const madeBags = r2(madeLbs / LBS_PER_BAG);
  const unmadeBags = r2(unmadeLbs / LBS_PER_BAG);
  const closingLbsExact = (ownBags + mkBags + madeBags - unmadeBags) * LBS_PER_BAG;
  const closingLbs = Math.round(closingLbsExact);

  const inLbs = d.opening.lbs + d.purchase.lbs;
  const inAmount = d.opening.amount + d.purchase.amount;
  const ratePerLbs = inLbs > 0 ? r2(inAmount / inLbs) : 0;
  const closingValue = Math.round(closingLbsExact * ratePerLbs);
  const adhesiveValue = r2(d.adhesiveCartons * d.adhesiveRate);
  const stockTotal = closingValue + adhesiveValue;

  const receivableTotal = partyTotal + otherAssetTotal; // মোট পাওনা (স্টক ছাড়া)
  const grandReceivable = receivableTotal + stockTotal;  // মোট পাওনা (স্টক সহ)
  const balanceProfit = r2(grandReceivable - liabilityTotal);
  const lillah = balanceProfit > 0 ? Math.round((balanceProfit * d.lillahPct) / 100) : 0;
  const omar = r2(balanceProfit - lillah);

  const wastageLbs = Math.round(inLbs - closingLbs - d.sales.lbs - d.rmSale.lbs);
  const outLbs = closingLbs + d.sales.lbs + d.rmSale.lbs + wastageLbs;
  const outAmount = closingValue + d.sales.amount + d.rmSale.amount + d.wastageSaleAmount;
  const grossProfit = r2(outAmount - inAmount);
  const netProfit = r2(grossProfit - expenseTotal);

  return {
    partyTotal, liabilityTotal, otherAssetTotal, expenseTotal,
    ownBags, mkBags, madeLbs, unmadeLbs, closingLbs,
    inLbs, inAmount, ratePerLbs, closingValue, adhesiveValue, stockTotal,
    receivableTotal, grandReceivable, balanceProfit, lillah, omar,
    wastageLbs, outLbs, outAmount, grossProfit, netProfit,
    difference: r2(netProfit - balanceProfit),
  };
}

export type TopSheetTotals = ReturnType<typeof topSheetTotals>;

const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Confirm করা মাসের নাম — "09.September-2026" */
export function confirmedSheetName(year: number, month: number): string {
  return `${String(month).padStart(2, "0")}.${EN_MONTHS[month - 1]}-${year}`;
}
