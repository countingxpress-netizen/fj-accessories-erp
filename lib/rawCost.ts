/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows, fetchAllRowsIn } from "@/lib/fetchAll";
import { monthRange } from "@/lib/payroll";
import { dhakaTodayStr } from "@/lib/datePresets";
import { ADHESIVE_CODE, topSheetTotals, type TopSheetData } from "@/lib/topSheetCalc";

// কাঁচামালের মাসিক দর (মাসিক টপশীটের নিয়মে) — 2026-10 থেকে (user-confirmed 2026-10-04)।
//
//   D দিনের দর = (মাসের Opening মূল্য + মাসের শুরু থেকে D পর্যন্ত ক্রয় + Freight)
//               ÷ (Opening Lbs + D পর্যন্ত ক্রয়ের Lbs)            — r2, TopSheet-এর "প্রতি Lbs ক্রয়মূল্য"-র মতো
//   • সব কাঁচামালের (LLDPE/LDPE/PP/Chips/…) একটাই মিশ্র দর; Adhesive (1204, কার্টন) একই সূত্রে নিজের দর।
//   • Opening = আগের মাসের **confirmed** টপশীটের closing (Lbs/মূল্য, Adhesive কার্টন/মূল্য);
//     আগের মাস confirm না হলে খাতা থেকে (মাস-শেষের stock_ledger Lbs + inventory account-এর GL মূল্য)।
//   • মাস confirm না হওয়া পর্যন্ত দর পাকা না — ক্রয়/Freight বদলালে recostOpenMonths ওই মাসের সব খরচ
//     (booking issue → invoice COGS, Raw Material বিক্রি, Recycled Chips বিক্রি, booking-এর extra
//     wastage, Material খরচ) নতুন দরে বসায় — JV নম্বর একই থাকে, শুধু অঙ্ক বদলায়।
//   • confirm করা মাসে দর lock — নতুন এন্ট্রি টপশীটের চূড়ান্ত দরে (ratePerLbs / adhesiveRate)।
//   • RAW_COST_RULE_START-এর আগের মাস কখনো recost হয় না; সেগুলো confirm না থাকলে পুরনো avg_cost_per_lbs।
// Confirm / Un-confirm: lib/topSheetConfirm.ts।

type Client = SupabaseClient | any;

export const RAW_COST_RULE_START = "2026-10";
const WIP_CODE = "1220";
const FG_CODE = "1210";
const COGS_CODE = "5050";
const LOSS_CODE = "5600";
const RECYCLED_CODE = "1203";
const FALLBACK_INV_CODE = "1299";

const r2 = (n: number) => Math.round(n * 100) / 100;
const one = (x: any) => (Array.isArray(x) ? x[0] : x);
const same = (a: number, b: number) => Math.abs(a - b) < 0.005;

export const ymOf = (date: string) => date.slice(0, 7);
function ymParts(ym: string) {
  const [year, month] = ym.split("-").map(Number);
  return { year, month };
}
function prevYm(ym: string) {
  const { year, month } = ymParts(ym);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}
function nextYm(ym: string) {
  const { year, month } = ymParts(ym);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}
export const isAdhesiveCode = (code: string | null | undefined) => code === ADHESIVE_CODE;

type SheetRow = { id: string; year: number; month: number; data: TopSheetData; confirmed_at: string | null };

/** একটা মাসের টপশীট row (confirmed_at সহ) — migration না থাকলে/না পেলে null */
async function loadSheet(supabase: Client, ym: string): Promise<SheetRow | null> {
  const { year, month } = ymParts(ym);
  const { data, error } = await supabase
    .from("month_topsheets").select("id, year, month, data, confirmed_at").eq("year", year).eq("month", month).maybeSingle();
  if (error || !data) return null;
  return data as SheetRow;
}

