import { calcAtCustomerLine } from "@/lib/atCommission";

// Commission — শুধু রিপোর্টিং, কোনো Journal Voucher নয়।
//   • এটি এক্সেসোরিজ (code "AT") → markup% + freight/pc (lib/atCommission.ts):
//       commission = Σ customerAmount − Σ আসল Amount
//   • বাকি commission_enabled customer → Invoice Total × commission_percentage%
//   • commission_enabled না হলে → null (রিপোর্টে আসবে না)
// এর সাথে প্রতি invoice-এ হাতে দেওয়া commission_adjustment (±) যোগ হয়ে Final Commission।

export type CommissionItem = {
  unit_price: number;
  quantity_pcs: number;
  amount: number;      // = round(unit_price × quantity_pcs) — DB generated column
  order_lbs: number;   // AT-এর জন্য: booking.required_lbs
  markup_pct: number;  // AT-এর জন্য: buyer.markup_percentage
};

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
