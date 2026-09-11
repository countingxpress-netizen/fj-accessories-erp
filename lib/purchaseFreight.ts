// Purchase Freight / Carrying — ক্রয়ের freight/labour খরচ কাঁচামালের দামে যোগ করে।
//
//   JV:  Dr <material inventory acct 1200-1203/1299 — entry-র Lbs-অনুপাতে ভাগ>
//        Cr <paid via: Cash 1000 / Bank / Md Abu Jafor 3000 / রিপন থিনার 1500>
//
//   raw_materials.avg_cost_per_lbs-এ freight-এর অংশ যোগ হয় recomputeRawAvgCost
//   (lib/inventoryCost.ts) — যেটা পুরো history নতুন করে হিসাব করে, তাই freight
//   পরে যোগ/সরালেও এমনিতেই আপডেট হয়।
//
//   source = 'with_purchase' (Purchase Entry ফর্ম থেকে) | 'separate' (আলাদা Freight ফর্ম)।

import { accountIdByCode, makeVoucher, recomputeRawAvgCost } from "@/lib/inventoryCost";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** entry-তে থাকা সব raw material id (avg cost recompute-এর জন্য)। */
export async function materialsInEntry(supabase: Client, purchaseEntryId: string): Promise<string[]> {
  const { data } = await supabase
    .from("purchase_entry_items")
    .select("material_id")
    .eq("entry_id", purchaseEntryId);
  return Array.from(new Set((data ?? []).map((r: any) => r.material_id).filter(Boolean))) as string[];
}

/** entry-র সব material-এর weighted avg cost নতুন করে হিসাব করে। */
export async function recomputeEntryMaterials(supabase: Client, purchaseEntryId: string): Promise<void> {
  for (const mid of await materialsInEntry(supabase, purchaseEntryId)) {
    await recomputeRawAvgCost(supabase, mid);
  }
}

/** একটা freight charge-এর সাথে লিংক করা JV (থাকলে) মুছে দেয় ও voucher_id null করে।
 *  charge.voucher_id → journal_vouchers plain FK — voucher delete করার আগে অবশ্যই
 *  charge-এর লিংকটা null করতে হয়, নইলে FK-এ আটকে orphan voucher থেকে যায়। */
async function deleteFreightVoucher(supabase: Client, charge: { id: string; voucher_id?: string | null }): Promise<void> {
  if (!charge.voucher_id) return;
  await supabase.from("purchase_freight_charges").update({ voucher_id: null }).eq("id", charge.id);
  await supabase.from("journal_entry_lines").delete().eq("voucher_id", charge.voucher_id);
  await supabase.from("journal_vouchers").delete().eq("id", charge.voucher_id);
}

/**
 * একটা freight charge-এর JV পোস্ট করে (আগে কোনো JV থাকলে সেটা ধরে না — কল করার
 * আগে deleteFreightVoucher দিয়ে পরিষ্কার করে নিন)।
 * entry-তে কোনো material লাইন না থাকলে বা account না মিললে null।
 */
export async function postFreightJv(
  supabase: Client,
  args: {
    chargeId: string;
    purchaseEntryId: string;
    entryNo?: string | null;
    date: string;
    amount: number;
    paidViaAccountId: string;
    description?: string | null;
  },
): Promise<string | null> {
  if (!(args.amount > 0) || !args.paidViaAccountId) return null;

  const { data: items } = await supabase
    .from("purchase_entry_items")
    .select("quantity_lbs, raw_materials(inventory_account_code)")
    .eq("entry_id", args.purchaseEntryId);

  const qtyByCode = new Map<string, number>();
  let totalQty = 0;
  (items ?? []).forEach((it: any) => {
    const q = Number(it.quantity_lbs) || 0;
    if (q <= 0) return;
    const code = it.raw_materials?.inventory_account_code || "1299";
    qtyByCode.set(code, (qtyByCode.get(code) ?? 0) + q);
    totalQty += q;
  });
  if (totalQty <= 0 || qtyByCode.size === 0) return null;

  // Lbs-অনুপাতে ভাগ — রাউন্ডিং বাকিটা সবচেয়ে বড় লাইনে বসিয়ে Dr = Cr রাখা হয়
  const shares = [...qtyByCode.entries()].map(([code, q]) => ({
    code,
    amount: round2(args.amount * (q / totalQty)),
  }));
  const diff = round2(args.amount - shares.reduce((s, x) => s + x.amount, 0));
  if (diff !== 0) {
    let idx = 0;
    for (let i = 1; i < shares.length; i++) if (shares[i].amount > shares[idx].amount) idx = i;
    shares[idx].amount = round2(shares[idx].amount + diff);
  }

  const memo = `Freight — ${args.entryNo ? "Purchase " + args.entryNo : "Purchase"}`;
  const lines: { account_id: string; debit: number; credit: number; memo: string }[] = [];
  for (const s of shares) {
    if (s.amount <= 0) continue;
    const accId = await accountIdByCode(supabase, s.code);
    if (accId) lines.push({ account_id: accId, debit: s.amount, credit: 0, memo });
  }
  if (lines.length === 0) return null;
  lines.push({ account_id: args.paidViaAccountId, debit: 0, credit: args.amount, memo });

  const narration = `Freight/Labour — ${args.entryNo ? "Purchase " + args.entryNo : "Purchase"}${
    args.description ? " (" + args.description + ")" : ""
  }`;
  const voucherId = await makeVoucher(supabase, args.date, narration, lines, "freight");
  if (voucherId) {
    await supabase.from("purchase_freight_charges").update({ voucher_id: voucherId }).eq("id", args.chargeId);
  }
  return voucherId;
}

