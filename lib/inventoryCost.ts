import { generateNextDocNo } from "@/lib/docNumber";

// Perpetual inventory & COGS — Booking (কাঁচামাল issue), FG Receive, Delivery
// Challan, Wastage — সব জায়গায় এই শেয়ার্ড লজিক ব্যবহার হয়।
//
//   Booking        Dr 1220 WIP           / Cr <material inv acct 1200–1203/1299>
//   FG Receive     Dr 1210 FG Inventory  / Cr 1220 WIP
//   Delivery       Dr 5050 COGS          / Cr 1210 FG Inventory
//   Wastage        Dr 5600 Wastage Loss (+Dr 1203 recycled) / Cr 1220 WIP
//
// খরচ: raw material — সব purchase-এর weighted average per lb (raw_materials.avg_cost_per_lbs);
//      finished good — issue করা WIP cost ÷ pcs, moving average (finished_goods.avg_cost_per_pc)।

export const WIP_CODE = "1220";          // Work-in-Process Inventory
export const FG_INV_CODE = "1210";        // Finished Goods Inventory (chart-এ আগে থেকেই আছে)
export const COGS_CODE = "5050";          // Cost of Goods Sold
export const WASTAGE_LOSS_CODE = "5600";  // Wastage Loss (chart-এ আগে থেকেই আছে)
export const RECYCLED_INV_CODE = "1203";  // Raw Material Inventory - Recycled Chips

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

async function accountIdByCode(supabase: Client, code: string): Promise<string | null> {
  if (!code) return null;
  const { data } = await supabase
    .from("chart_of_accounts").select("id").eq("account_code", code).maybeSingle();
  return data?.id ?? null;
}

async function makeVoucher(
  supabase: Client,
  date: string,
  narration: string,
  lines: { account_id: string; debit: number; credit: number; memo: string }[]
): Promise<string | null> {
  const clean = lines.filter((l) => l.account_id && (l.debit > 0 || l.credit > 0));
  const totalDr = clean.reduce((s, l) => s + l.debit, 0);
  const totalCr = clean.reduce((s, l) => s + l.credit, 0);
  if (clean.length < 2 || totalDr <= 0 || Math.abs(totalDr - totalCr) > 0.01) return null;

  const voucherNo = await generateNextDocNo(
    supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", date
  );
  const { data: voucher } = await supabase
    .from("journal_vouchers")
    .insert({ voucher_no: voucherNo, voucher_date: date, narration })
    .select("id").single();
  if (!voucher) return null;

  await supabase.from("journal_entry_lines").insert(clean.map((l) => ({ voucher_id: voucher.id, ...l })));
  return voucher.id;
}

/** সব purchase history থেকে material-টার weighted average খরচ আবার হিসাব করে বসায়। */
export async function recomputeRawAvgCost(supabase: Client, materialId: string): Promise<number> {
  const { data: items } = await supabase
    .from("purchase_entry_items")
    .select("quantity_lbs, rate_per_lbs")
    .eq("material_id", materialId);

  let qty = 0, value = 0;
  (items ?? []).forEach((it: any) => {
    const q = Number(it.quantity_lbs) || 0;
    qty += q;
    value += q * (Number(it.rate_per_lbs) || 0);
  });
  const avg = qty > 0 ? round4(value / qty) : 0;
  await supabase.from("raw_materials").update({ avg_cost_per_lbs: avg }).eq("id", materialId);
  return avg;
}

/**
 * Booking — issue করা কাঁচামালের মূল্য WIP-এ তোলে।
 * Dr 1300 WIP (মোট) / Cr প্রতিটা material-এর inventory account (নিজ নিজ মূল্যে)।
 * production_orders.wip_cost = মোট মূল্য বসায়। voucher id ফেরত দেয় (কিছু না হলে null)।
 */
export async function postBookingConsumptionJv(
  supabase: Client,
  args: {
    date: string;
    bookingNo: string;
    productionOrderId: string;
    lines: { materialId: string; qtyLbs: number }[];
  }
): Promise<string | null> {
  const byAccount = new Map<string, number>();
  let total = 0;

  for (const l of args.lines) {
    if (!l.materialId || !(l.qtyLbs > 0)) continue;
    const { data: mat } = await supabase
      .from("raw_materials")
      .select("avg_cost_per_lbs, inventory_account_code")
      .eq("id", l.materialId).maybeSingle();
    const cost = round2(l.qtyLbs * (Number(mat?.avg_cost_per_lbs) || 0));
    if (cost <= 0) continue;
    const code = mat?.inventory_account_code || "1299";
    byAccount.set(code, round2((byAccount.get(code) ?? 0) + cost));
    total = round2(total + cost);
  }

  if (total <= 0) return null;

  const wipId = await accountIdByCode(supabase, WIP_CODE);
  if (!wipId) return null;

  const lines: { account_id: string; debit: number; credit: number; memo: string }[] = [
    { account_id: wipId, debit: total, credit: 0, memo: `RM issued — ${args.bookingNo}` },
  ];
  for (const [code, amt] of byAccount) {
    const accId = await accountIdByCode(supabase, code);
    if (accId) lines.push({ account_id: accId, debit: 0, credit: amt, memo: `RM issued — ${args.bookingNo}` });
  }

  const voucherId = await makeVoucher(
    supabase, args.date, `RM issued to production — ${args.bookingNo}`, lines
  );
  if (voucherId) {
    await supabase.from("production_orders").update({ wip_cost: total }).eq("id", args.productionOrderId);
  }
  return voucherId;
}

