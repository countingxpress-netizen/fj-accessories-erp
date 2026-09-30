// Export LC-র Master PI — LC-তে বাছাই করা সব PI-র লাইন একসাথে এক PI-তে (আসল
// "Documents - $ ....xlsx"-এর "PI" শীটের মতো)। আসল PI-গুলোর আলাদা কপি (snapshot) —
// এখানে এডিট করলে মূল PI বদলায় না। LC-র সব ডকুমেন্ট (Bill of Exchange, Challan,
// Commercial Invoice, Packing List ...) এই Master PI থেকে তৈরি হয়।
import type { SupabaseClient } from "@supabase/supabase-js";
import { amountInWords } from "@/lib/numberToWords";

export type MasterPiHeader = {
  pi_ref_text: string;
  buyer_name: string;
  buyer_address: string;
  advising_bank_name: string;
  advising_bank_branch: string;
  advising_bank_address: string;
  advising_bank_swift: string;
  discount_pct: number;
  discount_amount: number | null; // null = auto
  hs_code: string;
  bin_no: string;
  beneficiary_bin: string;
  terms_conditions: string;
  price_decimals: number;
};

export type MasterPiLine = {
  id?: string; // DB-তে থাকলে (এডিট পেজে)
  key: string; // UI key
  source_pi_id: string | null;
  source_pi_item_id: string | null;
  description: string;
  measurement: string;
  qty_pcs: number;
  price_unit: number;
  price_basis: "pcs" | "dzn";
};

export type SourcePi = {
  id: string;
  pi_no: string;
  pi_date: string | null;
  garments_name: string | null;
  garments_address: string | null;
  advising_bank_name: string | null;
  advising_bank_branch: string | null;
  advising_bank_address: string | null;
  advising_bank_swift: string | null;
  discount_type: string | null;
  discount_value: number | null;
  hs_code: string | null;
  bin_no: string | null;
  terms_conditions: string | null;
  price_decimals: number | null;
  customers: { name: string; address: string | null } | null;
  pi_items: {
    id: string; sl_no: number | null; description: string | null; measurement: string | null;
    qty_pcs: number; price_unit: number; price_basis: string;
  }[];
};

export const SOURCE_PI_SELECT = `id, pi_no, pi_date, garments_name, garments_address,
  advising_bank_name, advising_bank_branch, advising_bank_address, advising_bank_swift,
  discount_type, discount_value, hs_code, bin_no, terms_conditions, price_decimals,
  customers(name, address),
  pi_items(id, sl_no, description, measurement, qty_pcs, price_unit, price_basis)`;

export const DEFAULT_BENEFICIARY_BIN = "000113803-1201";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function lineAmount(qty: number, price: number, basis: string): number {
  return round2(basis === "dzn" ? (qty / 12) * price : qty * price);
}

export function masterTotals(header: Pick<MasterPiHeader, "discount_pct" | "discount_amount">, lines: { qty_pcs: number; price_unit: number; price_basis: string }[]) {
  const subtotal = round2(lines.reduce((s, l) => s + lineAmount(Number(l.qty_pcs) || 0, Number(l.price_unit) || 0, l.price_basis), 0));
  const totalPcs = lines.reduce((s, l) => s + (Number(l.qty_pcs) || 0), 0);
  const discount = header.discount_amount != null
    ? round2(Number(header.discount_amount))
    : round2((subtotal * (Number(header.discount_pct) || 0)) / 100);
  return { subtotal, discount, total: round2(subtotal - discount), totalPcs, totalDzn: round2(totalPcs / 12) };
}

// "PI/FNJ-1638-AT/2026 DATE: 14.05.2026" — Excel-এর মতো ডট-সেপারেটেড তারিখ
export function dotDate(d: string | null | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  return y && m && day ? `${day}.${m}.${y}` : d;
}

export function buildPiRefText(pis: Pick<SourcePi, "pi_no" | "pi_date">[]): string {
  if (!pis.length) return "";
  return "PROFORMA INVOICE NO. " + pis.map((p) => `${p.pi_no} DATE: ${dotDate(p.pi_date)}`).join(", ");
}

// PI-র নিজের ক্রমে (তারিখ, তারপর PI No) — Master PI-র লাইনও এই ক্রমে বসে
export function sortSourcePis<T extends Pick<SourcePi, "pi_no" | "pi_date">>(pis: T[]): T[] {
  return [...pis].sort((a, b) => (a.pi_date ?? "").localeCompare(b.pi_date ?? "") || a.pi_no.localeCompare(b.pi_no));
}