export type RawCostContext = {
  ym: string;
  start: string;
  end: string;
  /** confirm করা মাস — দর lock (টপশীটের চূড়ান্ত দর) */
  locked: { poly: number; adhesive: number } | null;
  opening: { lbs: number; value: number; adhQty: number; adhValue: number; source: "confirmed" | "erp" };
  /** মাসের ক্রয় (Freight = শুধু মূল্য, Lbs 0) — তারিখ ক্রমে */
  poly: { date: string; lbs: number; value: number }[];
  adh: { date: string; qty: number; value: number }[];
};

/** মাসের দর হিসাবের উপাদান — Opening + মাসের ক্রয়/Freight। */
export async function getRawCostContext(supabase: Client, ym: string): Promise<RawCostContext> {
  const { year, month } = ymParts(ym);
  const { start, end } = monthRange(year, month);
  const base = { ym, start, end };

  const own = await loadSheet(supabase, ym);
  if (own?.confirmed_at && own.data?.version === 1) {
    const t = topSheetTotals(own.data);
    return {
      ...base,
      locked: { poly: t.ratePerLbs, adhesive: Number(own.data.adhesiveRate) || 0 },
      opening: { lbs: 0, value: 0, adhQty: 0, adhValue: 0, source: "confirmed" },
      poly: [],
      adh: [],
    };
  }

  const prev = prevYm(ym);
  const prevSheet = await loadSheet(supabase, prev);
  const { data: mats } = await supabase.from("raw_materials").select("id, inventory_account_code");
  const codeOf = new Map<string, string>((mats ?? []).map((m: any) => [m.id, m.inventory_account_code || FALLBACK_INV_CODE]));

  let opening: RawCostContext["opening"];
  if (prevSheet?.confirmed_at && prevSheet.data?.version === 1) {
    const t = topSheetTotals(prevSheet.data);
    opening = {
      lbs: t.closingLbs, value: t.closingValue,
      adhQty: Number(prevSheet.data.adhesiveCartons) || 0, adhValue: t.adhesiveValue, source: "confirmed",
    };
  } else {
    // আগের মাস confirm হয়নি — খাতা থেকে আগের মাস-শেষের Lbs ও মূল্য
    const prevEnd = monthRange(ymParts(prev).year, ymParts(prev).month).end;
    const [ledger, { data: accts }] = await Promise.all([
      fetchAllRows<any>(supabase, "stock_ledger", "item_id, txn_type, quantity", (q: any) => q.eq("item_type", "raw_material").lte("txn_date", prevEnd)),
      supabase.from("chart_of_accounts").select("id, account_code"),
    ]);
    let lbs = 0, adhQty = 0;
    ledger.forEach((l: any) => {
      const n = (l.txn_type === "in" ? 1 : l.txn_type === "out" ? -1 : 0) * (Number(l.quantity) || 0);
      if (isAdhesiveCode(codeOf.get(l.item_id))) adhQty += n; else lbs += n;
    });
    const polyCodes = new Set([...codeOf.values()].filter((c) => !isAdhesiveCode(c)));
    const codeByAcct = new Map<string, string>((accts ?? []).map((a: any) => [a.id, a.account_code]));
    const invAcctIds = (accts ?? []).filter((a: any) => polyCodes.has(a.account_code) || isAdhesiveCode(a.account_code)).map((a: any) => a.id);
    const gl = await fetchAllRowsIn<any>(
      supabase, "journal_entry_lines", "account_id, debit, credit, journal_vouchers!inner(voucher_date)", "account_id", invAcctIds,
      (q: any) => q.lte("journal_vouchers.voucher_date", prevEnd),
    );
    let value = 0, adhValue = 0;
    gl.forEach((l: any) => {
      const v = (Number(l.debit) || 0) - (Number(l.credit) || 0);
      if (isAdhesiveCode(codeByAcct.get(l.account_id))) adhValue += v; else value += v;
    });
    opening = { lbs: r2(lbs), value: r2(value), adhQty: r2(adhQty), adhValue: r2(adhValue), source: "erp" };
  }

  // মাসের ক্রয় + Freight (TopSheet-এর মতো সব Freight কাঁচামালের মূল্যে)
  const [entries, freight] = await Promise.all([
    fetchAllRows<any>(
      supabase, "purchase_entries", "entry_date, purchase_entry_items(material_id, quantity_lbs, rate_per_lbs)",
      (q: any) => q.gte("entry_date", start).lte("entry_date", end),
    ),
    fetchAllRows<any>(supabase, "purchase_freight_charges", "charge_date, amount", (q: any) => q.gte("charge_date", start).lte("charge_date", end)),
  ]);
  const poly: RawCostContext["poly"] = [];
  const adh: RawCostContext["adh"] = [];
  entries.forEach((e: any) => {
    (e.purchase_entry_items ?? []).forEach((i: any) => {
      const q = Number(i.quantity_lbs) || 0;
      const v = q * (Number(i.rate_per_lbs) || 0);
      if (isAdhesiveCode(codeOf.get(i.material_id))) adh.push({ date: e.entry_date, qty: q, value: v });
      else poly.push({ date: e.entry_date, lbs: q, value: v });
    });
  });
  freight.forEach((f: any) => poly.push({ date: f.charge_date, lbs: 0, value: Number(f.amount) || 0 }));
  poly.sort((a, b) => a.date.localeCompare(b.date));
  adh.sort((a, b) => a.date.localeCompare(b.date));

  return { ...base, locked: null, opening, poly, adh };
}

