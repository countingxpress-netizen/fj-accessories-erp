import { createClient } from "@/lib/supabase/client";
import { recalcBookingStatus } from "@/lib/recalcBookingStatus";
import { reverseInventoryJv, postChallanCogsJv } from "@/lib/inventoryCost";
import { fulfilBookingForChallan, reverseChallanFulfilment } from "@/lib/challanProduction";

type SupabaseClient = ReturnType<typeof createClient>;

// একটা চালান সবসময় এক A4 পেজে ছাপা হয় — এর বেশি লাইন হলে ফর্ম সাবমিট আটকায়।
// (প্রিন্ট লেআউট মোটামুটি এতগুলো রো এক পেজে ধরে; বাকিগুলো আলাদা চালানে দিতে হবে।)
export const MAX_CHALLAN_LINES = 12;

export type ChallanLineInput = {
  bookingId: string;
  productId: string;
  warehouseId: string;
  qtyPcs: number;
  packets: number;
  printLabel?: string | null;
};

/**
 * চালানের সব derived data উল্টে দেয় — header (আর চাইলে items) রেখে:
 *   • shipment COGS JV (Dr 5050 / Cr 1210) reverse
 *   • চালান-ট্রিগার করা FG receive + production completion reverse (lib/challanProduction)
 *   • delivery (out) stock ledger → finished_goods_stock ফেরত
 *   • removeItems হলে delivery_challan_items মুছে দেয়
 * ফেরত: এই চালানে ছিল এমন সব booking id (পরে status recalc-এর জন্য)।
 */
export async function reverseChallanDerived(
  supabase: SupabaseClient,
  challanId: string,
  opts: { removeItems: boolean },
): Promise<string[]> {
  const { data: challanRow } = await supabase
    .from("delivery_challans")
    .select("inventory_voucher_id, booking_id")
    .eq("id", challanId)
    .maybeSingle();

  // COGS JV উল্টান (voucher delete-এর আগে challan-এর inventory_voucher_id null)
  await reverseInventoryJv(supabase, challanRow?.inventory_voucher_id, {
    unlink: { table: "delivery_challans", column: "inventory_voucher_id", id: challanId },
  });

  // চালান-ট্রিগার করা FG Receive + production completion উল্টান
  await reverseChallanFulfilment(supabase, challanId);

  // shipment (out) ledger থেকে finished_goods_stock ফেরত
  const { data: ledgerEntries } = await supabase
    .from("stock_ledger").select("*")
    .eq("reference_type", "delivery").eq("reference_id", challanId);
  for (const entry of ledgerEntries ?? []) {
    const { data: stock } = await supabase
      .from("finished_goods_stock").select("*")
      .eq("product_id", entry.item_id).eq("warehouse_id", entry.warehouse_id).maybeSingle();
    if (stock) {
      await supabase.from("finished_goods_stock")
        .update({ quantity_pcs: Number(stock.quantity_pcs) + Number(entry.quantity), updated_at: new Date().toISOString() })
        .eq("id", stock.id);
    } else {
      await supabase.from("finished_goods_stock").insert({
        product_id: entry.item_id, warehouse_id: entry.warehouse_id, quantity_pcs: entry.quantity,
      });
    }
  }
  await supabase.from("stock_ledger").delete()
    .eq("reference_type", "delivery").eq("reference_id", challanId);

  const { data: itemRows } = await supabase
    .from("delivery_challan_items").select("booking_id").eq("challan_id", challanId);
  const bookingIds = Array.from(new Set([
    ...(itemRows ?? []).map((i: any) => i.booking_id).filter(Boolean),
    ...(challanRow?.booking_id ? [challanRow.booking_id] : []),
  ])) as string[];

  if (opts.removeItems) {
    await supabase.from("delivery_challan_items").delete().eq("challan_id", challanId);
  }
  return bookingIds;
}

/**
 * চালানের লাইনগুলো প্রয়োগ করে — New Challan ও Edit Challan দুই জায়গাতেই:
 *   • delivery_challan_items insert (booking_id, print_label সহ)
 *   • fulfilBookingForChallan — production order finished + এই qty FG-তে receive
 *     (Dr 1210 / Cr 1220 + finished_goods_receive + stock ↑)
 *   • finished_goods_stock ↓  + delivery (out) stock ledger
 *   • shipment COGS JV (Dr 5050 / Cr 1210) → delivery_challans.inventory_voucher_id
 *   • প্রতিটা booking-এর status recalc
 */
export async function applyChallanLines(
  supabase: SupabaseClient,
  args: { challanId: string; challanNo: string; challanDate: string; lines: ChallanLineInput[] },
): Promise<void> {
  const { challanId, challanNo, challanDate, lines } = args;

  // ১. আগে সব item insert — কোনোটা ব্যর্থ হলে stock/JV ছোঁয়ার আগেই থামি
  //    (নাহলে item-হীন একটা zombie challan তৈরি হয়ে থাকত)
  for (const li of lines) {
    const { error } = await supabase.from("delivery_challan_items").insert({
      challan_id: challanId, booking_id: li.bookingId, product_id: li.productId,
      quantity_pcs: li.qtyPcs, packets: li.packets || null,
      print_label: (li.printLabel ?? "").trim() || null,
    });
    if (error) throw new Error(`Challan item সেভ ব্যর্থ হয়েছে: ${error.message}`);
  }

  // ২. প্রতি লাইনে production finish + FG receive + stock out
  for (const li of lines) {
    await fulfilBookingForChallan(supabase, {
      bookingId: li.bookingId, productId: li.productId, warehouseId: li.warehouseId,
      challanId, challanNo, qtyPcs: li.qtyPcs, date: challanDate,
    });

    const { data: stock } = await supabase
      .from("finished_goods_stock").select("*")
      .eq("product_id", li.productId).eq("warehouse_id", li.warehouseId).maybeSingle();
    if (stock) {
      await supabase.from("finished_goods_stock")
        .update({ quantity_pcs: Number(stock.quantity_pcs) - li.qtyPcs, updated_at: new Date().toISOString() })
        .eq("id", stock.id);
    } else {
      await supabase.from("finished_goods_stock")
        .insert({ product_id: li.productId, warehouse_id: li.warehouseId, quantity_pcs: -li.qtyPcs });
    }

    await supabase.from("stock_ledger").insert({
      item_type: "finished_goods", item_id: li.productId, warehouse_id: li.warehouseId,
      txn_type: "out", quantity: li.qtyPcs, reference_type: "delivery", reference_id: challanId, txn_date: challanDate,
    });

    await recalcBookingStatus(supabase, li.bookingId);
  }

  const cogsVoucherId = await postChallanCogsJv(supabase, {
    date: challanDate, challanNo,
    lines: lines.map((li) => ({ productId: li.productId, pcs: li.qtyPcs })),
  });
  if (cogsVoucherId) {
    await supabase.from("delivery_challans").update({ inventory_voucher_id: cogsVoucherId }).eq("id", challanId);
  }
}
