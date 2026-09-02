// Effective-date-wise rate resolution — `rate_history` টেবিলের সাথে ব্যবহৃত।
//
// Customer Price/Lbs আর Buyer PI Rate/Lbs — দুটোই তারিখ ধরে বদলায়। Sales Invoice
// booking-এর `booking_date` ধরে, Proforma-ও তাই। একটা history row মানে "এই
// তারিখ থেকে এই rate কার্যকর"।

export type RateHistoryRow = {
  effective_from: string; // 'YYYY-MM-DD'
  rate: number | string;
};

// `date`-এ কার্যকর rate: effective_from <= date এমন row-গুলোর মধ্যে সবচেয়ে নতুনটা।
// history খালি → fallback। date পুরনো/অজানা হয়ে সব row-এর আগে পড়লে → প্রাচীনতম
// জানা rate (fallback নয়, কারণ fallback = আজকের দাম, পুরনো booking-এ ভুল হবে)।
export function resolveRate(
  history: RateHistoryRow[] | undefined | null,
  date: string | null | undefined,
  fallback: number | null | undefined,
): number {
  const fb = Number(fallback ?? 0);
  const rows = (history ?? [])
    .slice()
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1)); // effective_from desc

  if (rows.length === 0) return fb;

  if (date) {
    const hit = rows.find((r) => r.effective_from <= date);
    if (hit) return Number(hit.rate);
  }

  return Number(rows[rows.length - 1].rate); // প্রাচীনতম জানা rate
}

// আজকের দিনে কার্যকর rate — master টেবিলের cached কলাম (price_per_lbs /
// rate_per_lbs_value) sync রাখতে ব্যবহৃত।
export function currentRate(
  history: RateHistoryRow[] | undefined | null,
  fallback: number | null | undefined,
): number {
  const today = new Date().toISOString().slice(0, 10);
  return resolveRate(history, today, fallback);
}
