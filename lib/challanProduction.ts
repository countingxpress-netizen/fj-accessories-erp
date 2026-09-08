import { createClient } from "@/lib/supabase/client";
import { postFgReceiveJv, reverseInventoryJv } from "@/lib/inventoryCost";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * নতুন Delivery Challan নিয়ম — চালান সেভ হলে ঐ বুকিং-এর production order-কে এগিয়ে দেয়:
 *
 *   • produced counters-এ এই চালানের qty যোগ, তিন স্টেজ (Blowing/Printing/Cutting)
 *     `completed_at` সেট, `stage='finished'` → Production Orders থেকে সরে Complete
 *     Production পেজে চলে যায় (চালান = ঐ qty উৎপাদিত ধরা হয়)।
 *   • এই qty-টুকু Finished Goods-এ receive:
 *       JV  Dr 1210 FG Inventory / Cr 1220 WIP   (এই দফার WIP অংশ)
 *       + finished_goods_receive row (delivery_challan_id দিয়ে লিংক — delete-এ reverse)
 *       + finished_goods_stock ↑  + stock_ledger 'challan_receive'
 *
 * এরপর কলার (DeliveryChallanForm) আগের মতোই shipment COGS (Dr 5050 / Cr 1210) আর
 * finished_goods_stock ↓ করে — net effect: WIP → COGS, stock অপরিবর্তিত।
 *
 * পুরো বুকিং একবারে না গেলে (আংশিক চালান): প্রথম চালানেই stage='finished', পরের
 * চালানগুলো একই finished order-এ বাকি qty receive করতে থাকে, produced counter target-এ
 * গিয়ে থামে।
 */
export async function fulfilBookingForChallan(
  supabase: SupabaseClient,
  args: {
    bookingId: string;
    productId: string;
    warehouseId: string;
    challanId: string;
    challanNo: string;
    qtyPcs: number;
    date: string;
  },
): Promise<void> {
  const { bookingId, productId, warehouseId, challanId, challanNo, qtyPcs, date } = args;
  if (!(qtyPcs > 0) || !warehouseId) return;

  const { data: po } = await supabase
    .from("production_orders")
    .select(
      "id, stage, quantity_pcs, required_lbs, blowing_produced_lbs, printing_produced_pcs, cutting_produced_pcs, blowing_completed_at, printing_completed_at, cutting_completed_at, bookings(has_print)",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!po) return;

  const now = new Date().toISOString();
  const orderPcs = Number(po.quantity_pcs) || 0;
  const requiredLbs = Number(po.required_lbs) || 0;
  const cap = (v: number, max: number) => (max > 0 ? Math.min(v, max) : v);

  // এই production order-এ আগে কত pcs receive হয়েছে (পুরনো Cutting-complete flow বা
  // আগের আংশিক চালান)। শুধু বাকি অংশটুকুই এই চালানে নতুন করে receive হবে — নাহলে
  // দুইবার receive হয়ে FG স্টক বেশি দেখাবে।
  const { data: priorReceives } = await supabase
    .from("finished_goods_receive").select("quantity_pcs").eq("production_id", po.id);
  const alreadyReceivedPcs = (priorReceives ?? []).reduce(
    (s: number, r: any) => s + (Number(r.quantity_pcs) || 0), 0,
  );
  const receivePcs = orderPcs > 0
    ? Math.max(0, Math.min(qtyPcs, orderPcs - alreadyReceivedPcs))
    : Math.max(0, qtyPcs);

  // ── production order এগিয়ে দিন (নতুন উৎপাদিত অংশটুকু produced-এ যোগ) ──
  const lbsShare = orderPcs > 0 ? requiredLbs * (receivePcs / orderPcs) : 0;
  const patch: Record<string, any> = {
    stage: "finished",
    blowing_produced_lbs: cap((Number(po.blowing_produced_lbs) || 0) + lbsShare, requiredLbs),
    cutting_produced_pcs: cap((Number(po.cutting_produced_pcs) || 0) + receivePcs, orderPcs),
    blowing_completed_at: po.blowing_completed_at ?? now,
    cutting_completed_at: po.cutting_completed_at ?? now,
  };
  if ((po as any).bookings?.has_print) {
    patch.printing_produced_pcs = cap((Number(po.printing_produced_pcs) || 0) + receivePcs, orderPcs);
    patch.printing_completed_at = po.printing_completed_at ?? now;
  }
  await supabase.from("production_orders").update(patch).eq("id", po.id);

  if (receivePcs <= 0) return; // পুরোটা আগেই receive হয়ে গেছে — শুধু stage finished করেই যথেষ্ট

  // ── Perpetual: এই qty-র WIP মূল্য Finished Goods Inventory-তে ──────
  const fg = await postFgReceiveJv(supabase, {
    date,
    productionOrderId: po.id,
    productionNo: challanNo,
    productId,
    pcs: receivePcs,
    alreadyReceivedPcs,
  });

  const { data: receiveRow } = await supabase
    .from("finished_goods_receive")
    .insert({
      production_id: po.id,
      product_id: productId,
      quantity_pcs: receivePcs,
      received_date: date,
      delivery_challan_id: challanId,
    })
    .select("id")
    .single();
  if (receiveRow) {
    await supabase.from("finished_goods_receive").update({
      unit_cost: fg.unitCost, total_cost: fg.totalCost, inventory_voucher_id: fg.voucherId,
    }).eq("id", receiveRow.id);
  }

  // ── finished_goods_stock ↑ + ledger ──────────────────────────────
  const { data: stock } = await supabase
    .from("finished_goods_stock").select("*")
    .eq("product_id", productId).eq("warehouse_id", warehouseId).maybeSingle();
  if (stock) {
    await supabase.from("finished_goods_stock")
      .update({ quantity_pcs: Number(stock.quantity_pcs) + receivePcs, updated_at: now })
      .eq("id", stock.id);
  } else {
    await supabase.from("finished_goods_stock")
      .insert({ product_id: productId, warehouse_id: warehouseId, quantity_pcs: receivePcs });
  }

  await supabase.from("stock_ledger").insert({
    item_type: "finished_goods", item_id: productId, warehouse_id: warehouseId,
    txn_type: "in", quantity: receivePcs, reference_type: "challan_receive",
    reference_id: challanId, txn_date: date,
  });
}

