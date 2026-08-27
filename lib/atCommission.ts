// AT Accessories-এর "Submit to Customer" invoice-এ real Unit Price-এর উপর
// Buyer-ভিত্তিক Markup % এবং প্রতি পিস Order Lbs-ভিত্তিক অতিরিক্ত চার্জ যোগ করে
// customer-facing দাম বের করার শেয়ার্ড ফর্মুলা। print-customer পেজ এবং
// Sales Invoices লিস্টের Commission কলাম — দুই জায়গাতেই এই একই লজিক ব্যবহার হয়,
// যাতে দুই জায়গার হিসাব সবসময় মেলে।

export const AT_DEFAULT_MARKUP_PERCENTAGE = 2;
export const AT_FREIGHT_PER_PIECE = 0.05;
// পুরনো Excel-এর "LBS Munna" ফর্মুলা — Order Lbs / 116 = Commission Lbs
export const AT_COMMISSION_LBS_DIVISOR = 116;

export function calcAtCustomerLine(
  actualPrice: number,
  qty: number,
  orderLbs: number,
  markupPct: number
): { customerUnitPrice: number; customerAmount: number } {
  const freightPerPc = qty > 0 && orderLbs > 0 ? Math.round(((orderLbs / qty) + AT_FREIGHT_PER_PIECE) * 100) / 100 : 0;
  const customerUnitPrice = Math.round(actualPrice * (1 + markupPct / 100) * 100) / 100 + freightPerPc;
  const customerAmount = Math.round(customerUnitPrice * qty);
  return { customerUnitPrice, customerAmount };
}
