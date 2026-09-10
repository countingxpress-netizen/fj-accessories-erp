import { createClient } from "@/lib/supabase/client";
import { accountIdByCode, makeVoucher, reverseInventoryJv } from "@/lib/inventoryCost";

type Client = ReturnType<typeof createClient>;

const WASTAGE_LOSS_CODE = "5600";
const RECYCLED_INV_CODE = "1203";
const RECYCLED_MATERIAL_NAME = "Recycled Chips";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type BookingWastageMaterial = {
  materialId: string;
  code: string;         // inventory_account_code (1200-1203/1299)
  avgCost: number;      // avg_cost_per_lbs
  bookingQtyLbs: number; // এই booking-এ এই material-এর মোট Lbs (split অনুপাতের জন্য)
};

export type BookingWastageInput = {
  bookingId: string;
  productionOrderId: string | null;
  bookingNo: string;
  warehouseId: string;          // booking-এর গুদাম (এখান থেকে কাঁচামাল কমবে)
  stage: "blowing" | "printing" | "cutting";
  quantityLbs: number;
  recycled: boolean;
  recycledWarehouseId: string | null; // recycled হলে কোন গুদামে Recycled Chips ফিরবে
  wastageDate: string;
  createdBy: string | null;
  materials: BookingWastageMaterial[];
};

/** JV উল্টে দেয় + কাঁচামাল স্টক ফেরত দেয় — row মুছে না (edit-এ লাগে)। */
async function undoBookingWastageEffects(supabase: Client, wastage: any): Promise<void> {
  await reverseInventoryJv(supabase, wastage.inventory_voucher_id, {
    unlink: { table: "wastage", column: "inventory_voucher_id", id: wastage.id },
  });
  const { data: ledgers } = await supabase
    .from("stock_ledger").select("*")
    .eq("reference_type", "wastage").eq("reference_id", wastage.id);
  for (const l of ledgers ?? []) {
    const { data: stock } = await supabase
      .from("raw_material_stock").select("*")
      .eq("material_id", l.item_id).eq("warehouse_id", l.warehouse_id).maybeSingle();
    if (stock) {
      const delta = l.txn_type === "out" ? Number(l.quantity) : -Number(l.quantity);
      await supabase.from("raw_material_stock")
        .update({ quantity_lbs: stock.quantity_lbs + delta, updated_at: new Date().toISOString() })
        .eq("id", stock.id);
    }
    await supabase.from("stock_ledger").delete().eq("id", l.id);
  }
}