/** D দিনের মিশ্র কাঁচামাল-দর (0 = হিসাব করা যায়নি) */
export function polyRateOn(ctx: RawCostContext, date: string): number {
  if (ctx.locked) return ctx.locked.poly;
  let lbs = ctx.opening.lbs, val = ctx.opening.value;
  for (const p of ctx.poly) { if (p.date > date) break; lbs += p.lbs; val += p.value; }
  return lbs > 0 && val > 0 ? r2(val / lbs) : 0;
}

/** D দিনের Adhesive দর (প্রতি কার্টন) */
export function adhesiveRateOn(ctx: RawCostContext, date: string): number {
  if (ctx.locked) return ctx.locked.adhesive;
  let qty = ctx.opening.adhQty, val = ctx.opening.adhValue;
  for (const p of ctx.adh) { if (p.date > date) break; qty += p.qty; val += p.value; }
  return qty > 0 && val > 0 ? r2(val / qty) : 0;
}

export type RateFor = (inventoryCode: string | null | undefined) => number | null;

/**
 * date-এর কাঁচামাল দর — material-এর inventory account code দিলে দর (Adhesive 1204 নিজের, বাকি সব মিশ্র)।
 * null = এই তারিখে মাসিক দরের নিয়ম খাটে না (RAW_COST_RULE_START-এর আগের খোলা মাস / দর বের করা যায়নি) —
 * তখন আগের মতো raw_materials.avg_cost_per_lbs ব্যবহার করুন।
 */
export async function rawRateFor(supabase: Client, date: string): Promise<RateFor> {
  const ym = ymOf(date);
  const ctx = await getRawCostContext(supabase, ym);
  if (!ctx.locked && ym < RAW_COST_RULE_START) return () => null;
  return (code) => {
    const r = isAdhesiveCode(code) ? adhesiveRateOn(ctx, date) : polyRateOn(ctx, date);
    return r > 0 ? r : null;
  };
}

// ───────────────────────── Recost ─────────────────────────

export type RecostChange = { kind: string; ref: string; date: string; old: number; new: number };
type Line = { id?: string; voucher_id?: string; account_id: string; debit: number; credit: number; memo: string };

async function replaceLines(supabase: Client, voucherId: string, lines: Line[]) {
  await supabase.from("journal_entry_lines").delete().eq("voucher_id", voucherId);
  const clean = lines.filter((l) => l.account_id && (l.debit > 0 || l.credit > 0));
  if (clean.length) await supabase.from("journal_entry_lines").insert(clean.map((l) => ({ voucher_id: voucherId, ...l })));
}