export function linesFromPi(pi: SourcePi): MasterPiLine[] {
  return [...(pi.pi_items ?? [])]
    .sort((a, b) => (a.sl_no ?? 0) - (b.sl_no ?? 0))
    .map((it) => ({
      key: `${pi.id}:${it.id}`,
      source_pi_id: pi.id,
      source_pi_item_id: it.id,
      description: it.description ?? "",
      measurement: it.measurement ?? "",
      qty_pcs: Number(it.qty_pcs) || 0,
      price_unit: Number(it.price_unit) || 0,
      price_basis: it.price_basis === "dzn" ? "dzn" : "pcs",
    }));
}

// Percentage-discount PI-গুলোর মধ্যে সবচেয়ে বেশিবার আসা % (AT-র universal 2.5%) — কোনো PI-তে
// fixed discount থাকলেও (যেমন PI 1704) Master PI-তে % টাই বসে; দরকারে এডিটরে বদলানো যায়
function commonDiscountPct(pis: SourcePi[]): number {
  const counts = new Map<number, number>();
  for (const p of pis) {
    if (p.discount_type !== "percentage") continue;
    const v = Number(p.discount_value) || 0;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = 0, bestCount = 0;
  for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c; }
  return best;
}

export function buildMasterHeader(pis: SourcePi[], applicant: string): MasterPiHeader {
  const sorted = sortSourcePis(pis);
  const first = sorted[0];
  const [appName, ...appAddr] = (applicant ?? "").split("\n");
  const buyerName = appName?.trim() || first?.garments_name || first?.customers?.name || "";
  const buyerAddress = appName?.trim()
    ? appAddr.join("\n").trim()
    : first?.garments_address || first?.customers?.address || "";
  return {
    pi_ref_text: buildPiRefText(sorted),
    buyer_name: buyerName,
    buyer_address: buyerAddress,
    advising_bank_name: first?.advising_bank_name ?? "",
    advising_bank_branch: first?.advising_bank_branch ?? "",
    advising_bank_address: first?.advising_bank_address ?? "",
    advising_bank_swift: first?.advising_bank_swift ?? "",
    discount_pct: commonDiscountPct(sorted),
    discount_amount: null,
    hs_code: first?.hs_code || "3923.21.00",
    bin_no: first?.bin_no || "",
    beneficiary_bin: DEFAULT_BENEFICIARY_BIN,
    terms_conditions: first?.terms_conditions ?? "",
    price_decimals: first?.price_decimals ?? 4,
  };
}

// PI বাছাই বদলালে: যেগুলো এখনো বাছা সেগুলোর (হয়তো এডিট করা) লাইন রাখা, নতুন PI-র লাইন
// যোগ, বাদ পড়া PI-র লাইন সরানো। হাতে যোগ করা লাইন (source নেই) সবসময় থাকে।
export function mergeLines(existing: MasterPiLine[], pis: SourcePi[]): MasterPiLine[] {
  const selectedIds = new Set(pis.map((p) => p.id));
  const kept = existing.filter((l) => !l.source_pi_id || selectedIds.has(l.source_pi_id));
  const presentPiIds = new Set(kept.map((l) => l.source_pi_id).filter(Boolean));
  const added = sortSourcePis(pis).filter((p) => !presentPiIds.has(p.id)).flatMap(linesFromPi);
  return [...kept, ...added];
}

export type MasterPiRow = MasterPiHeader & { id: string; lc_id: string };