/**
 * entry-র material লাইন বদলানোর পর — ওই entry-র প্রতিটা বিদ্যমান freight charge-এর
 * JV নতুন Lbs-অনুপাতে আবার পোস্ট করে। (avg cost recompute কলার করবে।)
 */
export async function repostFreightForEntry(
  supabase: Client,
  purchaseEntryId: string,
  entryNo?: string | null,
): Promise<void> {
  const { data: charges } = await supabase
    .from("purchase_freight_charges")
    .select("id, voucher_id, charge_date, amount, paid_via_account_id, description")
    .eq("purchase_entry_id", purchaseEntryId);

  for (const c of charges ?? []) {
    await deleteFreightVoucher(supabase, c);
    await postFreightJv(supabase, {
      chargeId: c.id,
      purchaseEntryId,
      entryNo,
      date: c.charge_date,
      amount: Number(c.amount) || 0,
      paidViaAccountId: c.paid_via_account_id,
      description: c.description,
    });
  }
}

/**
 * Purchase Entry মুছে ফেলার সময় — ওই entry-র সব freight charge-এর JV মুছে দেয়।
 * charge row-গুলো purchase_entries FK cascade-এ এমনিতেই মুছে যাবে।
 */
export async function reverseFreightVouchersForEntry(supabase: Client, purchaseEntryId: string): Promise<void> {
  const { data: charges } = await supabase
    .from("purchase_freight_charges")
    .select("id, voucher_id")
    .eq("purchase_entry_id", purchaseEntryId);
  for (const c of charges ?? []) await deleteFreightVoucher(supabase, c);
}

/**
 * 'with_purchase' freight charge মুছে দেয় (JV + row) — Purchase Entry এডিটে ব্যবহার।
 * 'separate' charge-গুলো অক্ষত থাকে (repostFreightForEntry পরে সেগুলোর JV ঠিক করে)।
 */
export async function deleteWithPurchaseFreight(supabase: Client, purchaseEntryId: string): Promise<void> {
  const { data: charges } = await supabase
    .from("purchase_freight_charges")
    .select("id, voucher_id")
    .eq("purchase_entry_id", purchaseEntryId)
    .eq("source", "with_purchase");
  const voucherIds = (charges ?? []).map((c: any) => c.voucher_id).filter(Boolean) as string[];
  // charge row আগে মুছুন — তারপর voucher (voucher_id FK আটকাবে না)
  await supabase.from("purchase_freight_charges").delete().eq("purchase_entry_id", purchaseEntryId).eq("source", "with_purchase");
  for (const vid of voucherIds) {
    await supabase.from("journal_entry_lines").delete().eq("voucher_id", vid);
    await supabase.from("journal_vouchers").delete().eq("id", vid);
  }
}

/** একটা freight charge সম্পূর্ণ মুছে দেয় (JV + row) ও affected material-এর avg cost আবার হিসাব করে। */
export async function removeFreightCharge(supabase: Client, chargeId: string): Promise<void> {
  const { data: charge } = await supabase
    .from("purchase_freight_charges")
    .select("id, voucher_id, purchase_entry_id")
    .eq("id", chargeId)
    .maybeSingle();
  if (!charge) return;
  await deleteFreightVoucher(supabase, charge);
  await supabase.from("purchase_freight_charges").delete().eq("id", chargeId);
  await recomputeEntryMaterials(supabase, charge.purchase_entry_id);
}
