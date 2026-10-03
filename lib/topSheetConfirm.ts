/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows, fetchAllRowsIn } from "@/lib/fetchAll";
import { monthRange } from "@/lib/payroll";
import { makeVoucher, reverseInventoryJv, COGS_CODE } from "@/lib/inventoryCost";
import { adjustRawStock } from "@/lib/stockAdjust";
import { getCurrentUserId } from "@/lib/currentUser";
import { recostMonth, recostOpenMonths, RAW_COST_RULE_START, isAdhesiveCode } from "@/lib/rawCost";
import { topSheetTotals, confirmedSheetName, MK_WAREHOUSE_PATTERN, type TopSheetData } from "@/lib/topSheetCalc";

// মাসিক টপশীট Confirm (চূড়ান্ত হিসাব) — user-confirmed 2026-10-04।
//   Confirm: শীট সেভ → (নিয়মের মাস হলে) মাসের কাঁচামাল খরচ শেষবার নতুন দরে → ERP-র মাস-শেষ স্টক টপশীটের
//     closing-এ মেলানো:
//       Lbs   — (টপশীটের closing Lbs − ERP-র কাঁচামাল Lbs) LLDPE-তে (নিজস্ব গুদামে) — শুধু ১ Lbs বা বেশি হলে;
//               এর কম = ব্যাগ ২ দশমিকে গোল করার পার্থক্য (৩০/৯: গোনা 95,805.50, শীট 95,806), ERP গোনাতেই থাকে।
//               Adhesive কার্টনের পার্থক্য
//               Adhesive-এ; stock_ledger reference_type='topsheet_confirm', reference_id = month_topsheets.id
//       মূল্য — প্রতিটা inventory account = তার Lbs × টপশীটের প্রতি Lbs দর (rounding-এর বাকি LLDPE-তে),
//               Adhesive = টপশীটের এডহেসিভ মূল্য; পার্থক্য এক true-up JV-তে, contra 5050 COGS
//     → ERP-র মাসিক লাভ = টপশীটের লাভ (শীটে হাতে বদলানো অন্য সংখ্যা না থাকলে)। তারপর পরের খোলা মাসগুলো
//     নতুন Opening ধরে recost। Confirm-এর পরেও ঐ মাসের এন্ট্রি দেওয়া/বদলানো যায় — দর lock থাকে।
//   Un-confirm: শুধু Admin — JV ও Lbs সমন্বয় উল্টে, confirmed_at মুছে, আবার recost।

type Client = SupabaseClient | any;

const ADJUST_MATERIAL = "LLDPE"; // Lbs পার্থক্য (বানানো আছে/বাকি, গোনা) এখানে — সেপ্টেম্বরেও তাই করা হয়েছিল
const LBS_ROUNDING_TOLERANCE = 1; // এর কম Lbs পার্থক্য = শীটের ব্যাগ-গোলের পার্থক্য, সমন্বয় হয় না (user 2026-10-04)
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export { confirmedSheetName };

export type StockAdjust = { materialId: string; materialName: string; warehouseId: string; warehouseName: string; qty: number; unit: "Lbs" | "ctn" };
export type ConfirmLine = { accountId: string; code: string; name: string; debit: number; credit: number };

export type ConfirmPlan = {
  name: string;
  end: string;
  sheet: { closingLbs: number; closingValue: number; rate: number; adhCartons: number; adhValue: number; netProfit: number };
  erp: { polyLbs: number; polyValue: number; adhQty: number; adhValue: number; profit: number };
  adjustments: StockAdjust[];
  lines: ConfirmLine[];
  /** + হলে Cr 5050 (লাভ বাড়ে), − হলে Dr 5050 */
  contra: number;
  profitAfter: number;
  /** টপশীটের লাভ − confirm-এর পরে ERP-র লাভ */
  profitGap: number;
  warnings: string[];
};

