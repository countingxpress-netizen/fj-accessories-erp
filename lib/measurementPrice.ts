// মেজারমেন্ট-ভিত্তিক দাম মনে রাখা — শুধু buyers.remember_measurement_price = true বায়ারদের জন্য।
// মিল = measurement_type + unit + L/W/Flap/Gusset/Pillow + PI thickness (স্টাইল ধরা হয় না)।
// PI ফর্মে ফর্মুলার দামই বসে, এখান থেকে পাওয়া দাম পাশে "আগের দাম" বাটন হিসেবে দেখায়।

export type MeasurementPriceRow = {
  id: string; buyer_id: string; match_key: string;
  measurement_type: string; measurement_unit: string;
  length_val: number; width_val: number; flap_val: number | null; gusset_val: number | null; pillow_val: number | null;
  thickness_mm: number | null;
  price: number; currency: string; price_basis: string;
  source: string; last_pi_id: string | null; updated_at: string | null;
};

type SizeLike = {
  measurement_type: string; measurement_unit: string;
  length_val: number | null; width_val: number | null;
  flap_val?: number | null; gusset_val?: number | null; pillow_val?: number | null;
};

function n(v: number | string | null | undefined): string {
  const x = Number(v) || 0;
  return String(Math.round(x * 10000) / 10000);
}

// টাইপ-অনুযায়ী অপ্রাসঙ্গিক ফিল্ড (যেমন Simple বুকিংয়ে পড়ে থাকা পুরনো Flap মান) key-তে ০ ধরা হয়
export function measurementPriceKey(s: SizeLike, thicknessMm: number | null | undefined): string {
  const t = (s.measurement_type || "").trim().toLowerCase();
  const flap = t === "adhesive" || t === "flap_gusset" ? s.flap_val : 0;
  const gusset = t === "gusset" || t === "flap_gusset" ? s.gusset_val : 0;
  const pillow = t === "pillow" ? s.pillow_val : 0;
  return [
    t,
    (s.measurement_unit || "").trim().toLowerCase(),
    n(s.length_val), n(s.width_val), n(flap), n(gusset), n(pillow),
    n(thicknessMm),
  ].join("|");
}

// Manual PI লাইনের মুক্ত-টেক্সট মেজারমেন্ট থেকে সাইজ বের করা। Network-এর PI-তে যেমন লেখা থাকে:
//   "L- 85 x W-45 cm"                         → simple
//   "L- 75 cm x W-45 cm, Gusset- 15+15cm"     → gusset (G=15, প্রতি পাশ)
//   "L-60 cm, W-45 cm (Gasset 15 cm x 15 cm)" → gusset
//   "L- 45 + F-5 X W- 30 Cm"                  → adhesive
//   "85x45 cm" / "45+5x30" / "105x68x8"       → লেবেল ছাড়া (বুকিং Bulk Paste-এর মতো)
// পড়া না গেলে null — তখন সেই লাইনের দাম মনে রাখা হয় না।
export function parseMeasurementText(text: string | null | undefined): SizeLike | null {
  if (!text) return null;
  const t = text.replace(/×/g, "x").toLowerCase();
  const unit = /cm/.test(t) ? "cm" : "inch";
  const grab = (re: RegExp) => { const m = t.match(re); return m ? parseFloat(m[1]) : null; };
  const L = grab(/\bl(?:ength)?\s*[-:=]?\s*(\d+(?:\.\d+)?)/);
  const W = grab(/\bw(?:idth)?\s*[-:=]?\s*(\d+(?:\.\d+)?)/);
  if (L != null && W != null) {
    const G = grab(/\b(?:g|gusset|gasset)\s*[-:=]?\s*(\d+(?:\.\d+)?)/);
    const F = grab(/\b(?:f|flap)\s*[-:=]?\s*(\d+(?:\.\d+)?)/);
    const P = grab(/\b(?:p|pillow)\s*[-:=]?\s*(\d+(?:\.\d+)?)/);
    const type = G != null && F != null ? "flap_gusset" : G != null ? "gusset" : F != null ? "adhesive" : P != null ? "pillow" : "simple";
    return { measurement_type: type, measurement_unit: unit, length_val: L, width_val: W, flap_val: F, gusset_val: G, pillow_val: P };
  }
  const bare = t.replace(/(cm|inch|in|pcs?)/g, "").replace(/\s+/g, "");
  let m = bare.match(/^(\d+(?:\.\d+)?)\+(\d+(?:\.\d+)?)\+(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/);
  if (m) return { measurement_type: "flap_gusset", measurement_unit: unit, length_val: +m[1], flap_val: +m[2], gusset_val: +m[3], width_val: +m[4] };
  m = bare.match(/^(\d+(?:\.\d+)?)\+(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/);
  if (m) return { measurement_type: "adhesive", measurement_unit: unit, length_val: +m[1], flap_val: +m[2], width_val: +m[3] };
  m = bare.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/);
  if (m) return { measurement_type: "gusset", measurement_unit: unit, length_val: +m[1], width_val: +m[2], gusset_val: +m[3] };
  m = bare.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/);
  if (m) return { measurement_type: "simple", measurement_unit: unit, length_val: +m[1], width_val: +m[2] };
  return null;
}