/**
 * চালান delete-এর সময় `fulfilBookingForChallan` উল্টে দেয় —
 *   • এই চালানের তৈরি করা finished_goods_receive row(গুলো)-র FG Receive JV reverse
 *     (WIP cost production order-এ ফেরত), row মুছে
 *   • challan_receive ledger + finished_goods_stock ↓
 *   • ঐ production order-এ এই চালানের বাইরে আর কোনো receive না থাকলে stage 'blowing'-এ
 *     ফেরত, produced/completed_at ক্লিয়ার (চালানের কারণেই finished হয়েছিল); বাকি receive
 *     থাকলে শুধু produced counter থেকে এই qty বাদ, finished রাখা হয়।
 */
export async function reverseChallanFulfilment(
  supabase: SupabaseClient,
  challanId: string,
): Promise<void> {
  const { data: receives } = await supabase
    .from("finished_goods_receive")
    .select("id, production_id, product_id, quantity_pcs, inventory_voucher_id")
    .eq("delivery_challan_id", challanId);

  for (const r of receives ?? []) {
    await reverseInventoryJv(supabase, r.inventory_voucher_id, {
      restoreWipToProductionOrderId: r.production_id,
      unlink: { table: "finished_goods_receive", column: "inventory_voucher_id", id: r.id },
    });
    await supabase.from("finished_goods_receive").delete().eq("id", r.id);

    // এই production order-এ আর কোনো receive বাকি আছে কি
    const { data: remaining } = await supabase
      .from("finished_goods_receive")
      .select("quantity_pcs")
      .eq("production_id", r.production_id);
    const remainingPcs = (remaining ?? []).reduce(
      (s: number, x: any) => s + (Number(x.quantity_pcs) || 0), 0,
    );

    if (remainingPcs <= 0) {
      await supabase.from("production_orders").update({
        stage: "blowing",
        blowing_produced_lbs: 0, printing_produced_pcs: 0, cutting_produced_pcs: 0,
        blowing_completed_at: null, printing_completed_at: null, cutting_completed_at: null,
      }).eq("id", r.production_id);
    } else {
      const { data: po } = await supabase
        .from("production_orders")
        .select("quantity_pcs, required_lbs, blowing_produced_lbs, printing_produced_pcs, cutting_produced_pcs")
        .eq("id", r.production_id)
        .maybeSingle();
      if (po) {
        const orderPcs = Number(po.quantity_pcs) || 0;
        const lbsShare = orderPcs > 0 ? (Number(po.required_lbs) || 0) * (Number(r.quantity_pcs) / orderPcs) : 0;
        await supabase.from("production_orders").update({
          blowing_produced_lbs: Math.max(0, (Number(po.blowing_produced_lbs) || 0) - lbsShare),
          printing_produced_pcs: Math.max(0, (Number(po.printing_produced_pcs) || 0) - Number(r.quantity_pcs)),
          cutting_produced_pcs: Math.max(0, (Number(po.cutting_produced_pcs) || 0) - Number(r.quantity_pcs)),
        }).eq("id", r.production_id);
      }
    }
  }

  // finished_goods_stock ↓ — এই চালানের প্রতিটা challan_receive ledger এন্ট্রি একবার করে
  const { data: ledgerEntries } = await supabase
    .from("stock_ledger").select("*")
    .eq("reference_type", "challan_receive").eq("reference_id", challanId);
  for (const le of ledgerEntries ?? []) {
    const { data: st } = await supabase
      .from("finished_goods_stock").select("*")
      .eq("product_id", le.item_id).eq("warehouse_id", le.warehouse_id).maybeSingle();
    if (st) {
      await supabase.from("finished_goods_stock")
        .update({ quantity_pcs: Number(st.quantity_pcs) - Number(le.quantity), updated_at: new Date().toISOString() })
        .eq("id", st.id);
    }
  }

  await supabase.from("stock_ledger").delete()
    .eq("reference_type", "challan_receive").eq("reference_id", challanId);
}