/** Confirm করলে কী হবে — কিছু লেখে না (এখনকার খাতা ধরে)। */
export async function planTopSheetConfirm(supabase: Client, data: TopSheetData): Promise<ConfirmPlan> {
  const { year, month } = data;
  const { start, end } = monthRange(year, month);
  const t = topSheetTotals(data);

  const [{ data: mats }, { data: accts }, { data: whs }, ledger] = await Promise.all([
    supabase.from("raw_materials").select("id, material_name, inventory_account_code"),
    supabase.from("chart_of_accounts").select("id, account_code, account_name, account_type"),
    supabase.from("warehouses").select("id, name"),
    fetchAllRows<any>(supabase, "stock_ledger", "item_id, warehouse_id, txn_type, quantity", (q: any) => q.eq("item_type", "raw_material").lte("txn_date", end)),
  ]);
  const codeOf = (m: any): string => m.inventory_account_code || "1299";
  const acct = new Map<string, any>((accts ?? []).map((a: any) => [a.account_code, a]));
  const whName = new Map<string, string>((whs ?? []).map((w: any) => [w.id, w.name ?? ""]));

  const qty = new Map<string, number>();
  const qtyWh = new Map<string, number>(); // material|warehouse
  ledger.forEach((l: any) => {
    const n = (l.txn_type === "in" ? 1 : l.txn_type === "out" ? -1 : 0) * (Number(l.quantity) || 0);
    qty.set(l.item_id, (qty.get(l.item_id) ?? 0) + n);
    const k = `${l.item_id}|${l.warehouse_id}`;
    qtyWh.set(k, (qtyWh.get(k) ?? 0) + n);
  });
  const poly = (mats ?? []).filter((m: any) => !isAdhesiveCode(codeOf(m)));
  const adhMat = (mats ?? []).find((m: any) => isAdhesiveCode(codeOf(m)));
  const polyLbs = r2(poly.reduce((s: number, m: any) => s + (qty.get(m.id) ?? 0), 0));
  const adhQty = r2(adhMat ? qty.get(adhMat.id) ?? 0 : 0);

  // কোন গুদামে সমন্বয় — নিজস্ব (এম কে না) গুদামগুলোর মধ্যে যেখানে ঐ material সবচেয়ে বেশি
  const pickWarehouse = (materialId: string): string => {
    const all: { id: string; mk: boolean; q: number }[] = (whs ?? []).map((w: any) => ({
      id: w.id, mk: MK_WAREHOUSE_PATTERN.test(w.name ?? ""), q: qtyWh.get(`${materialId}|${w.id}`) ?? 0,
    }));
    const own = all.filter((w) => !w.mk).sort((a, b) => b.q - a.q);
    return (own[0] ?? all.sort((a, b) => b.q - a.q)[0])?.id ?? "";
  };

  const adjustments: StockAdjust[] = [];
  const qAfter = new Map(qty);
  const adjMat = poly.find((m: any) => m.material_name === ADJUST_MATERIAL)
    ?? [...poly].sort((a: any, b: any) => (qty.get(b.id) ?? 0) - (qty.get(a.id) ?? 0))[0];
  const dL = r2(t.closingLbs - polyLbs);
  if (adjMat && Math.abs(dL) >= LBS_ROUNDING_TOLERANCE) {
    const wh = pickWarehouse(adjMat.id);
    adjustments.push({ materialId: adjMat.id, materialName: adjMat.material_name, warehouseId: wh, warehouseName: whName.get(wh) ?? "", qty: dL, unit: "Lbs" });
    qAfter.set(adjMat.id, (qAfter.get(adjMat.id) ?? 0) + dL);
  }
  const dA = adhMat ? r2((Number(data.adhesiveCartons) || 0) - adhQty) : 0;
  if (adhMat && Math.abs(dA) >= 0.01) {
    const wh = pickWarehouse(adhMat.id);
    adjustments.push({ materialId: adhMat.id, materialName: adhMat.material_name, warehouseId: wh, warehouseName: whName.get(wh) ?? "", qty: dA, unit: "ctn" });
  }

  // লক্ষ্য মূল্য — account-ভিত্তিক
  const target = new Map<string, number>();
  poly.forEach((m: any) => target.set(codeOf(m), (target.get(codeOf(m)) ?? 0) + (qAfter.get(m.id) ?? 0) * t.ratePerLbs));
  target.forEach((v, k) => target.set(k, r2(v)));
  const residual = r2(t.closingValue - [...target.values()].reduce((s, v) => s + v, 0));
  const residualCode = adjMat ? codeOf(adjMat) : [...target.keys()][0];
  if (residualCode) target.set(residualCode, r2((target.get(residualCode) ?? 0) + residual));
  if (adhMat) target.set(codeOf(adhMat), r2(t.adhesiveValue));

  // খাতার মাস-শেষ ব্যালেন্স + মাসের লাভ (ERP)
  const invIds = [...target.keys()].map((c) => acct.get(c)?.id).filter(Boolean);
  const plIds = (accts ?? []).filter((a: any) => a.account_type === "income" || a.account_type === "expense").map((a: any) => a.id);
  const [glLines, plLines] = await Promise.all([
    fetchAllRowsIn<any>(supabase, "journal_entry_lines", "account_id, debit, credit, journal_vouchers!inner(voucher_date)", "account_id", invIds,
      (q: any) => q.lte("journal_vouchers.voucher_date", end)),
    fetchAllRowsIn<any>(supabase, "journal_entry_lines", "debit, credit, journal_vouchers!inner(voucher_date)", "account_id", plIds,
      (q: any) => q.gte("journal_vouchers.voucher_date", start).lte("journal_vouchers.voucher_date", end)),
  ]);
  const glById = new Map<string, number>();
  glLines.forEach((l: any) => glById.set(l.account_id, (glById.get(l.account_id) ?? 0) + (Number(l.debit) || 0) - (Number(l.credit) || 0)));
  const profit = r2(plLines.reduce((s: number, l: any) => s + (Number(l.credit) || 0) - (Number(l.debit) || 0), 0));

  const lines: ConfirmLine[] = [];
  let net = 0;
  let polyValue = 0;
  let adhValue = 0;
  target.forEach((tv, code) => {
    const a = acct.get(code);
    if (!a) return;
    const gl = r2(glById.get(a.id) ?? 0);
    if (isAdhesiveCode(code)) adhValue += gl; else polyValue += gl;
    const diff = r2(tv - gl);
    if (Math.abs(diff) < 0.01) return;
    net = r2(net + diff);
    lines.push({ accountId: a.id, code, name: a.account_name, debit: diff > 0 ? diff : 0, credit: diff < 0 ? -diff : 0 });
  });
  const contra = net;
  const cogs = acct.get(COGS_CODE);
  if (Math.abs(contra) >= 0.01 && cogs) {
    lines.push({ accountId: cogs.id, code: COGS_CODE, name: cogs.account_name, debit: contra < 0 ? -contra : 0, credit: contra > 0 ? contra : 0 });
  }
  const profitAfter = r2(profit + contra);

  const warnings: string[] = [];
  if (data.opening?.source !== "snapshot") warnings.push("আগের মাসের confirm করা শীট নেই — এই মাসের Opening খাতা থেকে নেওয়া।");
  if (`${year}-${String(month).padStart(2, "0")}` >= RAW_COST_RULE_START) {
    warnings.push("Confirm-এর আগে এই মাসের কাঁচামাল খরচ শেষবার মাসিক দরে হিসাব হবে — 5050-এর অঙ্ক সামান্য বদলাতে পারে।");
  }
  const profitGap = r2(t.netProfit - profitAfter);
  if (Math.abs(profitGap) >= 1) {
    warnings.push(`Confirm-এর পরেও ERP-র লাভ টপশীটের লাভ থেকে ৳${fmt(profitGap)} আলাদা থাকবে — শীটে হাতে বদলানো (পার্টি/দেনা/খরচ) সংখ্যা থাকলে এমন হয়।`);
  }

  return {
    name: confirmedSheetName(year, month),
    end,
    sheet: { closingLbs: t.closingLbs, closingValue: t.closingValue, rate: t.ratePerLbs, adhCartons: Number(data.adhesiveCartons) || 0, adhValue: t.adhesiveValue, netProfit: t.netProfit },
    erp: { polyLbs, polyValue: r2(polyValue), adhQty, adhValue: r2(adhValue), profit },
    adjustments,
    lines,
    contra,
    profitAfter,
    profitGap,
    warnings,
  };
}