// PI-র buyer_name (Manual PI-তে টেক্সট, যেমন "PEPCO") → সেই কাস্টমারের বায়ার (নাম case-insensitive)
export function matchBuyerByName<T extends { name: string; customer_id?: string }>(
  buyers: T[], name: string | null | undefined, customerId?: string | null
): T | undefined {
  const n = (name || "").trim().toLowerCase();
  if (!n) return undefined;
  return buyers.find((b) => (!customerId || b.customer_id === customerId) && b.name.trim().toLowerCase() === n);
}

export function findMeasurementPrice(
  rows: MeasurementPriceRow[], buyerId: string | null | undefined, s: SizeLike, thicknessMm: number | null | undefined
): MeasurementPriceRow | undefined {
  if (!buyerId) return undefined;
  const key = measurementPriceKey(s, thicknessMm);
  const exact = rows.find((r) => r.buyer_id === buyerId && r.match_key === key);
  if (exact) return exact;
  // থিকনেস না মিললে — শুধু সাইজ মিলিয়ে সেই সাইজের সবচেয়ে নতুন দাম (বাটনে থিকনেস উল্লেখ থাকে)
  const size = sizeOnlyKey(key);
  return rows
    .filter((r) => r.buyer_id === buyerId && sizeOnlyKey(r.match_key) === size)
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))[0];
}

// match_key-এর শেষ অংশ থিকনেস — সেটা বাদ দিয়ে শুধু সাইজ
function sizeOnlyKey(matchKey: string): string {
  return matchKey.slice(0, matchKey.lastIndexOf("|"));
}

// মনে রাখা দামটা অন্য থিকনেসের হলে বাটনে দেখানোর নোট, যেমন " (9mm-এর দাম)"; মিললে ফাঁকা
export function thicknessNote(row: MeasurementPriceRow, thicknessMm: number | null | undefined): string {
  const want = Number(thicknessMm) || 0;
  const have = Number(row.thickness_mm) || 0;
  if (Math.abs(want - have) < 0.0001) return "";
  return have ? ` (${have}mm-এর দাম)` : " (থিকনেস ছাড়া দাম)";
}

// মনে রাখা দামকে PI-র currency/basis-এ আনা (USD↔BDT হলে exchange rate দিয়ে, pcs↔dzn হলে ×/÷12)
export function convertMeasurementPrice(
  row: MeasurementPriceRow, currency: string, basis: "pcs" | "dzn", exchangeRate: number
): number {
  let price = Number(row.price) || 0;
  const rate = exchangeRate || 107;
  if (row.currency !== currency) {
    if (row.currency === "USD" && currency === "BDT") price = price * rate;
    else if (row.currency === "BDT" && currency === "USD") price = price / rate;
  }
  if (row.price_basis === "dzn" && basis === "pcs") price = price / 12;
  if (row.price_basis === "pcs" && basis === "dzn") price = price * 12;
  return price;
}

