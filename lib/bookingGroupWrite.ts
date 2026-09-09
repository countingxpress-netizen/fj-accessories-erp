import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { postBookingConsumptionJv, reverseInventoryJv } from "@/lib/inventoryCost";
import { syncAutoInvoiceForGroup } from "@/lib/autoInvoiceFromBooking";

type SupabaseClient = ReturnType<typeof createClient>;

// এক Booking Group সেভ করার পুরো cascade — New Booking ফর্ম আর Booking Group Edit
// দুই জায়গাতেই এই একই লজিক ব্যবহার হয় (formula/হিসাব একবারই লেখা থাকে)।
//
//   bookings (group) → finished_goods → production_orders → booking_materials
//   → raw_material_stock (কমানো) → stock_ledger (out) → material_consumption
//   → postBookingConsumptionJv (Dr 1220 WIP / Cr material inv) → bookings.inventory_voucher_id
//   → syncAutoInvoiceForGroup (auto Sales Invoice + JV)

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

export async function writeBookingGroup(
  supabase: SupabaseClient,
  input: BookingGroupInput,
): Promise<BookingGroupWriteResult> {
  const {
    groupId, bookingNo, bookingDate, customerId, buyerId, merchantId,
    garmentsId, garmentsName, plainCmConversion, deliveryPoint, paymentReceived, createdBy, items,
  } = input;

  const { data: allMaterials } = await supabase.from("raw_materials").select("id, material_name");
  const materialMap: Record<string, string> = {};
  (allMaterials ?? []).forEach((m: any) => (materialMap[m.material_name] = m.id));

  let firstBookingId: string | null = null;

  for (const item of items) {
    // Finished Goods খুঁজুন/তৈরি করুন
    const productName = item.productDetails
      || `${item.style || "Product"} (${item.lengthCm.toFixed(1)}x${item.widthCm.toFixed(1)})`;
    const { data: existingProduct } = await supabase
      .from("finished_goods").select("id")
      .eq("length_cm", Number(item.lengthCm.toFixed(3)))
      .eq("width_cm", Number(item.widthCm.toFixed(3)))
      .eq("thickness", item.thicknessMm)
      .maybeSingle();

    let productId = existingProduct?.id;
    if (!productId) {
      const { data: newProduct } = await supabase
        .from("finished_goods")
        .insert({ product_name: productName, length_cm: item.lengthCm, width_cm: item.widthCm, thickness: item.thicknessMm })
        .select().single();
      productId = newProduct?.id;
    }
    if (!productId) continue;

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        booking_no: bookingNo, customer_id: customerId, buyer_id: buyerId, merchant_id: merchantId,
        style: item.style, product_details: item.productDetails, product_id: productId,
        measurement_type: item.measurementType, measurement_unit: item.unit,
        length_val: item.lengthVal, width_val: item.widthVal,
        flap_val: item.flapVal || null, gusset_val: item.gussetVal || null, pillow_val: item.pillowVal || null,
        thickness_mm: item.thicknessMm, production_thickness_mm: item.productionThicknessMm,
        pi_thickness_mm: item.piThicknessMm,
        material_type: item.materialType,
        quantity_pcs: item.quantity, booking_date: bookingDate,
        required_lbs: Number(item.finalLbs.toFixed(2)),
        required_kg: Number(item.kg.toFixed(2)),
        required_bags: Number(item.bags.toFixed(2)),
        delivery_point: deliveryPoint, print_layout_note: item.printLayoutNote || null,
        print_layout_file_url: item.printLayoutFileUrl || null,
        has_print: item.hasPrint, print_colors: item.printColors,
        rate_per_color: item.ratePerColor, rate_per_inch: item.ratePerInch,
        // Adjust/Pc row-এর Unit Price-এর ভেতরেই আছে (quoted_unit_price)। আলাদা কলামে রাখা
        // হয় না — Booking Edit-এ পুরনো Adjustment implied ভাবে বের করা হয় (page.tsx দেখুন)।
        quoted_unit_price: item.unitPrice || null, quoted_amount: item.amount || null,
        garments_name: garmentsName ?? null,
        garments_id: garmentsId || null, plain_cm_conversion: plainCmConversion,
        booking_group_id: groupId,
        customer_booking_ref: item.customerBookingRef || null,
        po_no: item.poNo || null,
        warehouse_id: item.warehouseId, status: "in_production",
        created_by: createdBy,
      })
      .select().single();

    if (bookingError || !booking) {
      return { ok: false, error: `"${item.style || item.productDetails || 'একটি প্রোডাক্ট'}" সেভ করতে ব্যর্থ হয়েছে: ${bookingError?.message ?? 'অজানা কারণ'}` };
    }
    if (!firstBookingId) firstBookingId = booking.id;

    const productionNo = await generateNextDocNo(supabase, "production_orders", "production_no", "PROD", "order_date", bookingDate);
    const { data: productionOrder } = await supabase
      .from("production_orders")
      .insert({
        production_no: productionNo, booking_id: booking.id, product_id: productId,
        quantity_pcs: item.quantity, stage: "blowing", required_lbs: item.finalLbs, order_date: bookingDate,
      })
      .select().single();

    for (const m of item.materialsNeeded) {
      const materialId = materialMap[m.name];
      if (!materialId || m.qty <= 0) continue;

      await supabase.from("booking_materials").insert({
        booking_id: booking.id, material_id: materialId, quantity_lbs: m.qty,
      });

      const { data: stock } = await supabase
        .from("raw_material_stock").select("*")
        .eq("material_id", materialId).eq("warehouse_id", item.warehouseId).maybeSingle();

      if (stock) {
        await supabase.from("raw_material_stock")
          .update({ quantity_lbs: stock.quantity_lbs - m.qty, updated_at: new Date().toISOString() })
          .eq("id", stock.id);
      } else {
        // স্টক রো আগে থেকে না থাকলেও তৈরি করুন — ঘাটতি (negative) হলেও যেন দেখা যায়
        await supabase.from("raw_material_stock").insert({
          material_id: materialId, warehouse_id: item.warehouseId, quantity_lbs: -m.qty,
        });
      }

      await supabase.from("stock_ledger").insert({
        item_type: "raw_material", item_id: materialId, warehouse_id: item.warehouseId,
        txn_type: "out", quantity: m.qty, reference_type: "production",
        reference_id: productionOrder?.id, txn_date: bookingDate,
      });

      if (productionOrder) {
        await supabase.from("material_consumption").insert({
          production_id: productionOrder.id, material_id: materialId,
          quantity_lbs: m.qty, consumption_date: bookingDate,
        });
      }
    }

    // Perpetual inventory — issue করা কাঁচামালের মূল্য WIP-এ তোলা (Dr 1220 / Cr material inv)
    if (productionOrder) {
      const invVoucherId = await postBookingConsumptionJv(supabase, {
        date: bookingDate,
        bookingNo,
        productionOrderId: productionOrder.id,
        lines: item.materialsNeeded
          .map((m) => ({ materialId: materialMap[m.name], qtyLbs: m.qty }))
          .filter((l) => l.materialId && l.qtyLbs > 0),
      });
      if (invVoucherId) {
        await supabase.from("bookings").update({ inventory_voucher_id: invVoucherId }).eq("id", booking.id);
      }
    }
  }

  // এই booking group-এর জন্য auto Sales Invoice + JV তৈরি/আপডেট (প্রতিটা প্রোডাক্ট একটা লাইন)
  const invResult = await syncAutoInvoiceForGroup(supabase, groupId, {
    invoiceDate: bookingDate, paymentReceived, createdBy,
    createIfMissing: input.createInvoiceIfMissing,
  });
  if (!invResult.ok) {
    return { ok: false, error: `Booking সেভ হয়েছে কিন্তু auto Sales Invoice আপডেটে সমস্যা: ${invResult.error}` };
  }

  return { ok: true, firstBookingId };
}