// Master PI সেভ — হেডার upsert; লাইন id দিয়ে update/insert/delete (সব মুছে নতুন করে
// insert করলে ডকুমেন্ট সেটের লাইন-Qty cascade-এ মুছে যেত, তাই diff করে)
export async function saveMasterPi(
  supabase: SupabaseClient, lcId: string, header: MasterPiHeader, lines: MasterPiLine[],
): Promise<string | null> {
  const { data: master, error: hErr } = await supabase
    .from("lc_master_pis")
    .upsert({ lc_id: lcId, ...header, updated_at: new Date().toISOString() }, { onConflict: "lc_id" })
    .select("id").single();
  if (hErr || !master) return hErr?.message ?? "Master PI সেভ ব্যর্থ";

  const { data: existing } = await supabase.from("lc_master_pi_items").select("id").eq("master_pi_id", master.id);
  const keepIds = new Set(lines.map((l) => l.id).filter(Boolean) as string[]);
  const toDelete = (existing ?? []).map((r: any) => r.id).filter((id: string) => !keepIds.has(id));
  if (toDelete.length) {
    const { error } = await supabase.from("lc_master_pi_items").delete().in("id", toDelete);
    if (error) return error.message;
  }

  const rows = lines.map((l, i) => ({
    master_pi_id: master.id, sl_no: i + 1,
    source_pi_id: l.source_pi_id, source_pi_item_id: l.source_pi_item_id,
    description: l.description || null, measurement: l.measurement || null,
    qty_pcs: Number(l.qty_pcs) || 0, price_unit: Number(l.price_unit) || 0, price_basis: l.price_basis,
  }));
  for (let i = 0; i < lines.length; i++) {
    const id = lines[i].id;
    if (id) {
      const { error } = await supabase.from("lc_master_pi_items").update(rows[i]).eq("id", id);
      if (error) return error.message;
    }
  }
  const inserts = rows.filter((_, i) => !lines[i].id);
  if (inserts.length) {
    const { error } = await supabase.from("lc_master_pi_items").insert(inserts);
    if (error) return error.message;
  }
  return null;
}

// ডকুমেন্ট সেটের (partial shipment) হিসাব — লাইনপ্রতি সেটের Qty × Master PI-র দাম;
// Discount = Master PI-র discount × (সেট subtotal / Master subtotal) — পুরো Qty-র সেটে
// তাই Master PI-র discount হুবহু (হাতে বসানো -0.01 সহ) মিলে যায়।
export type MasterItemRow = {
  id: string; sl_no: number; description: string | null; measurement: string | null;
  qty_pcs: number; price_unit: number; price_basis: string;
};
export function setTotals(
  master: Pick<MasterPiHeader, "discount_pct" | "discount_amount">,
  masterItems: MasterItemRow[],
  setItems: { master_item_id: string; qty_pcs: number }[],
) {
  const qtyById = new Map(setItems.map((s) => [s.master_item_id, Number(s.qty_pcs) || 0]));
  const rows = [...masterItems]
    .sort((a, b) => a.sl_no - b.sl_no)
    .filter((m) => (qtyById.get(m.id) ?? 0) > 0)
    .map((m) => {
      const q = qtyById.get(m.id) ?? 0;
      return { item: m, qty: q, amount: lineAmount(q, Number(m.price_unit), m.price_basis) };
    });
  const mt = masterTotals(master, masterItems);
  const subtotal = round2(rows.reduce((s, r) => s + r.amount, 0));
  const discount = mt.subtotal ? round2((mt.discount * subtotal) / mt.subtotal) : 0;
  const totalPcs = rows.reduce((s, r) => s + r.qty, 0);
  return { rows, subtotal, discount, total: round2(subtotal - discount), totalPcs, totalDzn: round2(totalPcs / 12) };
}

// "US DOLLAR THIRTY ONE THOUSAND ... AND CENTS ZERO SEVEN ONLY." — আসল ডকুমেন্টের মতো
// ১-৯ সেন্ট "ZERO SEVEN" লেখা হয়
export function usdWordsUpper(total: number): string {
  let w = amountInWords(round2(total), "USD");
  const cents = Math.round((round2(total) - Math.floor(round2(total))) * 100);
  if (cents > 0 && cents < 10) w = w.replace(/Cents (\w+) Only$/, "Cents Zero $1 Only");
  return w.toUpperCase() + ".";
}

// lc_register.drafts_at → Bill of Exchange-এর tenor টেক্সট
export function tenorText(draftsAt: string | null | undefined): string {
  if (!draftsAt || draftsAt === "at_sight") return "AT SIGHT";
  const m = /^(\d+)_days_sight$/.exec(draftsAt);
  if (m) return `AT ${m[1]} DAYS SIGHT`;
  return draftsAt.toUpperCase().startsWith("AT ") ? draftsAt.toUpperCase() : `AT ${draftsAt.toUpperCase()}`;
}

// Net/Gross weight লাইনপ্রতি ভাগ — Excel: ROUND(TotalWeight × LineAmount / Subtotal, 2)
export function splitWeight(total: number | null | undefined, amounts: number[]): number[] {
  const t = Number(total) || 0;
  const sum = amounts.reduce((s, a) => s + a, 0);
  if (!t || !sum) return amounts.map(() => 0);
  return amounts.map((a) => round2((t * a) / sum));
}