export function formatSize(s: SizeLike): string {
  const u = s.measurement_unit, L = s.length_val, W = s.width_val, F = s.flap_val, G = s.gusset_val, P = s.pillow_val;
  if (s.measurement_type === "simple") return `L-${L} x W-${W}${u}`;
  if (s.measurement_type === "gusset") return `L-${L} x W-${W} + G-${G}${u}`;
  if (s.measurement_type === "adhesive") return `L-${L} + F-${F} x W-${W}${u}`;
  if (s.measurement_type === "flap_gusset") return `L-${L} + F-${F} + G-${G} x W-${W}${u}`;
  if (s.measurement_type === "pillow") return `L-${L} + P-${P} x W-${W}${u}`;
  return "-";
}

// PI সেভের পর — সেই PI-র লাইনগুলো থেকে (যাদের বায়ারে remember_measurement_price চালু)
// সাইজ + PI thickness অনুযায়ী দাম upsert করে। বুকিং-লাইন: বুকিংয়ের সাইজ; Manual লাইন:
// measurement টেক্সট parse করে (পড়া না গেলে বাদ)।
// ব্যর্থ হলে শুধু error message রিটার্ন করে — PI সেভ আটকায় না।
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recordPiMeasurementPrices(supabase: any, piId: string): Promise<string | null> {
  const { data: pi, error: piErr } = await supabase
    .from("proforma_invoices").select("id, currency, customer_id, buyer_name").eq("id", piId).single();
  if (piErr || !pi) return piErr?.message ?? "PI পাওয়া যায়নি";

  const { data: items, error } = await supabase
    .from("pi_items")
    .select("booking_id, measurement, price_unit, price_basis, pi_thickness_mm, bookings(buyer_id, measurement_type, measurement_unit, length_val, width_val, flap_val, gusset_val, pillow_val, buyers(remember_measurement_price))")
    .eq("pi_id", piId);
  if (error) return error.message;

  // Manual লাইনের (booking_id নেই) বায়ার = PI-র buyer_name → সেই কাস্টমারের বায়ার (নাম মিলিয়ে)
  let manualBuyerId: string | null = null;
  if (pi.customer_id && pi.buyer_name) {
    const { data: buyers } = await supabase
      .from("buyers").select("id, name, customer_id, remember_measurement_price").eq("customer_id", pi.customer_id);
    const mb = matchBuyerByName((buyers ?? []) as { id: string; name: string; customer_id: string; remember_measurement_price: boolean }[], pi.buyer_name, pi.customer_id);
    if (mb?.remember_measurement_price) manualBuyerId = mb.id;
  }

  const byKey = new Map<string, Record<string, unknown>>();
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const it of (items ?? []) as any[]) {
    let buyerId: string | null = null;
    let size: SizeLike | null = null;
    if (it.booking_id) {
      const b = it.bookings;
      if (!b?.buyer_id || !b.buyers?.remember_measurement_price) continue;
      buyerId = b.buyer_id;
      size = b;
    } else {
      if (!manualBuyerId) continue;
      buyerId = manualBuyerId;
      size = parseMeasurementText(it.measurement);
    }
    if (!buyerId || !size) continue;
    const price = Number(it.price_unit) || 0;
    if (price <= 0) continue;
    const thickness = it.pi_thickness_mm != null ? Number(it.pi_thickness_mm) : null;
    const key = measurementPriceKey(size, thickness);
    byKey.set(`${buyerId}::${key}`, {
      buyer_id: buyerId, match_key: key,
      measurement_type: size.measurement_type, measurement_unit: size.measurement_unit,
      length_val: size.length_val ?? 0, width_val: size.width_val ?? 0,
      flap_val: size.flap_val ?? null, gusset_val: size.gusset_val ?? null, pillow_val: size.pillow_val ?? null,
      thickness_mm: thickness,
      price, currency: pi.currency || "USD", price_basis: it.price_basis === "dzn" ? "dzn" : "pcs",
      source: "pi", last_pi_id: piId, updated_at: now,
    });
  }
  if (byKey.size === 0) return null;

  const { error: upErr } = await supabase
    .from("buyer_measurement_prices")
    .upsert(Array.from(byKey.values()), { onConflict: "buyer_id,match_key" });
  return upErr ? upErr.message : null;
}