async function undoAdjustments(supabase: Client, sheetId: string) {
  const { data: rows } = await supabase
    .from("stock_ledger").select("id, item_id, warehouse_id, txn_type, quantity")
    .eq("reference_type", "topsheet_confirm").eq("reference_id", sheetId);
  for (const l of rows ?? []) {
    const back = l.txn_type === "in" ? -Number(l.quantity) : Number(l.quantity);
    await adjustRawStock(supabase, l.item_id, l.warehouse_id, back);
    await supabase.from("stock_ledger").delete().eq("id", l.id);
  }
}

/** টপশীট confirm — উপরের নিয়মে। ফেরত দেয় যে plan অনুযায়ী পোস্ট হলো। */
export async function confirmTopSheet(
  supabase: Client, data: TopSheetData,
): Promise<{ ok: boolean; error?: string; plan?: ConfirmPlan }> {
  const { year, month } = data;
  const userId = await getCurrentUserId(supabase);
  const { data: existing, error: exErr } = await supabase
    .from("month_topsheets").select("id, confirmed_at").eq("year", year).eq("month", month).maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };
  if (existing?.confirmed_at) return { ok: false, error: "এই মাস আগেই confirm করা।" };

  // ১. শীট সেভ
  const { data: sheet, error: saveErr } = await supabase
    .from("month_topsheets")
    .upsert({ year, month, data, saved_by: userId, saved_at: new Date().toISOString() }, { onConflict: "year,month" })
    .select("id").single();
  if (saveErr || !sheet) return { ok: false, error: saveErr?.message ?? "শীট সেভ হয়নি।" };

  // ২. মাসের কাঁচামাল খরচ শেষবার মাসিক দরে (সব ক্রয় ধরে)
  await recostMonth(supabase, `${year}-${String(month).padStart(2, "0")}`);

  // ৩. স্টক মেলানোর plan (recost-এর পরের খাতা ধরে)
  const plan = await planTopSheetConfirm(supabase, data);
  const name = plan.name;

  // ৪. Lbs / কার্টন সমন্বয়
  for (const a of plan.adjustments) {
    if (!a.warehouseId) { await undoAdjustments(supabase, sheet.id); return { ok: false, error: `${a.materialName}-এর গুদাম পাওয়া যায়নি।` }; }
    const r = await adjustRawStock(supabase, a.materialId, a.warehouseId, a.qty);
    if (!r.ok) { await undoAdjustments(supabase, sheet.id); return { ok: false, error: r.error ?? "স্টক সমন্বয় ব্যর্থ।" }; }
    const { error } = await supabase.from("stock_ledger").insert({
      item_type: "raw_material", item_id: a.materialId, warehouse_id: a.warehouseId,
      txn_type: a.qty > 0 ? "in" : "out", quantity: Math.abs(a.qty),
      reference_type: "topsheet_confirm", reference_id: sheet.id, txn_date: plan.end,
    });
    if (error) {
      await adjustRawStock(supabase, a.materialId, a.warehouseId, -a.qty);
      await undoAdjustments(supabase, sheet.id);
      return { ok: false, error: error.message };
    }
  }

  // ৫. মূল্য মেলানোর true-up JV (contra 5050)
  let voucherId: string | null = null;
  if (plan.lines.length) {
    const memo = `TopSheet confirm ${name} — closing ${fmt(plan.sheet.closingLbs)} Lbs / ৳${fmt(plan.sheet.closingValue)}`;
    voucherId = await makeVoucher(
      supabase, plan.end, memo,
      plan.lines.map((l) => ({ account_id: l.accountId, debit: l.debit, credit: l.credit, memo })),
      "topsheet_confirm",
    );
    if (!voucherId) {
      await undoAdjustments(supabase, sheet.id);
      return { ok: false, error: "স্টক মেলানোর Journal Voucher তৈরি হয়নি — কিছুই confirm হয়নি।" };
    }
  }

  // ৬. confirmed + পরের খোলা মাসগুলো নতুন Opening ধরে
  const { error: cErr } = await supabase.from("month_topsheets")
    .update({ confirmed_at: new Date().toISOString(), confirmed_by: userId, true_up_voucher_id: voucherId })
    .eq("id", sheet.id);
  if (cErr) {
    await reverseInventoryJv(supabase, voucherId);
    await undoAdjustments(supabase, sheet.id);
    return { ok: false, error: cErr.message };
  }
  await recostOpenMonths(supabase);
  return { ok: true, plan };
}

/** Confirm খোলা — শুধু Admin। JV ও স্টক সমন্বয় উল্টে দেয়, মাসটা আবার খোলা (দর আবার বদলাতে পারে)। */
export async function unconfirmTopSheet(supabase: Client, year: number, month: number): Promise<{ ok: boolean; error?: string }> {
  const userId = await getCurrentUserId(supabase);
  const { data: me } = await supabase.from("app_users").select("role").eq("id", userId).maybeSingle();
  if (me?.role !== "admin") return { ok: false, error: "শুধু Admin confirm খুলতে পারেন।" };

  const { data: row, error } = await supabase
    .from("month_topsheets").select("id, confirmed_at, true_up_voucher_id").eq("year", year).eq("month", month).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row?.confirmed_at) return { ok: true };

  await reverseInventoryJv(supabase, row.true_up_voucher_id, {
    unlink: { table: "month_topsheets", column: "true_up_voucher_id", id: row.id },
  });
  await undoAdjustments(supabase, row.id);
  const { error: uErr } = await supabase.from("month_topsheets").update({ confirmed_at: null, confirmed_by: null }).eq("id", row.id);
  if (uErr) return { ok: false, error: uErr.message };
  await recostOpenMonths(supabase);
  return { ok: true };
}