/**
 * একটা খোলা মাসের সব কাঁচামাল-খরচ বর্তমান দরে নতুন করে বসায়। confirm করা মাস / নিয়ম শুরুর আগের মাসে কিছু করে না।
 * dryRun = কিছু না লিখে কী বদলাবে তার তালিকা।
 */
export async function recostMonth(supabase: Client, ym: string, opts?: { dryRun?: boolean }): Promise<RecostChange[]> {
  if (ym < RAW_COST_RULE_START) return [];
  const ctx = await getRawCostContext(supabase, ym);
  if (ctx.locked) return [];
  const dry = !!opts?.dryRun;
  const { start, end } = ctx;
  const rate = (code: string, date: string) => (isAdhesiveCode(code) ? adhesiveRateOn(ctx, date) : polyRateOn(ctx, date));

  const [{ data: mats }, { data: accts }] = await Promise.all([
    supabase.from("raw_materials").select("id, inventory_account_code"),
    supabase.from("chart_of_accounts").select("id, account_code"),
  ]);
  const codeOfMat = new Map<string, string>((mats ?? []).map((m: any) => [m.id, m.inventory_account_code || FALLBACK_INV_CODE]));
  const acctId = new Map<string, string>((accts ?? []).map((a: any) => [a.account_code, a.id]));
  const codeOfAcct = new Map<string, string>((accts ?? []).map((a: any) => [a.id, a.account_code]));
  const changes: RecostChange[] = [];

  // ── ১. Booking-এর কাঁচামাল issue (Dr 1220 / Cr inventory) → তার invoice-গুলোর COGS ──
  const issueVouchers = await fetchAllRows<any>(
    supabase, "journal_vouchers", "id, voucher_date, narration",
    (q: any) => q.gte("voucher_date", start).lte("voucher_date", end).ilike("narration", "RM issued to production%"),
  );
  const vDate = new Map<string, string>(issueVouchers.map((v: any) => [v.id, v.voucher_date]));
  const bookings = await fetchAllRowsIn<any>(
    supabase, "bookings", "id, booking_no, quantity_pcs, inventory_voucher_id, production_orders(id, wip_cost)",
    "inventory_voucher_id", issueVouchers.map((v: any) => v.id),
  );
  if (bookings.length) {
    const poOf = (b: any) => one(b.production_orders);
    const [issueLines, cons, cogsRows] = await Promise.all([
      fetchAllRowsIn<any>(supabase, "journal_entry_lines", "id, voucher_id, account_id, debit, credit, memo", "voucher_id", bookings.map((b: any) => b.inventory_voucher_id)),
      fetchAllRowsIn<any>(supabase, "material_consumption", "production_id, material_id, quantity_lbs", "production_id", bookings.map((b: any) => poOf(b)?.id)),
      fetchAllRowsIn<any>(supabase, "invoice_cogs", "id, invoice_id, booking_id, voucher_id, amount, wip_amount, fg_amount", "booking_id", bookings.map((b: any) => b.id)),
    ]);
    const items = await fetchAllRowsIn<any>(
      supabase, "sales_invoice_items", "invoice_id, booking_id, quantity_pcs", "invoice_id", cogsRows.map((r: any) => r.invoice_id),
    );
    const invQty = new Map<string, number>();
    items.forEach((it: any) => {
      if (!it.booking_id) return;
      const k = `${it.invoice_id}|${it.booking_id}`;
      invQty.set(k, (invQty.get(k) ?? 0) + (Number(it.quantity_pcs) || 0));
    });
    const dirtyCogsVouchers = new Set<string>();
    const cogsById = new Map<string, any>(cogsRows.map((r: any) => [r.id, { ...r }]));

    for (const b of bookings) {
      const po = poOf(b);
      const date = vDate.get(b.inventory_voucher_id) ?? start;
      const byCode = new Map<string, number>();
      let costable = true;
      cons.filter((c: any) => c.production_id === po?.id).forEach((c: any) => {
        const code = codeOfMat.get(c.material_id) ?? FALLBACK_INV_CODE;
        const r = rate(code, date);
        if (!(r > 0)) costable = false;
        byCode.set(code, (byCode.get(code) ?? 0) + (Number(c.quantity_lbs) || 0) * r);
      });
      if (!costable || byCode.size === 0) continue;
      byCode.forEach((v, k) => byCode.set(k, r2(v)));
      const total = r2([...byCode.values()].reduce((s, v) => s + v, 0));

      const lines = issueLines.filter((l: any) => l.voucher_id === b.inventory_voucher_id);
      const oldTotal = r2(lines.reduce((s: number, l: any) => s + (Number(l.debit) || 0), 0));
      const oldByCode = new Map<string, number>();
      lines.forEach((l: any) => {
        if (!(Number(l.credit) > 0)) return;
        const c = codeOfAcct.get(l.account_id) ?? "";
        oldByCode.set(c, r2((oldByCode.get(c) ?? 0) + Number(l.credit)));
      });
      const unchanged = same(total, oldTotal) && [...byCode].every(([c, v]) => same(v, oldByCode.get(c) ?? 0)) && oldByCode.size === byCode.size;
      if (unchanged) continue;

      changes.push({ kind: "issue", ref: b.booking_no, date, old: oldTotal, new: total });
      const memo = `RM issued — ${b.booking_no}`;
      if (!dry) {
        await replaceLines(supabase, b.inventory_voucher_id, [
          { account_id: acctId.get(WIP_CODE) ?? "", debit: total, credit: 0, memo },
          ...[...byCode].map(([c, v]) => ({ account_id: acctId.get(c) ?? "", debit: 0, credit: v, memo })),
        ]);
      }

      // এই booking-এর invoice COGS — amount = issue মূল্য × min(1, invoice Qty ÷ booking Qty)
      const bookingQty = Number(b.quantity_pcs) || 0;
      let wipDelta = 0;
      for (const row of cogsRows.filter((r: any) => r.booking_id === b.id)) {
        const cur = cogsById.get(row.id);
        const share = bookingQty > 0 ? Math.min(1, (invQty.get(`${row.invoice_id}|${b.id}`) ?? 0) / bookingQty) : 0;
        const amount = r2(total * share);
        const oldAmt = Number(cur.amount) || 0;
        const oldWip = Number(cur.wip_amount) || 0;
        const oldFg = Number(cur.fg_amount) || 0;
        const wip = oldFg > 0 && oldAmt > 0 ? r2(amount * (oldWip / oldAmt)) : amount;
        const fg = r2(amount - wip);
        if (same(amount, oldAmt) && same(wip, oldWip)) continue;
        wipDelta = r2(wipDelta + wip - oldWip);
        cur.amount = amount; cur.wip_amount = wip; cur.fg_amount = fg;
        dirtyCogsVouchers.add(cur.voucher_id);
        if (!dry) await supabase.from("invoice_cogs").update({ amount, wip_amount: wip, fg_amount: fg }).eq("id", row.id);
      }
      // production order-এর বাকি WIP = আগের বাকি + (নতুন issue − পুরনো issue) − (COGS-এ WIP থেকে বাড়তি)
      if (po?.id && !dry) {
        const wipCost = r2((Number(po.wip_cost) || 0) + (total - oldTotal) - wipDelta);
        if (!same(wipCost, Number(po.wip_cost) || 0)) await supabase.from("production_orders").update({ wip_cost: wipCost }).eq("id", po.id);
      }
    }

    // COGS JV-গুলো (এক invoice = এক JV) — তার সব invoice_cogs সারি থেকে আবার
    if (dirtyCogsVouchers.size) {
      const vids = [...dirtyCogsVouchers].filter(Boolean);
      const [dbRows, oldLines, { data: vouchers }] = await Promise.all([
        fetchAllRowsIn<any>(supabase, "invoice_cogs", "id, voucher_id, amount, wip_amount, fg_amount", "voucher_id", vids),
        fetchAllRowsIn<any>(supabase, "journal_entry_lines", "voucher_id, debit, memo", "voucher_id", vids),
        supabase.from("journal_vouchers").select("id, voucher_date, narration").in("id", vids),
      ]);
      // dryRun-এ DB বদলায়নি — এই হিসাবের নতুন অঙ্ক বসিয়ে নিই (invoice-এর অন্য booking-এর সারি DB-র মতোই)
      const allRows = dbRows.map((r: any) => cogsById.get(r.id) ?? r);
      for (const vid of vids) {
        const rows = allRows.filter((r: any) => r.voucher_id === vid);
        const amt = r2(rows.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0));
        const wip = r2(rows.reduce((s: number, r: any) => s + (Number(r.wip_amount) || 0), 0));
        const fg = r2(amt - wip);
        const vLines = oldLines.filter((l: any) => l.voucher_id === vid);
        const oldAmt = r2(vLines.reduce((s: number, l: any) => s + (Number(l.debit) || 0), 0));
        const v = (vouchers ?? []).find((x: any) => x.id === vid);
        const memo = vLines[0]?.memo ?? v?.narration ?? "COGS";
        changes.push({ kind: "cogs", ref: v?.narration ?? vid, date: v?.voucher_date ?? "", old: oldAmt, new: amt });
        if (!dry) {
          await replaceLines(supabase, vid, [
            { account_id: acctId.get(COGS_CODE) ?? "", debit: amt, credit: 0, memo },
            { account_id: acctId.get(WIP_CODE) ?? "", debit: 0, credit: wip, memo },
            { account_id: acctId.get(FG_CODE) ?? "", debit: 0, credit: fg, memo },
          ]);
        }
      }
    }
  }

  // ── ২. Raw Material সরাসরি বিক্রি ও Recycled Chips (Wastage) বিক্রি — COGS লাইন ──
  const [rmSales, wSales] = await Promise.all([
    fetchAllRows<any>(supabase, "raw_material_sales", "id, sale_no, sale_date, material_id, quantity_lbs, cogs_amount, voucher_id", (q: any) => q.gte("sale_date", start).lte("sale_date", end)),
    fetchAllRows<any>(supabase, "wastage_sales", "id, sale_no, sale_date, source, quantity_lbs, cogs_amount, voucher_id", (q: any) => q.gte("sale_date", start).lte("sale_date", end).eq("source", "recycled_chips")),
  ]);
  const saleRows = [
    ...rmSales.map((s: any) => ({ table: "raw_material_sales", s, code: codeOfMat.get(s.material_id) ?? FALLBACK_INV_CODE })),
    ...wSales.map((s: any) => ({ table: "wastage_sales", s, code: RECYCLED_CODE })),
  ].filter((x) => x.s.voucher_id);
  if (saleRows.length) {
    const sLines = await fetchAllRowsIn<any>(supabase, "journal_entry_lines", "id, voucher_id, account_id, debit, credit, memo", "voucher_id", saleRows.map((x) => x.s.voucher_id));
    for (const { table, s, code } of saleRows) {
      const r = rate(code, s.sale_date);
      if (!(r > 0)) continue;
      const cogs = r2((Number(s.quantity_lbs) || 0) * r);
      const old = Number(s.cogs_amount) || 0;
      if (same(cogs, old)) continue;
      changes.push({ kind: table === "raw_material_sales" ? "rm_sale" : "wastage_sale", ref: s.sale_no, date: s.sale_date, old, new: cogs });
      if (dry) continue;
      await supabase.from(table).update({ cogs_amount: cogs }).eq("id", s.id);
      const vl = sLines.filter((l: any) => l.voucher_id === s.voucher_id);
      const cogsLine = vl.find((l: any) => l.account_id === acctId.get(COGS_CODE) && Number(l.debit) > 0);
      const invLine = vl.find((l: any) => l.account_id === acctId.get(code) && Number(l.credit) > 0 && String(l.memo ?? "").startsWith("COGS"));
      if (cogsLine && invLine) {
        await supabase.from("journal_entry_lines").update({ debit: cogs }).eq("id", cogsLine.id);
        await supabase.from("journal_entry_lines").update({ credit: cogs }).eq("id", invLine.id);
      } else {
        const memo = `COGS — ${String(vl[0]?.memo ?? s.sale_no)}`;
        await supabase.from("journal_entry_lines").insert([
          { voucher_id: s.voucher_id, account_id: acctId.get(COGS_CODE), debit: cogs, credit: 0, memo },
          { voucher_id: s.voucher_id, account_id: acctId.get(code), debit: 0, credit: cogs, memo },
        ]);
      }
    }
  }

  // ── ৩. Booking-এর extra wastage (স্টক কমায়) — Dr 5600 (+ Dr 1203 recycled) / Cr inventory ──
  const wRows = await fetchAllRows<any>(
    supabase, "wastage", "id, wastage_date, inventory_voucher_id",
    (q: any) => q.eq("deducts_stock", true).gte("wastage_date", start).lte("wastage_date", end).not("inventory_voucher_id", "is", null),
  );
  if (wRows.length) {
    const [wLedger, wLines] = await Promise.all([
      fetchAllRowsIn<any>(supabase, "stock_ledger", "reference_id, item_id, txn_type, quantity", "reference_id", wRows.map((w: any) => w.id), (q: any) => q.eq("reference_type", "wastage")),
      fetchAllRowsIn<any>(supabase, "journal_entry_lines", "voucher_id, account_id, debit, credit, memo", "voucher_id", wRows.map((w: any) => w.inventory_voucher_id)),
    ]);
    for (const w of wRows) {
      const byCode = new Map<string, number>();
      let recovered = 0;
      let costable = true;
      wLedger.filter((l: any) => l.reference_id === w.id).forEach((l: any) => {
        const code = codeOfMat.get(l.item_id) ?? FALLBACK_INV_CODE;
        const r = rate(code, w.wastage_date);
        if (!(r > 0)) costable = false;
        const v = (Number(l.quantity) || 0) * r;
        if (l.txn_type === "out") byCode.set(code, (byCode.get(code) ?? 0) + v);
        else if (l.txn_type === "in") recovered += v;
      });
      if (!costable || byCode.size === 0) continue;
      byCode.forEach((v, k) => byCode.set(k, r2(v)));
      recovered = r2(recovered);
      const wasted = r2([...byCode.values()].reduce((s, v) => s + v, 0));
      const vl = wLines.filter((l: any) => l.voucher_id === w.inventory_voucher_id);
      const oldWasted = r2(vl.filter((l: any) => Number(l.credit) > 0 && codeOfAcct.get(l.account_id) !== LOSS_CODE).reduce((s: number, l: any) => s + Number(l.credit), 0));
      if (same(wasted, oldWasted)) continue;
      changes.push({ kind: "wastage", ref: String(vl[0]?.memo ?? w.id), date: w.wastage_date, old: oldWasted, new: wasted });
      if (dry) continue;
      const memo = String(vl.find((l: any) => Number(l.credit) > 0)?.memo ?? vl[0]?.memo ?? "Extra wastage");
      const net = r2(wasted - recovered);
      await replaceLines(supabase, w.inventory_voucher_id, [
        { account_id: acctId.get(LOSS_CODE) ?? "", debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, memo },
        { account_id: acctId.get(RECYCLED_CODE) ?? "", debit: recovered, credit: 0, memo: memo.replace("Extra wastage", "Recycled recovery") },
        ...[...byCode].map(([c, v]) => ({ account_id: acctId.get(c) ?? "", debit: 0, credit: v, memo })),
      ]);
    }
  }

  // ── ৪. Material খরচ (যেমন Adhesive) — Dr expense / Cr inventory ──
  const meVouchers = await fetchAllRows<any>(
    supabase, "journal_vouchers", "id, voucher_date, narration",
    (q: any) => q.eq("source", "material_expense").gte("voucher_date", start).lte("voucher_date", end),
  );
  if (meVouchers.length) {
    const ids = meVouchers.map((v: any) => v.id);
    const [meLedger, meLines] = await Promise.all([
      fetchAllRowsIn<any>(supabase, "stock_ledger", "reference_id, item_id, quantity", "reference_id", ids, (q: any) => q.eq("reference_type", "material_expense")),
      fetchAllRowsIn<any>(supabase, "journal_entry_lines", "id, voucher_id, account_id, debit, credit", "voucher_id", ids),
    ]);
    for (const v of meVouchers) {
      const led = meLedger.filter((l: any) => l.reference_id === v.id);
      if (!led.length) continue;
      const code = codeOfMat.get(led[0].item_id) ?? FALLBACK_INV_CODE;
      const r = rate(code, v.voucher_date);
      if (!(r > 0)) continue;
      const amount = r2(led.reduce((s: number, l: any) => s + (Number(l.quantity) || 0), 0) * r);
      const vl = meLines.filter((l: any) => l.voucher_id === v.id);
      const invLine = vl.find((l: any) => Number(l.credit) > 0);
      const expLine = vl.find((l: any) => Number(l.debit) > 0);
      if (!invLine || !expLine || same(amount, Number(invLine.credit))) continue;
      changes.push({ kind: "material_expense", ref: v.narration, date: v.voucher_date, old: Number(invLine.credit), new: amount });
      if (dry) continue;
      await supabase.from("journal_entry_lines").update({ credit: amount }).eq("id", invLine.id);
      await supabase.from("journal_entry_lines").update({ debit: amount }).eq("id", expLine.id);
    }
  }

  return changes;
}

