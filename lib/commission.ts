import { calcAtCustomerLine } from "@/lib/atCommission";

// Commission — শুধু রিপোর্টিং, কোনো Journal Voucher নয়।
//   • এটি এক্সেসোরিজ (code "AT") → markup% + freight/pc (lib/atCommission.ts):
//       commission = Σ customerAmount − Σ আসল Amount
//   • বাকি commission_enabled customer → Invoice Total × commission_percentage%
//   • commission_enabled না হলে → null (রিপোর্টে আসবে না)
// এর সাথে প্রতি invoice-এ হাতে দেওয়া commission_adjustment (±) যোগ হয়ে Final Commission।

export type CommissionMeasurement = {
  type: string | null;
  length: number | null;
  width: number | null;
  flap: number | null;
  gusset: number | null;
  unit: string | null;
};

export type CommissionItem = {
  unit_price: number;
  quantity_pcs: number;
  amount: number;      // = round(unit_price × quantity_pcs) — DB generated column
  order_lbs: number;   // AT-এর জন্য: booking.required_lbs
  markup_pct: number;  // AT-এর জন্য: buyer.markup_percentage
  buyer_name?: string | null;
  measurement?: CommissionMeasurement | null;
};

// এই বায়ারগুলোর কোনো লাইনেই কমিশন/Submit to Customer markup হবে না (ব্যবহারকারীর সরাসরি নির্দেশ)
const COMMISSION_EXCLUDED_BUYERS = ["H&M-M", "Head Office"];

// শুধু বায়ার H&M + এই নির্দিষ্ট মেজারমেন্টের লাইনেও কমিশন হবে না
const COMMISSION_EXCLUDED_HM_MEASUREMENTS: CommissionMeasurement[] = [
  { type: "gusset", length: 85, width: 70, flap: null, gusset: 14, unit: "cm" },
  { type: "adhesive", length: 100, width: 10, flap: null, gusset: null, unit: "cm" },
];

function measurementMatches(a: CommissionMeasurement, b: CommissionMeasurement | null | undefined): boolean {
  if (!b) return false;
  return (
    a.type === b.type && a.unit === b.unit &&
    Number(a.length) === Number(b.length) && Number(a.width) === Number(b.width) &&
    (a.type === "gusset" ? Number(a.gusset) === Number(b.gusset) : true) &&
    (a.type === "adhesive" ? Number(a.flap ?? 0) === Number(b.flap ?? 0) : true)
  );
}

// নির্দিষ্ট Buyer বা Buyer+Measurement কম্বিনেশনের লাইনে কমিশন/মার্কআপ বাদ দিতে হবে কিনা
export function isCommissionExcludedLine(buyerName: string | null | undefined, measurement?: CommissionMeasurement | null): boolean {
  if (!buyerName) return false;
  if (COMMISSION_EXCLUDED_BUYERS.includes(buyerName)) return true;
  if (buyerName === "H&M") {
    return COMMISSION_EXCLUDED_HM_MEASUREMENTS.some((ex) => measurementMatches(ex, measurement));
  }
  return false;
}

export function calcInvoiceCommission(
  customerCode: string | null,
  commissionEnabled: boolean,
  commissionPercentage: number,
  items: CommissionItem[],
): number | null {
  if (!commissionEnabled) return null;

  if (customerCode === "AT") {
    let real = 0;
    let cust = 0;
    for (const it of items) {
      if (isCommissionExcludedLine(it.buyer_name, it.measurement)) continue; // এই লাইনে কমিশন হবে না
      real += it.amount || 0;
      const { customerAmount } = calcAtCustomerLine(
        it.unit_price || 0, it.quantity_pcs || 0, it.order_lbs || 0, it.markup_pct || 0,
      );
      cust += customerAmount;
    }
    return cust - real;
  }

  const total = items.reduce((s, it) => s + (it.amount || 0), 0);
  return Math.round((total * (commissionPercentage || 0)) / 100);
}