/**
 * এক Booking Group-এর সব derived data ফেরত/মুছে দেয় — Booking Group Edit-এ
 * নতুন করে লেখার আগে। `deleteBookingCascade`-এর মতোই, কিন্তু guard চেক নেই
 * (কলার পেজ আগেই চেক করে) আর auto Sales Invoice-এর header + voucher রেখে দেয়
 * (শুধু লাইন মুছে) — পরে `writeBookingGroup`-এর sync ওই invoice-ই আপডেট করে,
 * invoice_no একই থাকে।
 */
export async function reverseBookingGroupDerived(
  supabase: SupabaseClient,
  groupId: string,
): Promise<void> {
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, inventory_voucher_id")
    .eq("booking_group_id", groupId);
  const bookingIds = (bookings ?? []).map((b: any) => b.id);
  if (bookingIds.length === 0) return;

  // auto Sales Invoice থাকলে তার লাইনগুলো সরাও (sales_invoice_items.booking_id plain FK —
  // না সরালে booking delete আটকাবে)। header + voucher রেখে দিই।
  const { data: autoInvs } = await supabase
    .from("sales_invoices")
    .select("id")
    .eq("source_booking_group_id", groupId)
    .eq("auto_generated", true);
  for (const inv of autoInvs ?? []) {
    await supabase.from("sales_invoice_items").delete().eq("invoice_id", inv.id);
  }
  // এই group-এর booking-গুলো অন্য কোনো invoice item-এ থাকলেও (থাকার কথা নয় — guard আটকায়)
  // সেসব লাইনও সরাও, নাহলে নিচে booking delete FK-এ আটকাবে।
  await supabase.from("sales_invoice_items").delete().in("booking_id", bookingIds);

  for (const b of bookings ?? []) {
    await reverseInventoryJv(supabase, b.inventory_voucher_id, {
      unlink: { table: "bookings", column: "inventory_voucher_id", id: b.id },
    });

    const { data: prodOrders } = await supabase.from("production_orders").select("id").eq("booking_id", b.id);
    for (const po of prodOrders ?? []) {
      const { data: consumptions } = await supabase.from("material_consumption").select("*").eq("production_id", po.id);
      for (const c of consumptions ?? []) {
        const { data: ledgerEntry } = await supabase
          .from("stock_ledger").select("*")
          .eq("reference_type", "production").eq("reference_id", po.id).eq("item_id", c.material_id).maybeSingle();
        if (ledgerEntry) {
          const { data: stock } = await supabase
            .from("raw_material_stock").select("*")
            .eq("material_id", c.material_id).eq("warehouse_id", ledgerEntry.warehouse_id).maybeSingle();
          if (stock) {
            await supabase.from("raw_material_stock")
              .update({ quantity_lbs: stock.quantity_lbs + c.quantity_lbs, updated_at: new Date().toISOString() })
              .eq("id", stock.id);
          }
          await supabase.from("stock_ledger").delete().eq("id", ledgerEntry.id);
        }
      }
      await supabase.from("material_consumption").delete().eq("production_id", po.id);

      // Production শুরুর আগে edit — সাধারণত থাকবে না, তবু deleteBookingCascade-এর মতো
      // defensively FG Receive / Wastage-ও ফেরত দিই।
      const { data: receives } = await supabase.from("finished_goods_receive").select("*").eq("production_id", po.id);
      for (const r of receives ?? []) {
        await reverseInventoryJv(supabase, r.inventory_voucher_id, {
          unlink: { table: "finished_goods_receive", column: "inventory_voucher_id", id: r.id },
        });
        const { data: ledgerEntry } = await supabase
          .from("stock_ledger").select("*")
          .eq("reference_type", "production").eq("reference_id", po.id)
          .eq("item_type", "finished_goods").eq("item_id", r.product_id).maybeSingle();
        if (ledgerEntry) {
          const { data: stock } = await supabase
            .from("finished_goods_stock").select("*")
            .eq("product_id", r.product_id).eq("warehouse_id", ledgerEntry.warehouse_id).maybeSingle();
          if (stock) {
            await supabase.from("finished_goods_stock")
              .update({ quantity_pcs: stock.quantity_pcs - r.quantity_pcs, updated_at: new Date().toISOString() })
              .eq("id", stock.id);
          }
          await supabase.from("stock_ledger").delete().eq("id", ledgerEntry.id);
        }
      }
      await supabase.from("finished_goods_receive").delete().eq("production_id", po.id);

      const { data: wastages } = await supabase.from("wastage").select("*").eq("production_id", po.id);
      for (const w of wastages ?? []) {
        await reverseInventoryJv(supabase, w.inventory_voucher_id, {
          unlink: { table: "wastage", column: "inventory_voucher_id", id: w.id },
        });
        if (w.recycled) {
          const { data: ledgerEntry } = await supabase
            .from("stock_ledger").select("*")
            .eq("reference_type", "wastage").eq("reference_id", po.id).maybeSingle();
          if (ledgerEntry) {
            const { data: stock } = await supabase
              .from("raw_material_stock").select("*")
              .eq("material_id", ledgerEntry.item_id).eq("warehouse_id", ledgerEntry.warehouse_id).maybeSingle();
            if (stock) {
              await supabase.from("raw_material_stock")
                .update({ quantity_lbs: stock.quantity_lbs - ledgerEntry.quantity, updated_at: new Date().toISOString() })
                .eq("id", stock.id);
            }
            await supabase.from("stock_ledger").delete().eq("id", ledgerEntry.id);
          }
        }
      }
      await supabase.from("wastage").delete().eq("production_id", po.id);
    }

    await supabase.from("production_orders").delete().eq("booking_id", b.id);
    await supabase.from("booking_materials").delete().eq("booking_id", b.id);
  }

  await supabase.from("bookings").delete().in("id", bookingIds);
}