/**
 * FG Receive — production order-এর WIP মূল্য Finished Goods Inventory-তে সরায়।
 * finished_goods_stock বাড়ানোর **আগে** ডাকতে হবে (moving-avg হিসাবের জন্য)।
 * Dr 1400 FG Inv / Cr 1300 WIP। finished_goods.avg_cost_per_pc আপডেট করে।
 */
export async function postFgReceiveJv(
  supabase: Client,
  args: { date: string; productionOrderId: string; productionNo: string; productId: string; pcs: number }
): Promise<{ voucherId: string | null; unitCost: number; totalCost: number }> {
  const nil = { voucherId: null as string | null, unitCost: 0, totalCost: 0 };
  if (!(args.pcs > 0)) return nil;

  const { data: po } = await supabase
    .from("production_orders").select("wip_cost, quantity_pcs").eq("id", args.productionOrderId).maybeSingle();
  const wipCost = Number(po?.wip_cost) || 0;
  const orderPcs = Number(po?.quantity_pcs) || 0;
  if (wipCost <= 0) return nil;

  // পুরো অর্ডার একবারে এলে সব WIP সরে; আংশিক এলে অনুপাতে
  const transfer = orderPcs > 0 && args.pcs < orderPcs
    ? round2(wipCost * (args.pcs / orderPcs))
    : round2(wipCost);
  if (transfer <= 0) return nil;

  const unitCost = round4(transfer / args.pcs);

  const [fgId, wipId] = await Promise.all([
    accountIdByCode(supabase, FG_INV_CODE),
    accountIdByCode(supabase, WIP_CODE),
  ]);
  if (!fgId || !wipId) return nil;

  const voucherId = await makeVoucher(
    supabase, args.date, `Finished goods to store — ${args.productionNo}`,
    [
      { account_id: fgId, debit: transfer, credit: 0, memo: `FG received — ${args.productionNo}` },
      { account_id: wipId, debit: 0, credit: transfer, memo: `FG received — ${args.productionNo}` },
    ]
  );
  if (!voucherId) return nil;

  await supabase.from("production_orders")
    .update({ wip_cost: round2(wipCost - transfer) })
    .eq("id", args.productionOrderId);

  // finished_goods.avg_cost_per_pc — এই receipt যোগ করার আগের মোট stock-এর সাথে moving average
  const { data: fg } = await supabase
    .from("finished_goods").select("avg_cost_per_pc").eq("id", args.productId).maybeSingle();
  const { data: stockRows } = await supabase
    .from("finished_goods_stock").select("quantity_pcs").eq("product_id", args.productId);
  const oldPcs = (stockRows ?? []).reduce((s: number, r: any) => s + (Number(r.quantity_pcs) || 0), 0);
  const oldAvg = Number(fg?.avg_cost_per_pc) || 0;
  const newAvg = oldPcs + args.pcs > 0
    ? round4((oldPcs * oldAvg + args.pcs * unitCost) / (oldPcs + args.pcs))
    : unitCost;
  await supabase.from("finished_goods").update({ avg_cost_per_pc: newAvg }).eq("id", args.productId);

  return { voucherId, unitCost, totalCost: transfer };
}

/**
 * Delivery Challan — shipment-এর জন্য COGS ধরে।
 * Dr 5000 COGS / Cr 1400 FG Inventory = Σ(pcs × finished_goods.avg_cost_per_pc)।
 */
export async function postChallanCogsJv(
  supabase: Client,
  args: { date: string; challanNo: string; lines: { productId: string; pcs: number }[] }
): Promise<string | null> {
  let total = 0;
  for (const l of args.lines) {
    if (!l.productId || !(l.pcs > 0)) continue;
    const { data: fg } = await supabase
      .from("finished_goods").select("avg_cost_per_pc").eq("id", l.productId).maybeSingle();
    total = round2(total + l.pcs * (Number(fg?.avg_cost_per_pc) || 0));
  }
  if (total <= 0) return null;

  const [cogsId, fgId] = await Promise.all([
    accountIdByCode(supabase, COGS_CODE),
    accountIdByCode(supabase, FG_INV_CODE),
  ]);
  if (!cogsId || !fgId) return null;

  return makeVoucher(
    supabase, args.date, `COGS — Delivery Challan ${args.challanNo}`,
    [
      { account_id: cogsId, debit: total, credit: 0, memo: `COGS ${args.challanNo}` },
      { account_id: fgId, debit: 0, credit: total, memo: `COGS ${args.challanNo}` },
    ]
  );
}

