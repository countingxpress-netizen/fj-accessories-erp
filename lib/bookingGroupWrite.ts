import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { postBookingConsumptionJv, reverseInventoryJv } from "@/lib/inventoryCost";
import { syncAutoInvoiceForGroup } from "@/lib/autoInvoiceFromBooking";
import { syncPiLinesForBookings, deletePiLinesForBookings } from "@/lib/bookingPiSync";

type SupabaseClient = ReturnType<typeof createClient>;

// এক Booking Group সেভ করার পুরো cascade — New Booking ফর্ম (writeBookingGroup) আর Booking
// Group Edit (updateBookingGroupInPlace) দুই জায়গাতেই এই একই হেল্পারগুলো (formula/হিসাব একবারই লেখা)।
//
//   bookings (group) → finished_goods → production_orders → booking_materials
//   → raw_material_stock (কমানো) → stock_ledger (out) → material_consumption
//   → postBookingConsumptionJv (Dr 1220 WIP / Cr material inv) → bookings.inventory_voucher_id
//   → syncAutoInvoiceForGroup (auto Sales Invoice + JV)
//
// Edit এখন in-place — booking row মুছে নতুন লেখা হয় না, তাই booking id একই থাকে এবং
// Production-এর অগ্রগতি (stage/উৎপাদিত পরিমাণ), FG Receive, Challan, Wastage, PI, manual
// Invoice — সবার লিংক অক্ষত থাকে।

export type BookingGroupItemInput = {
  style: string;
  customerBookingRef: string;
  poNo: string;
  printLayoutNote: string;
  printLayoutFileUrl: string;
  productDetails: string;
  measurementType: string;
  unit: string;
  lengthVal: number;
  widthVal: number;
  flapVal: number;
  gussetVal: number;
  pillowVal: number;
  thicknessMm: number;
  productionThicknessMm: number;
  piThicknessMm: number;
  materialType: string;
  quantity: number;
  warehouseId: string;
  finalLbs: number;
  kg: number;
  bags: number;
  hasPrint: boolean;
  printColors: number;
  ratePerColor: number;
  ratePerInch: number;
  lengthCm: number;
  widthCm: number;
  unitPrice: number;
  amount: number;
  materialsNeeded: { name: string; qty: number }[];
  /** Booking Group Edit-এ — এই প্রোডাক্ট কোন বিদ্যমান booking (থাকলে সেটাই in-place আপডেট হয়) */
  sourceBookingId?: string | null;
};

export type BookingGroupInput = {
  groupId: string;
  bookingNo: string;
  bookingDate: string;
  customerId: string;
  buyerId: string | null;
  merchantId: string | null;
  garmentsId: string | null;
  garmentsName: string | null;
  /** আইরিশ / দেবনিয়ার গার্মেন্টস — cm→inch এ die টেবিল বাদ (garments টগল থেকে resolved)। */
  plainCmConversion: boolean;
  deliveryPoint: string;
  paymentReceived: boolean;
  createdBy: string | null;
  /** New Booking সেভে true — auto Sales Invoice না থাকলে তৈরি হবে। */
  createInvoiceIfMissing: boolean;
  items: BookingGroupItemInput[];
};

