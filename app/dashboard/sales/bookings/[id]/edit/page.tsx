import { createClient } from "@/lib/supabase/server";
import BookingForm, { type BookingEditContext } from "../../new/BookingForm";
import EditBookingForm from "./EditBookingForm";
import { notFound } from "next/navigation";
import { resolveRate } from "@/lib/rateHistory";
import { calcQuotedUnitPrice } from "@/lib/calcTubeCutting";

export default async function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("bookings")
    .select("id, booking_group_id")
    .eq("id", id)
    .single();
  if (!current) return notFound();

  const groupId = current.booking_group_id ?? id;

  const bookingsQuery = supabase
    .from("bookings")
    .select(`*, customers(name), buyers(name), merchants(name),
      finished_goods(length_cm, width_cm, thickness),
      booking_materials(quantity_lbs, raw_materials(material_name)),
      production_orders(id, stage, blowing_completed_at, printing_completed_at, cutting_completed_at,
        blowing_produced_lbs, printing_produced_pcs, cutting_produced_pcs)`)
    .order("created_at", { ascending: true });

  const { data: bookings } = current.booking_group_id
    ? await bookingsQuery.eq("booking_group_id", groupId)
    : await bookingsQuery.eq("id", id);

  if (!bookings || bookings.length === 0) return notFound();
  const first: any = bookings[0];
  const bookingIds = bookings.map((b: any) => b.id);

  // ── Structural edit guard ────────────────────────────────────────────────
  // Production শুরু হলে / Delivery Challan / Proforma Invoice / হাতে-বানানো Sales
  // Invoice যুক্ত থাকলে full ফর্ম নয়, শুধু soft-field ফর্ম।
  const productionStarted = bookings.some((b: any) => {
    const po = b.production_orders?.[0];
    if (!po) return false;
    return (
      po.blowing_completed_at || po.printing_completed_at || po.cutting_completed_at ||
      (po.blowing_produced_lbs || 0) > 0 || (po.printing_produced_pcs || 0) > 0 || (po.cutting_produced_pcs || 0) > 0 ||
      (po.stage && po.stage !== "blowing")
    );
  });

  const poIds = bookings.flatMap((b: any) => (b.production_orders ?? []).map((p: any) => p.id)).filter(Boolean);
  const [{ data: challans }, { data: piItems }, { data: invItems }, { data: fgReceives }, { data: wastages }] = await Promise.all([
    supabase.from("delivery_challans").select("id").in("booking_id", bookingIds),
    supabase.from("pi_items").select("id").in("booking_id", bookingIds),
    supabase.from("sales_invoice_items").select("invoice_id").in("booking_id", bookingIds),
    poIds.length ? supabase.from("finished_goods_receive").select("id").in("production_id", poIds) : Promise.resolve({ data: [] as any[] }),
    poIds.length ? supabase.from("wastage").select("id").in("production_id", poIds) : Promise.resolve({ data: [] as any[] }),
  ]);

  // embed এড়িয়ে আলাদা query (embed-এর array/object আচরণ role-ভেদে বদলায় — bookingDelete.ts-এর মতোই)
  const invoiceIds = Array.from(new Set((invItems ?? []).map((it: any) => it.invoice_id).filter(Boolean)));
  let hasManualInvoice = false;
  if (invoiceIds.length > 0) {
    const { data: invs } = await supabase
      .from("sales_invoices").select("id, auto_generated, source_booking_group_id").in("id", invoiceIds);
    hasManualInvoice = (invs ?? []).some(
      (v: any) => !(v.auto_generated && v.source_booking_group_id === groupId),
    );
  }

  const structuralLocked =
    productionStarted ||
    (challans ?? []).length > 0 ||
    (piItems ?? []).length > 0 ||
    (fgReceives ?? []).length > 0 ||
    (wastages ?? []).length > 0 ||
    hasManualInvoice;

  // ── Locked → পুরনো soft-field ফর্ম ──────────────────────────────────────
  if (structuralLocked) {
    const { data: customer } = await supabase
      .from("customers").select("price_per_lbs").eq("id", first.customer_id).maybeSingle();
    const { data: rateHistory } = await supabase
      .from("rate_history").select("effective_from, rate").eq("customer_id", first.customer_id);
    const pricePerLbs = resolveRate(rateHistory ?? [], first.booking_date, customer?.price_per_lbs ?? 0);

    const reason = productionStarted
      ? "এই বুকিং-এর Production শুরু হয়ে গেছে"
      : (challans ?? []).length > 0
        ? "এই বুকিং-এর সাথে Delivery Challan যুক্ত"
        : (piItems ?? []).length > 0
          ? "এই বুকিং-এর সাথে Proforma Invoice (PI) যুক্ত"
          : hasManualInvoice
            ? "এই বুকিং-এর সাথে হাতে-বানানো Sales Invoice যুক্ত"
            : "এই বুকিং প্রোডাকশন/স্টকে ব্যবহৃত হয়েছে";

    return (
      <div>
        <h1 className="text-2xl font-semibold mb-2">Booking এডিট করুন — {first.booking_no}</h1>
        <p className="mb-4 text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg p-3">
          {reason} — তাই Quantity / মাপ / Material / Thickness এখান থেকে বদলানো যাবে না। শুধু নিচের
          ফিল্ডগুলো বদলানো যাবে। পুরো বদল দরকার হলে বুকিং Delete করে নতুন করে দিন।
        </p>
        <EditBookingForm booking={first} pricePerLbs={pricePerLbs} />
      </div>
    );
  }

  // ── Unlocked → full BookingForm (edit mode) ─────────────────────────────
  const [
    { data: customers }, { data: warehouses }, { data: materials },
    { data: buyersMaster }, { data: garmentsMaster }, { data: merchantsMaster }, { data: priceHistory },
    { data: autoInvoice },
  ] = await Promise.all([
    supabase.from("customers").select("*").order("name"),
    supabase.from("warehouses").select("id, name").order("name"),
    supabase.from("raw_materials").select("id, material_name").order("material_name"),
    supabase.from("buyers").select("id, customer_id, name, booking_thickness_mm, production_thickness_mm, pi_thickness_mm, print_colors_default, adhesive_rate_per_inch").order("name"),
    supabase.from("garments").select("id, customer_id, name, address").order("name"),
    supabase.from("merchants").select("id, name").order("name"),
    supabase.from("rate_history").select("customer_id, effective_from, rate").not("customer_id", "is", null),
    supabase.from("sales_invoices").select("payment_received").eq("source_booking_group_id", groupId).eq("auto_generated", true).maybeSingle(),
  ]);

  const warehouseName: Record<string, string> = {};
  (warehouses ?? []).forEach((w: any) => (warehouseName[w.id] = w.name));

  const CM_PER_INCH = 2.54;

  // Booking Date-এ কার্যকর Price/Lbs — পুরনো Adjust/Pc implied ভাবে বের করতে লাগে
  // (quoted_unit_price − formula দাম)। এই ফর্ম আলাদা adjustment কলাম রাখে না।
  const editCustomer = (customers ?? []).find((c: any) => c.id === first.customer_id);
  const historyForCustomer = (priceHistory ?? []).filter((h: any) => h.customer_id === first.customer_id);
  const effRate = resolveRate(historyForCustomer, first.booking_date, Number(editCustomer?.price_per_lbs ?? 0));

  const items = bookings.map((b: any) => {
    const fg = b.finished_goods;
    const lengthCm = fg?.length_cm ?? (b.measurement_unit === "cm" ? 0 : 0);
    const widthCm = fg?.width_cm ?? 0;
    const materialsNeeded = (b.booking_materials ?? [])
      .map((bm: any) => ({ name: bm.raw_materials?.material_name ?? "", qty: Number(bm.quantity_lbs) || 0 }))
      .filter((m: any) => m.name && m.qty > 0);
    const finalLbs = Number(b.required_lbs) || 0;
    // পুরনো Adjust/Pc = stored Unit Price − formula দাম (rate ভালোভাবে বের হলে তবেই)
    const storedUnit = Number(b.quoted_unit_price) || 0;
    const formulaUnit = calcQuotedUnitPrice(b, effRate, Number(b.thickness_mm) || 0);
    const impliedAdj = formulaUnit > 0 && storedUnit > 0
      ? Math.round((storedUnit - formulaUnit) * 100) / 100
      : 0;
    return {
      style: b.style ?? "",
      customerBookingRef: b.customer_booking_ref ?? "",
      poNo: b.po_no ?? "",
      printLayoutNote: b.print_layout_note ?? "",
      printLayoutFileUrl: b.print_layout_file_url ?? "",
      productDetails: b.product_details ?? "",
      measurementType: b.measurement_type,
      unit: b.measurement_unit,
      lengthVal: Number(b.length_val) || 0,
      widthVal: Number(b.width_val) || 0,
      flapVal: Number(b.flap_val) || 0,
      gussetVal: Number(b.gusset_val) || 0,
      pillowVal: Number(b.pillow_val) || 0,
      thicknessMm: Number(b.thickness_mm) || 0,
      productionThicknessMm: Number(b.production_thickness_mm) || 0,
      piThicknessMm: Number(b.pi_thickness_mm) || 0,
      materialType: b.material_type,
      quantity: Number(b.quantity_pcs) || 0,
      warehouseId: b.warehouse_id ?? "",
      warehouseName: warehouseName[b.warehouse_id] ?? "-",
      finalLbs,
      kg: Number(b.required_kg) || finalLbs * 0.453592,
      bags: Number(b.required_bags) || finalLbs / 55,
      materialsNeeded,
      lengthCm: Number(lengthCm) || (b.measurement_unit === "cm" ? Number(b.length_val) : Number(b.length_val) * CM_PER_INCH) || 0,
      widthCm: Number(widthCm) || (b.measurement_unit === "cm" ? Number(b.width_val) : Number(b.width_val) * CM_PER_INCH) || 0,
      hasPrint: !!b.has_print,
      printColors: Number(b.print_colors) || 0,
      ratePerColor: Number(b.rate_per_color) || 0.20,
      ratePerInch: Number(b.rate_per_inch) || 0.02,
      adjustmentPerPc: impliedAdj,
      unitPrice: Number(b.quoted_unit_price) || 0,
      amount: Number(b.quoted_amount) || 0,
    };
  });

  const editContext: BookingEditContext = {
    groupId,
    bookingNo: first.booking_no,
    bookingDate: first.booking_date,
    customerId: first.customer_id,
    customerName: first.customers?.name ?? "",
    buyerId: first.buyer_id ?? null,
    buyerName: first.buyers?.name ?? null,
    garmentsId: first.garments_id ?? null,
    garmentsName: first.garments_name ?? null,
    merchantId: first.merchant_id ?? null,
    merchantName: first.merchants?.name ?? null,
    deliveryPoint: first.delivery_point ?? "",
    paymentReceived: !!autoInvoice?.payment_received,
    priceOverride: "",
    items: items as BookingEditContext["items"],
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Booking Group এডিট করুন — {first.booking_no}</h1>
      <BookingForm
        customers={(customers ?? []) as any}
        warehouses={warehouses ?? []}
        materials={materials ?? []}
        buyersMaster={buyersMaster ?? []}
        garmentsMaster={garmentsMaster ?? []}
        merchantsMaster={merchantsMaster ?? []}
        priceHistory={(priceHistory ?? []) as any}
        editContext={editContext}
      />
    </div>
  );
}