/**
 * নিয়ম শুরুর মাস থেকে চলতি মাস পর্যন্ত সব খোলা (confirm না করা) মাস পুরনো থেকে নতুন ক্রমে recost করে
 * (আগের মাসের খাতা বদলালে পরের খোলা মাসের Opening বদলায়), তারপর raw_materials.avg_cost_per_lbs-এ
 * আজকের দর বসায় (তালিকা/ফর্মে দেখানোর জন্য)। ক্রয়/Freight সেভ-এডিট-ডিলিট ও টপশীট confirm/un-confirm-এর পরে ডাকুন।
 */
export async function recostOpenMonths(supabase: Client, opts?: { dryRun?: boolean }): Promise<RecostChange[]> {
  const today = dhakaTodayStr();
  const last = ymOf(today);
  const changes: RecostChange[] = [];
  for (let ym = RAW_COST_RULE_START; ym <= last; ym = nextYm(ym)) {
    changes.push(...(await recostMonth(supabase, ym, opts)));
  }
  if (!opts?.dryRun && last >= RAW_COST_RULE_START) {
    const ctx = await getRawCostContext(supabase, last);
    const poly = polyRateOn(ctx, today);
    const adh = adhesiveRateOn(ctx, today);
    const { data: mats } = await supabase.from("raw_materials").select("id, inventory_account_code, avg_cost_per_lbs");
    for (const m of mats ?? []) {
      const r = isAdhesiveCode(m.inventory_account_code) ? adh : poly;
      if (r > 0 && !same(r, Number(m.avg_cost_per_lbs) || 0)) {
        await supabase.from("raw_materials").update({ avg_cost_per_lbs: r }).eq("id", m.id);
      }
    }
  }
  return changes;
}