/** production order-এ issue করা কাঁচামালের গড় খরচ প্রতি lb (consumption mix অনুযায়ী)। */
export async function poCostPerLb(supabase: Client, productionOrderId: string): Promise<number> {
  const { data: rows } = await supabase
    .from("material_consumption")
    .select("quantity_lbs, raw_materials(avg_cost_per_lbs)")
    .eq("production_id", productionOrderId);
  let qty = 0, value = 0;
  (rows ?? []).forEach((r: any) => {
    const q = Number(r.quantity_lbs) || 0;
    qty += q;
    value += q * (Number(r.raw_materials?.avg_cost_per_lbs) || 0);
  });
  return qty > 0 ? round4(value / qty) : 0;
}

/**
 * Wastage — নষ্ট মালের মূল্য WIP থেকে বাদ দিয়ে COGS-এ (recycled অংশ recycled inv-এ)।
 * Dr 5000 COGS (+ Dr 1203 recycled) / Cr 1300 WIP। production_orders.wip_cost কমায়।
 */
export async function postWastageJv(
  supabase: Client,
  args: {
    date: string;
    productionOrderId: string;
    productionNo: string;
    qtyLbs: number;
    recycledQtyLbs: number;
  }
): Promise<string | null> {
  if (!(args.qtyLbs > 0)) return null;

  const perLb = await poCostPerLb(supabase, args.productionOrderId);
  const wastedValue = round2(args.qtyLbs * perLb);
  if (wastedValue <= 0) return null;

  let recoveredValue = 0;
  if (args.recycledQtyLbs > 0) {
    const { data: rec } = await supabase
      .from("raw_materials").select("avg_cost_per_lbs").eq("material_name", "Recycled Chips").maybeSingle();
    recoveredValue = round2(Math.min(args.recycledQtyLbs, args.qtyLbs) * (Number(rec?.avg_cost_per_lbs) || 0));
  }

  const [lossId, wipId, recId] = await Promise.all([
    accountIdByCode(supabase, WASTAGE_LOSS_CODE),
    accountIdByCode(supabase, WIP_CODE),
    accountIdByCode(supabase, RECYCLED_INV_CODE),
  ]);
  if (!lossId || !wipId) return null;

  const lines = [
    { account_id: lossId, debit: round2(wastedValue - recoveredValue), credit: 0, memo: `Wastage — ${args.productionNo}` },
    { account_id: wipId, debit: 0, credit: wastedValue, memo: `Wastage — ${args.productionNo}` },
  ];
  if (recoveredValue > 0 && recId) {
    lines.push({ account_id: recId, debit: recoveredValue, credit: 0, memo: `Recycled recovery — ${args.productionNo}` });
  }

  const voucherId = await makeVoucher(supabase, args.date, `Production wastage — ${args.productionNo}`, lines);
  if (voucherId) {
    const { data: po } = await supabase
      .from("production_orders").select("wip_cost").eq("id", args.productionOrderId).maybeSingle();
    await supabase.from("production_orders")
      .update({ wip_cost: round2((Number(po?.wip_cost) || 0) - wastedValue) })
      .eq("id", args.productionOrderId);
  }
  return voucherId;
}

/** JV + তার lines মুছে দেয় (delete cascade-এ ব্যবহার)। null হলে কিছু করে না। */
export async function reverseInventoryJv(
  supabase: Client,
  voucherId: string | null | undefined,
  opts?: { restoreWipToProductionOrderId?: string }
) {
  if (!voucherId) return;

  if (opts?.restoreWipToProductionOrderId) {
    // WIP credit line-এর অঙ্ক production order-এর wip_cost-এ ফেরত দিন
    const wipId = await accountIdByCode(supabase, WIP_CODE);
    if (wipId) {
      const { data: wipLine } = await supabase
        .from("journal_entry_lines").select("credit")
        .eq("voucher_id", voucherId).eq("account_id", wipId).maybeSingle();
      const back = Number(wipLine?.credit) || 0;
      if (back > 0) {
        const { data: po } = await supabase
          .from("production_orders").select("wip_cost").eq("id", opts.restoreWipToProductionOrderId).maybeSingle();
        await supabase.from("production_orders")
          .update({ wip_cost: round2((Number(po?.wip_cost) || 0) + back) })
          .eq("id", opts.restoreWipToProductionOrderId);
      }
    }
  }

  await supabase.from("journal_entry_lines").delete().eq("voucher_id", voucherId);
  await supabase.from("journal_vouchers").delete().eq("id", voucherId);
}