export type BookingGroupWriteResult =
  | { ok: true; firstBookingId: string | null }
  | { ok: false; error: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

async function loadMaterialMap(supabase: SupabaseClient): Promise<Record<string, string>> {
  const { data: allMaterials } = await supabase.from("raw_materials").select("id, material_name");
  const materialMap: Record<string, string> = {};
  (allMaterials ?? []).forEach((m: any) => (materialMap[m.material_name] = m.id));
  return materialMap;
}

// Finished Goods খুঁজুন/তৈরি করুন (মাপ + thickness দিয়ে)
async function findOrCreateProduct(supabase: SupabaseClient, item: BookingGroupItemInput): Promise<string | null> {
  const productName = item.productDetails
    || `${item.style || "Product"} (${item.lengthCm.toFixed(1)}x${item.widthCm.toFixed(1)})`;
  const { data: existingProduct } = await supabase
    .from("finished_goods").select("id")
    .eq("length_cm", Number(item.lengthCm.toFixed(3)))
    .eq("width_cm", Number(item.widthCm.toFixed(3)))
    .eq("thickness", item.thicknessMm)
    .maybeSingle();
  if (existingProduct?.id) return existingProduct.id;
  const { data: newProduct } = await supabase
    .from("finished_goods")
    .insert({ product_name: productName, length_cm: item.lengthCm, width_cm: item.widthCm, thickness: item.thicknessMm })
    .select().single();
  return newProduct?.id ?? null;
}

// booking row-এর যে ফিল্ডগুলো ফর্ম থেকে আসে (insert ও in-place update — দুটোতেই একই)
function bookingFields(input: BookingGroupInput, item: BookingGroupItemInput) {
  return {
    customer_id: input.customerId, buyer_id: input.buyerId, merchant_id: input.merchantId,
    style: item.style, product_details: item.productDetails,
    measurement_type: item.measurementType, measurement_unit: item.unit,
    length_val: item.lengthVal, width_val: item.widthVal,
    flap_val: item.flapVal || null, gusset_val: item.gussetVal || null, pillow_val: item.pillowVal || null,
    thickness_mm: item.thicknessMm, production_thickness_mm: item.productionThicknessMm,
    pi_thickness_mm: item.piThicknessMm,
    material_type: item.materialType,
    quantity_pcs: item.quantity, booking_date: input.bookingDate,
    required_lbs: Number(item.finalLbs.toFixed(2)),
    required_kg: Number(item.kg.toFixed(2)),
    required_bags: Number(item.bags.toFixed(2)),
    delivery_point: input.deliveryPoint, print_layout_note: item.printLayoutNote || null,
    print_layout_file_url: item.printLayoutFileUrl || null,
    has_print: item.hasPrint, print_colors: item.printColors,
    rate_per_color: item.ratePerColor, rate_per_inch: item.ratePerInch,
    // Adjust/Pc row-এর Unit Price-এর ভেতরেই আছে (quoted_unit_price)। আলাদা কলামে রাখা
    // হয় না — Booking Edit-এ পুরনো Adjustment implied ভাবে বের করা হয় (lib/bookingEditContext.ts)।
    quoted_unit_price: item.unitPrice || null, quoted_amount: item.amount || null,
    garments_name: input.garmentsName ?? null,
    garments_id: input.garmentsId || null, plain_cm_conversion: input.plainCmConversion,
    customer_booking_ref: item.customerBookingRef || null,
    po_no: item.poNo || null,
    warehouse_id: item.warehouseId,
  };
}

/**
 * কাঁচামাল issue — booking_materials + স্টক কর্তন + stock_ledger (out) + material_consumption
 * + WIP JV (Dr 1220 / Cr material inv)। production_orders.wip_cost-এ শুধু এই issue-এর মূল্য
 * যোগ হয় (wipBase = issue-এর আগের wip_cost; নতুন PO-তে 0)।
 */
async function issueMaterials(
  supabase: SupabaseClient,
  args: {
    bookingId: string; bookingNo: string; productionOrderId: string | null; date: string;
    warehouseId: string; materialsNeeded: { name: string; qty: number }[];
    materialMap: Record<string, string>; wipBase: number;
  },
): Promise<void> {
  for (const m of args.materialsNeeded) {
    const materialId = args.materialMap[m.name];
    if (!materialId || m.qty <= 0) continue;

    await supabase.from("booking_materials").insert({
      booking_id: args.bookingId, material_id: materialId, quantity_lbs: m.qty,
    });

    const { data: stock } = await supabase
      .from("raw_material_stock").select("*")
      .eq("material_id", materialId).eq("warehouse_id", args.warehouseId).maybeSingle();
    if (stock) {
      await supabase.from("raw_material_stock")
        .update({ quantity_lbs: stock.quantity_lbs - m.qty, updated_at: new Date().toISOString() })
        .eq("id", stock.id);
    } else {
      // স্টক রো আগে থেকে না থাকলেও তৈরি করুন — ঘাটতি (negative) হলেও যেন দেখা যায়
      await supabase.from("raw_material_stock").insert({
        material_id: materialId, warehouse_id: args.warehouseId, quantity_lbs: -m.qty,
      });
    }

    await supabase.from("stock_ledger").insert({
      item_type: "raw_material", item_id: materialId, warehouse_id: args.warehouseId,
      txn_type: "out", quantity: m.qty, reference_type: "production",
      reference_id: args.productionOrderId, txn_date: args.date,
    });

    if (args.productionOrderId) {
      await supabase.from("material_consumption").insert({
        production_id: args.productionOrderId, material_id: materialId,
        quantity_lbs: m.qty, consumption_date: args.date,
      });
    }
  }

  // Perpetual inventory — issue করা কাঁচামালের মূল্য WIP-এ তোলা (Dr 1220 / Cr material inv)
  if (args.productionOrderId) {
    const invVoucherId = await postBookingConsumptionJv(supabase, {
      date: args.date,
      bookingNo: args.bookingNo,
      productionOrderId: args.productionOrderId,
      lines: args.materialsNeeded
        .map((m) => ({ materialId: args.materialMap[m.name], qtyLbs: m.qty }))
        .filter((l) => l.materialId && l.qtyLbs > 0),
    });
    if (invVoucherId) {
      await supabase.from("bookings").update({ inventory_voucher_id: invVoucherId }).eq("id", args.bookingId);
      // postBookingConsumptionJv wip_cost = এই issue-এর মূল্য বসায় — আগের বাকি WIP (wipBase) যোগ করি
      if (args.wipBase !== 0) {
        const { data: po } = await supabase.from("production_orders").select("wip_cost").eq("id", args.productionOrderId).maybeSingle();
        await supabase.from("production_orders")
          .update({ wip_cost: round2((Number(po?.wip_cost) || 0) + args.wipBase) })
          .eq("id", args.productionOrderId);
      }
    }
  }
}

/**
 * issueMaterials-এর উল্টো — স্টক ফেরত, ledger/consumption/booking_materials মুছে, WIP JV উল্টে।
 * ফেরত দেয় issue JV-র মূল্য (WIP থেকে যতটা বাদ গেল); production_orders.wip_cost থেকেও বাদ দেয়।
 */
async function undoMaterialIssue(
  supabase: SupabaseClient,
  booking: { id: string; inventory_voucher_id: string | null },
  productionOrderId: string | null,
): Promise<void> {
  if (booking.inventory_voucher_id) {
    const { data: jvLines } = await supabase
      .from("journal_entry_lines").select("debit").eq("voucher_id", booking.inventory_voucher_id);
    const issuedValue = round2((jvLines ?? []).reduce((s: number, l: any) => s + (Number(l.debit) || 0), 0));
    await reverseInventoryJv(supabase, booking.inventory_voucher_id, {
      unlink: { table: "bookings", column: "inventory_voucher_id", id: booking.id },
    });
    if (productionOrderId && issuedValue > 0) {
      const { data: po } = await supabase.from("production_orders").select("wip_cost").eq("id", productionOrderId).maybeSingle();
      await supabase.from("production_orders")
        .update({ wip_cost: round2((Number(po?.wip_cost) || 0) - issuedValue) })
        .eq("id", productionOrderId);
    }
  }

  if (productionOrderId) {
    const { data: ledgers } = await supabase
      .from("stock_ledger").select("*")
      .eq("reference_type", "production").eq("reference_id", productionOrderId)
      .eq("item_type", "raw_material").eq("txn_type", "out");
    for (const l of ledgers ?? []) {
      const { data: stock } = await supabase
        .from("raw_material_stock").select("*")
        .eq("material_id", l.item_id).eq("warehouse_id", l.warehouse_id).maybeSingle();
      if (stock) {
        await supabase.from("raw_material_stock")
          .update({ quantity_lbs: Number(stock.quantity_lbs) + Number(l.quantity), updated_at: new Date().toISOString() })
          .eq("id", stock.id);
      }
      await supabase.from("stock_ledger").delete().eq("id", l.id);
    }
    await supabase.from("material_consumption").delete().eq("production_id", productionOrderId);
  }
  await supabase.from("booking_materials").delete().eq("booking_id", booking.id);
}

/** নতুন একটা প্রোডাক্ট (booking + PO + কাঁচামাল issue) লেখে — New Booking ও Edit-এ নতুন প্রোডাক্ট। */
async function insertBookingItem(
  supabase: SupabaseClient, input: BookingGroupInput, item: BookingGroupItemInput, materialMap: Record<string, string>,
): Promise<{ ok: true; bookingId: string | null } | { ok: false; error: string }> {
  const productId = await findOrCreateProduct(supabase, item);
  if (!productId) return { ok: true, bookingId: null };

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .insert({
      ...bookingFields(input, item),
      booking_no: input.bookingNo, product_id: productId,
      booking_group_id: input.groupId, status: "in_production", created_by: input.createdBy,
    })
    .select().single();
  if (bookingError || !booking) {
    return { ok: false, error: `"${item.style || item.productDetails || "একটি প্রোডাক্ট"}" সেভ করতে ব্যর্থ হয়েছে: ${bookingError?.message ?? "অজানা কারণ"}` };
  }

  const productionNo = await generateNextDocNo(supabase, "production_orders", "production_no", "PROD", "order_date", input.bookingDate);
  const { data: productionOrder } = await supabase
    .from("production_orders")
    .insert({
      production_no: productionNo, booking_id: booking.id, product_id: productId,
      quantity_pcs: item.quantity, stage: "blowing", required_lbs: item.finalLbs, order_date: input.bookingDate,
    })
    .select().single();

  await issueMaterials(supabase, {
    bookingId: booking.id, bookingNo: input.bookingNo, productionOrderId: productionOrder?.id ?? null,
    date: input.bookingDate, warehouseId: item.warehouseId, materialsNeeded: item.materialsNeeded,
    materialMap, wipBase: 0,
  });
  return { ok: true, bookingId: booking.id };
}

export async function writeBookingGroup(
  supabase: SupabaseClient,
  input: BookingGroupInput,
): Promise<BookingGroupWriteResult> {
  const materialMap = await loadMaterialMap(supabase);
  let firstBookingId: string | null = null;

  for (const item of input.items) {
    const r = await insertBookingItem(supabase, input, item, materialMap);
    if (!r.ok) return r;
    if (!firstBookingId && r.bookingId) firstBookingId = r.bookingId;
  }

  // এই booking group-এর জন্য auto Sales Invoice + JV তৈরি/আপডেট (প্রতিটা প্রোডাক্ট একটা লাইন)
  const invResult = await syncAutoInvoiceForGroup(supabase, input.groupId, {
    invoiceDate: input.bookingDate, paymentReceived: input.paymentReceived, createdBy: input.createdBy,
    createIfMissing: input.createInvoiceIfMissing,
  });
  if (!invResult.ok) {
    return { ok: false, error: `Booking সেভ হয়েছে কিন্তু auto Sales Invoice আপডেটে সমস্যা: ${invResult.error}` };
  }

  return { ok: true, firstBookingId };
}

// ── Booking Group Edit (in-place) ───────────────────────────────────────────

type ExistingBooking = {
  id: string; inventory_voucher_id: string | null; booking_date: string; warehouse_id: string | null;
  product_id: string | null; style: string | null; product_details: string | null;
  booking_materials: { material_id: string; quantity_lbs: number }[] | null;
  production_orders: {
    id: string; stage: string | null;
    blowing_completed_at: string | null; printing_completed_at: string | null; cutting_completed_at: string | null;
    blowing_produced_lbs: number | null; printing_produced_pcs: number | null; cutting_produced_pcs: number | null;
  }[] | null;
};

const EXISTING_SELECT = `id, inventory_voucher_id, booking_date, warehouse_id, product_id, style, product_details,
  booking_materials(material_id, quantity_lbs),
  production_orders(id, stage, blowing_completed_at, printing_completed_at, cutting_completed_at,
    blowing_produced_lbs, printing_produced_pcs, cutting_produced_pcs)`;

function hasProductionProgress(b: ExistingBooking): boolean {
  const po = (b.production_orders ?? [])[0];
  if (!po) return false;
  return !!(po.blowing_completed_at || po.printing_completed_at || po.cutting_completed_at
    || (po.blowing_produced_lbs || 0) > 0 || (po.printing_produced_pcs || 0) > 0 || (po.cutting_produced_pcs || 0) > 0
    || (po.stage && po.stage !== "blowing"));
}

/**
 * Booking Group Edit — booking row-গুলো জায়গাতেই আপডেট হয় (id একই থাকে):
 *   • ফর্মের প্রতিটা প্রোডাক্ট sourceBookingId দিয়ে বিদ্যমান booking-এ মেলে → ফিল্ড আপডেট, Production
 *     Order-এর Qty/Lbs/তারিখ আপডেট (stage/উৎপাদিত পরিমাণ অপরিবর্তিত)। কাঁচামাল/warehouse/তারিখ
 *     বদলালে তবেই আগের issue ফেরত দিয়ে নতুন করে issue (WIP-এ শুধু পার্থক্য)।
 *   • নতুন প্রোডাক্ট → নতুন booking + PO + issue।
 *   • ফর্ম থেকে মুছে দেওয়া প্রোডাক্ট → তার Production/FG/Wastage/Challan/হাতে-বানানো Invoice
 *     থাকলে পুরো সেভ আটকায় (data হারাবে বলে); না থাকলে কাঁচামাল ফেরত দিয়ে booking মুছে যায়,
 *     তার PI লাইনও মুছে যায়।
 *   • শেষে auto Sales Invoice sync + PI লাইন sync (Qty/মাপ/Description/Thickness, PI total)।
 */
export async function updateBookingGroupInPlace(
  supabase: SupabaseClient,
  input: BookingGroupInput,
): Promise<BookingGroupWriteResult> {
  const { data: existingRaw, error: exErr } = await supabase
    .from("bookings").select(EXISTING_SELECT).eq("booking_group_id", input.groupId)
    .order("created_at", { ascending: true });
  if (exErr) return { ok: false, error: exErr.message };
  const existing = (existingRaw ?? []) as unknown as ExistingBooking[];
  const existingById = new Map(existing.map((b) => [b.id, b]));

  const keptIds = new Set(input.items.map((i) => i.sourceBookingId).filter((id): id is string => !!id && existingById.has(id)));
  const removed = existing.filter((b) => !keptIds.has(b.id));

  // ── ১. মুছে দেওয়া প্রোডাক্ট — কিছু লেখার আগে যাচাই (অগ্রগতি থাকলে আটকাও) ──
  if (removed.length > 0) {
    const removedIds = removed.map((b) => b.id);
    const poIds = removed.flatMap((b) => (b.production_orders ?? []).map((p) => p.id));
    const [{ data: fg }, { data: wst }, { data: dci }, { data: dc }, { data: invItems }, { data: autoInvs }] = await Promise.all([
      poIds.length ? supabase.from("finished_goods_receive").select("production_id").in("production_id", poIds) : Promise.resolve({ data: [] as any[] }),
      supabase.from("wastage").select("booking_id, production_id").or(
        [`booking_id.in.(${removedIds.join(",")})`, ...(poIds.length ? [`production_id.in.(${poIds.join(",")})`] : [])].join(","),
      ),
      supabase.from("delivery_challan_items").select("booking_id").in("booking_id", removedIds),
      supabase.from("delivery_challans").select("booking_id").in("booking_id", removedIds),
      supabase.from("sales_invoice_items").select("booking_id, invoice_id").in("booking_id", removedIds),
      supabase.from("sales_invoices").select("id").eq("source_booking_group_id", input.groupId).eq("auto_generated", true),
    ]);
    const autoInvIds = new Set((autoInvs ?? []).map((i: any) => i.id));
    const blocked: string[] = [];
    for (const b of removed) {
      const poId = (b.production_orders ?? [])[0]?.id;
      const reasons: string[] = [];
      if (hasProductionProgress(b)) reasons.push("Production শুরু হয়েছে");
      if ((fg ?? []).some((r: any) => r.production_id === poId)) reasons.push("FG Receive আছে");
      if ((wst ?? []).some((r: any) => r.booking_id === b.id || (poId && r.production_id === poId))) reasons.push("Wastage আছে");
      if ((dci ?? []).some((r: any) => r.booking_id === b.id) || (dc ?? []).some((r: any) => r.booking_id === b.id)) reasons.push("Challan আছে");
      if ((invItems ?? []).some((r: any) => r.booking_id === b.id && !autoInvIds.has(r.invoice_id))) reasons.push("হাতে-বানানো Invoice আছে");
      if (reasons.length) blocked.push(`"${b.style || b.product_details || "প্রোডাক্ট"}" (${reasons.join(", ")})`);
    }
    if (blocked.length > 0) {
      return {
        ok: false,
        error: `এই প্রোডাক্টগুলো মুছে দেওয়া যাবে না, কারণ এগুলোর কাজ শুরু হয়ে গেছে: ${blocked.join("; ")}। প্রোডাক্টগুলো তালিকায় রেখে Qty/মাপ বদলান।`,
      };
    }
  }

  const materialMap = await loadMaterialMap(supabase);
  let firstBookingId: string | null = null;

  // ── ২. বিদ্যমান প্রোডাক্ট আপডেট / নতুন প্রোডাক্ট যোগ ──
  for (const item of input.items) {
    const old = item.sourceBookingId ? existingById.get(item.sourceBookingId) : undefined;
    if (!old) {
      const r = await insertBookingItem(supabase, input, item, materialMap);
      if (!r.ok) return r;
      if (!firstBookingId && r.bookingId) firstBookingId = r.bookingId;
      continue;
    }
    if (!firstBookingId) firstBookingId = old.id;
    const po = (old.production_orders ?? [])[0] ?? null;

    // FG Receive / Challan হয়ে গেলে finished goods পণ্য বদলানো যাবে না (স্টক ওই পণ্যেই আছে)
    let productId = old.product_id;
    const [{ data: fgr }, { data: dcItems }] = await Promise.all([
      po ? supabase.from("finished_goods_receive").select("id").eq("production_id", po.id).limit(1) : Promise.resolve({ data: [] as any[] }),
      supabase.from("delivery_challan_items").select("id").eq("booking_id", old.id).limit(1),
    ]);
    const productLocked = (fgr ?? []).length > 0 || (dcItems ?? []).length > 0;
    if (!productLocked) productId = (await findOrCreateProduct(supabase, item)) ?? old.product_id;

    const { error: upErr } = await supabase
      .from("bookings")
      .update({ ...bookingFields(input, item), product_id: productId })
      .eq("id", old.id);
    if (upErr) return { ok: false, error: `"${item.style || item.productDetails || "একটি প্রোডাক্ট"}" আপডেট ব্যর্থ: ${upErr.message}` };

    if (po) {
      await supabase.from("production_orders").update({
        quantity_pcs: item.quantity, required_lbs: item.finalLbs, order_date: input.bookingDate,
        ...(productLocked ? {} : { product_id: productId }),
      }).eq("id", po.id);
    }

    // কাঁচামাল — পরিমাণ/warehouse/তারিখ বদলালে তবেই ফেরত দিয়ে নতুন issue
    const oldMats = new Map<string, number>();
    (old.booking_materials ?? []).forEach((m) => oldMats.set(m.material_id, round2((oldMats.get(m.material_id) ?? 0) + Number(m.quantity_lbs))));
    const newMats = new Map<string, number>();
    item.materialsNeeded.forEach((m) => {
      const id = materialMap[m.name];
      if (id && m.qty > 0) newMats.set(id, round2((newMats.get(id) ?? 0) + m.qty));
    });
    const matsChanged = oldMats.size !== newMats.size
      || [...newMats].some(([id, q]) => Math.abs((oldMats.get(id) ?? 0) - q) > 0.009);
    if (matsChanged || old.warehouse_id !== item.warehouseId || old.booking_date !== input.bookingDate) {
      await undoMaterialIssue(supabase, old, po?.id ?? null);
      const { data: poNow } = po
        ? await supabase.from("production_orders").select("wip_cost").eq("id", po.id).maybeSingle()
        : { data: null };
      await issueMaterials(supabase, {
        bookingId: old.id, bookingNo: input.bookingNo, productionOrderId: po?.id ?? null,
        date: input.bookingDate, warehouseId: item.warehouseId, materialsNeeded: item.materialsNeeded,
        materialMap, wipBase: Number(poNow?.wip_cost) || 0,
      });
    }
  }

  // ── ৩. মুছে দেওয়া প্রোডাক্ট সরানো (উপরে যাচাই হয়ে গেছে — কোনো অগ্রগতি নেই) ──
  if (removed.length > 0) {
    const removedIds = removed.map((b) => b.id);
    await deletePiLinesForBookings(supabase, removedIds);
    await supabase.from("sales_invoice_items").delete().in("booking_id", removedIds); // শুধু auto invoice-এর লাইন থাকতে পারে
    for (const b of removed) {
      const po = (b.production_orders ?? [])[0] ?? null;
      await undoMaterialIssue(supabase, b, po?.id ?? null);
      if (po) await supabase.from("production_orders").delete().eq("id", po.id);
    }
    await supabase.from("bookings").delete().in("id", removedIds);
  }

  // ── ৪. auto Sales Invoice + PI লাইন sync ──
  const invResult = await syncAutoInvoiceForGroup(supabase, input.groupId, {
    invoiceDate: input.bookingDate, paymentReceived: input.paymentReceived, createdBy: input.createdBy,
    createIfMissing: input.createInvoiceIfMissing,
  });
  if (!invResult.ok) {
    return { ok: false, error: `Booking সেভ হয়েছে কিন্তু auto Sales Invoice আপডেটে সমস্যা: ${invResult.error}` };
  }

  const keptList = [...keptIds];
  if (keptList.length > 0) await syncPiLinesForBookings(supabase, keptList);

  return { ok: true, firstBookingId };
}
