// Journal Voucher-এর উৎস (journal_vouchers.source) → বাংলা লেবেল।
// 'manual' = হাতে-বানানো (Journal Voucher form); বাকি সব সিস্টেম-জেনারেটেড।

export const JOURNAL_SOURCE_LABELS: Record<string, string> = {
  manual: "হাতে",
  sales_invoice: "Sales Invoice",
  purchase: "Purchase",
  payment_in: "Payment (আদায়)",
  payment_out: "Payment (প্রদান)",
  expense: "Expense",
  payroll: "Payroll",
  inventory: "Inventory / COGS",
  freight: "Freight",
  bank_charge: "Bank Charge",
  opening: "Opening",
  profit_distribution: "Profit বণ্টন",
  wastage_sale: "Wastage বিক্রি",
  bank_txn: "Bank",
  cash_txn: "Cash",
};

export function journalSourceLabel(source: string | null | undefined): string {
  if (!source) return "হাতে";
  return JOURNAL_SOURCE_LABELS[source] ?? source;
}

export function isManualJournal(source: string | null | undefined): boolean {
  return !source || source === "manual";
}
