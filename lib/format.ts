// সংখ্যা ফরম্যাটিং — ভারতীয় গ্রুপিং (lakh/crore): 1,00,000.00
//
//   money(n) → টাকার অঙ্ক, সবসময় ২ দশমিক    →  "1,00,000.00"
//   qty(n)   → পরিমাণ, সর্বোচ্চ ২ দশমিক       →  "1,00,000"  /  "1,234.5"
//
// অ-সংখ্যা / NaN হলে 0 ধরা হয়।

const safe = (n: number): number => (typeof n === "number" && Number.isFinite(n) ? n : 0);

export const money = (n: number): string =>
  safe(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const qty = (n: number): string =>
  safe(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
