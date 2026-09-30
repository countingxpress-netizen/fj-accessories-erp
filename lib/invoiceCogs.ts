import { accountIdByCode, makeVoucher, COGS_CODE, WIP_CODE, FG_INV_CODE } from "@/lib/inventoryCost";

// Sales Invoice-এ COGS — বিক্রির সময়ই বিক্রিত মালের কাঁচামাল-খরচ COGS-এ (migration 20260930173608)।
//   প্রতিটা invoice লাইন (booking_id থাকলে):
//     amount = booking-এর কাঁচামাল issue মূল্য (bookings.inventory_voucher_id-এর JV) × min(1, Qty ÷ booking Qty)
//     আগে production order-এর বাকি WIP (wip_cost) থেকে, না কুলালে বাকিটা 1210 FG থেকে (আগেই FG Receive হলে)
//   এক invoice = এক COGS JV: Dr 5050 / Cr 1220 (+ Cr 1210); invoice_cogs-এ লাইনভিত্তিক রেকর্ড।
// Invoice সেভ/এডিটের পরে syncInvoiceCogs (আগেরটা উল্টে নতুন করে), ডিলিটের আগে reverseInvoiceCogs।
// booking-এর কাঁচামাল JV না থাকলে (issue-এর সময় cost 0) সেই লাইনের COGS 0 — WIP-এ কিছুই ওঠেনি।

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** invoice-এর আগের COGS উল্টে দেয় — wip_cost ফেরত, JV ও invoice_cogs সারি মুছে। */
export async function reverseInvoiceCogs(supabase: Client, invoiceId: string): Promise<void> {
  const { data: rows } = await supabase
    .from("invoice_cogs").select("id, production_order_id, voucher_id, wip_amount").eq("invoice_id", invoiceId);
  if (!rows || rows.length === 0) return;

  for (const r of rows as any[]) {
    const wip = Number(r.wip_amount) || 0;
    if (r.production_order_id && wip !== 0) {
      const { data: po } = await supabase.from("production_orders").select("wip_cost").eq("id", r.production_order_id).maybeSingle();
      await supabase.from("production_orders")
        .update({ wip_cost: round2((Number(po?.wip_cost) || 0) + wip) })
        .eq("id", r.production_order_id);
    }
  }
  const voucherIds = [...new Set((rows as any[]).map((r) => r.voucher_id).filter(Boolean))] as string[];
  await supabase.from("invoice_cogs").delete().eq("invoice_id", invoiceId);
  for (const v of voucherIds) {
    await supabase.from("journal_entry_lines").delete().eq("voucher_id", v);
    await supabase.from("journal_vouchers").delete().eq("id", v);
  }
}

/** invoice-এর COGS নতুন করে বসায় (আগেরটা থাকলে উল্টে)। ফেরত দেয় মোট COGS। */
export async function syncInvoiceCogs(supabase: Client, invoiceId: string): Promise<number> {
  await reverseInvoiceCogs(supabase, invoiceId);

  const [{ data: inv }, { data: items }] = await Promise.all([
    supabase.from("sales_invoices").select("invoice_no, invoice_date").eq("id", invoiceId).maybeSingle(),
    supabase.from("sales_invoice_items").select("booking_id, quantity_pcs").eq("invoice_id", invoiceId).not("booking_id", "is", null),
  ]);
  if (!inv || !items || items.length === 0) return 0;

  // একই booking একাধিক লাইনে থাকলে Qty যোগ করে একবার
  const qtyByBooking = new Map<string, number>();
  for (const it of items as any[]) qtyByBooking.set(it.booking_id, (qtyByBooking.get(it.booking_id) ?? 0) + (Number(it.quantity_pcs) || 0));

  const { data: bookings } = await supabase
    .from("bookings").select("id, booking_no, quantity_pcs, inventory_voucher_id, production_orders(id, wip_cost)")
    .in("id", [...qtyByBooking.keys()]);

  const voucherIds = (bookings ?? []).map((b: any) => b.inventory_voucher_id).filter(Boolean);
  const { data: issueLines } = voucherIds.length
    ? await supabase.from("journal_entry_lines").select("voucher_id, debit").in("voucher_id", voucherIds)
    : { data: [] };
  const issueCost = new Map<string, number>();
  for (const l of (issueLines ?? []) as any[]) issueCost.set(l.voucher_id, round2((issueCost.get(l.voucher_id) ?? 0) + (Number(l.debit) || 0)));

  const plan: { bookingId: string; poId: string | null; amount: number; wip: number; fg: number }[] = [];
  for (const b of (bookings ?? []) as any[]) {
    const cost = b.inventory_voucher_id ? issueCost.get(b.inventory_voucher_id) ?? 0 : 0;
    const bookingQty = Number(b.quantity_pcs) || 0;
    if (cost <= 0 || bookingQty <= 0) continue;
    const share = Math.min(1, (qtyByBooking.get(b.id) ?? 0) / bookingQty);
    const amount = round2(cost * share);
    if (amount <= 0) continue;
    const po = Array.isArray(b.production_orders) ? b.production_orders[0] : b.production_orders;
    const wipAvail = Math.max(0, Number(po?.wip_cost) || 0);
    const wip = round2(Math.min(amount, wipAvail));
    plan.push({ bookingId: b.id, poId: po?.id ?? null, amount, wip, fg: round2(amount - wip) });
  }
  const total = round2(plan.reduce((s, p) => s + p.amount, 0));
  if (total <= 0) return 0;

  const [cogsId, wipId, fgId] = await Promise.all([
    accountIdByCode(supabase, COGS_CODE), accountIdByCode(supabase, WIP_CODE), accountIdByCode(supabase, FG_INV_CODE),
  ]);
  if (!cogsId || !wipId || !fgId) return 0;
  const wipTotal = round2(plan.reduce((s, p) => s + p.wip, 0));
  const fgTotal = round2(total - wipTotal);
  const memo = `COGS — Invoice ${inv.invoice_no}`;
  const voucherId = await makeVoucher(supabase, inv.invoice_date, memo, [
    { account_id: cogsId, debit: total, credit: 0, memo },
    { account_id: wipId, debit: 0, credit: wipTotal, memo },
    { account_id: fgId, debit: 0, credit: fgTotal, memo },
  ], "cogs");
  if (!voucherId) return 0;

  for (const p of plan) {
    await supabase.from("invoice_cogs").insert({
      invoice_id: invoiceId, booking_id: p.bookingId, production_order_id: p.poId, voucher_id: voucherId,
      amount: p.amount, wip_amount: p.wip, fg_amount: p.fg,
    });
    if (p.poId && p.wip > 0) {
      const { data: po } = await supabase.from("production_orders").select("wip_cost").eq("id", p.poId).maybeSingle();
      await supabase.from("production_orders").update({ wip_cost: round2((Number(po?.wip_cost) || 0) - p.wip) }).eq("id", p.poId);
    }
  }
  return total;
}