/** wastage row আগে থেকেই আছে (id জানা) — fields update + স্টক কর্তন + JV বসায়। */
async function applyBookingWastageEffects(
  supabase: Client, wastageId: string, input: BookingWastageInput,
): Promise<{ ok: boolean; error?: string }> {
  const qty = input.quantityLbs;
  const totalBookingLbs = input.materials.reduce((s, m) => s + (m.bookingQtyLbs || 0), 0);
  if (totalBookingLbs <= 0) return { ok: false, error: "এই বুকিং-এর material split পাওয়া যায়নি।" };

  await supabase.from("wastage").update({
    stage: input.stage, quantity_lbs: qty, recycled: input.recycled,
    wastage_date: input.wastageDate,
  }).eq("id", wastageId);

  const byAccount = new Map<string, number>();
  let wastedValue = 0;
  for (const m of input.materials) {
    const share = (m.bookingQtyLbs || 0) / totalBookingLbs;
    const wastedQty = round2(qty * share);
    if (wastedQty <= 0) continue;

    const { data: stock } = await supabase
      .from("raw_material_stock").select("*")
      .eq("material_id", m.materialId).eq("warehouse_id", input.warehouseId).maybeSingle();
    if (stock) {
      await supabase.from("raw_material_stock")
        .update({ quantity_lbs: stock.quantity_lbs - wastedQty, updated_at: new Date().toISOString() })
        .eq("id", stock.id);
    } else {
      await supabase.from("raw_material_stock")
        .insert({ material_id: m.materialId, warehouse_id: input.warehouseId, quantity_lbs: -wastedQty });
    }
    await supabase.from("stock_ledger").insert({
      item_type: "raw_material", item_id: m.materialId, warehouse_id: input.warehouseId,
      txn_type: "out", quantity: wastedQty,
      reference_type: "wastage", reference_id: wastageId, txn_date: input.wastageDate,
    });

    const val = round2(wastedQty * (m.avgCost || 0));
    wastedValue = round2(wastedValue + val);
    const code = m.code || "1299";
    byAccount.set(code, round2((byAccount.get(code) ?? 0) + val));
  }

  let recoveredValue = 0;
  if (input.recycled && input.recycledWarehouseId) {
    const { data: rec } = await supabase
      .from("raw_materials").select("id, avg_cost_per_lbs").eq("material_name", RECYCLED_MATERIAL_NAME).maybeSingle();
    if (rec) {
      recoveredValue = round2(qty * (Number(rec.avg_cost_per_lbs) || 0));
      const { data: stock } = await supabase
        .from("raw_material_stock").select("*")
        .eq("material_id", rec.id).eq("warehouse_id", input.recycledWarehouseId).maybeSingle();
      if (stock) {
        await supabase.from("raw_material_stock")
          .update({ quantity_lbs: stock.quantity_lbs + qty, updated_at: new Date().toISOString() })
          .eq("id", stock.id);
      } else {
        await supabase.from("raw_material_stock")
          .insert({ material_id: rec.id, warehouse_id: input.recycledWarehouseId, quantity_lbs: qty });
      }
      await supabase.from("stock_ledger").insert({
        item_type: "raw_material", item_id: rec.id, warehouse_id: input.recycledWarehouseId,
        txn_type: "in", quantity: qty,
        reference_type: "wastage", reference_id: wastageId, txn_date: input.wastageDate,
      });
    }
  }

  const lossId = await accountIdByCode(supabase, WASTAGE_LOSS_CODE);
  const lines: { account_id: string; debit: number; credit: number; memo: string }[] = [];
  const netLoss = round2(wastedValue - recoveredValue);
  if (lossId && netLoss > 0) {
    lines.push({ account_id: lossId, debit: netLoss, credit: 0, memo: `Extra wastage — ${input.bookingNo}` });
  }
  if (recoveredValue > 0) {
    const recId = await accountIdByCode(supabase, RECYCLED_INV_CODE);
    if (recId) lines.push({ account_id: recId, debit: recoveredValue, credit: 0, memo: `Recycled recovery — ${input.bookingNo}` });
  }
  for (const [code, amt] of byAccount) {
    const accId = await accountIdByCode(supabase, code);
    if (accId && amt > 0) lines.push({ account_id: accId, debit: 0, credit: amt, memo: `Extra wastage — ${input.bookingNo}` });
  }

  const voucherId = await makeVoucher(
    supabase, input.wastageDate, `Extra production wastage — ${input.bookingNo}`, lines, "inventory",
  );
  if (voucherId) {
    await supabase.from("wastage").update({ inventory_voucher_id: voucherId }).eq("id", wastageId);
  }
  return { ok: true };
}

/**
 * Booking View "Wastage Register" — required_lbs-এর **অতিরিক্ত** ওয়েস্টেজ।
 * material-split অনুপাতে কাঁচামাল স্টক কমে, JV Dr 5600 / Cr <material inv>।
 */
export async function recordBookingWastage(
  supabase: Client, input: BookingWastageInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!(input.quantityLbs > 0)) return { ok: false, error: "সঠিক Quantity দিন।" };
  if (input.recycled && !input.recycledWarehouseId) {
    return { ok: false, error: "Recycled Chips হিসেবে ফেরত দিতে Warehouse বাছুন।" };
  }
  const { data: wastageRow, error: wErr } = await supabase
    .from("wastage")
    .insert({
      production_id: input.productionOrderId, booking_id: input.bookingId,
      stage: input.stage, quantity_lbs: input.quantityLbs, recycled: input.recycled,
      wastage_date: input.wastageDate, deducts_stock: true, created_by: input.createdBy,
    })
    .select("id").single();
  if (wErr || !wastageRow) return { ok: false, error: wErr?.message ?? "Wastage সেভ ব্যর্থ হয়েছে।" };

  return applyBookingWastageEffects(supabase, wastageRow.id, input);
}

export async function updateBookingWastage(
  supabase: Client, wastageId: string, input: BookingWastageInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!(input.quantityLbs > 0)) return { ok: false, error: "সঠিক Quantity দিন।" };
  if (input.recycled && !input.recycledWarehouseId) {
    return { ok: false, error: "Recycled Chips হিসেবে ফেরত দিতে Warehouse বাছুন।" };
  }
  const { data: old } = await supabase.from("wastage").select("*").eq("id", wastageId).maybeSingle();
  if (!old) return { ok: false, error: "Wastage এন্ট্রি খুঁজে পাওয়া যায়নি।" };
  await undoBookingWastageEffects(supabase, old);
  return applyBookingWastageEffects(supabase, wastageId, input);
}

/** Booking Wastage মুছে ফেলা — JV উল্টে দেয় + কাঁচামাল স্টক ফেরত দেয়। */
export async function reverseBookingWastage(supabase: Client, wastage: any): Promise<void> {
  await undoBookingWastageEffects(supabase, wastage);
  await supabase.from("wastage").delete().eq("id", wastage.id);
}
