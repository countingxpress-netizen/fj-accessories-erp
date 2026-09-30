import { createClient } from "@/lib/supabase/server";
import BookingForm, { type BookingEditContext } from "../../new/BookingForm";
import { notFound } from "next/navigation";
import { fetchAllRows } from "@/lib/fetchAll";
import { buildBookingItems, bookingHeader, BOOKING_GROUP_SELECT, type BookingItemProgress } from "@/lib/bookingEditContext";

// Booking Group Edit — সবসময় পুরো ফর্ম। Production শুরু / Challan / FG Receive / Wastage / হাতে-বানানো
// Invoice / PI থাকলেও এডিট করা যায় (in-place — lib/bookingGroupWrite.ts updateBookingGroupInPlace),
// অগ্রগতি অক্ষত থাকে; তবে পেজে ও সেভের সময় বারবার সতর্ক করা হয়।
export default async function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: current } = await supabase.from("bookings").select("id, booking_group_id").eq("id", id).single();
  if (!current) return notFound();
  const groupId = current.booking_group_id ?? id;

  const bookingsQuery = supabase.from("bookings").select(BOOKING_GROUP_SELECT).order("created_at", { ascending: true });
  const { data: bookings } = current.booking_group_id
    ? await bookingsQuery.eq("booking_group_id", groupId)
    : await bookingsQuery.eq("id", id);
  if (!bookings || bookings.length === 0) return notFound();
  const first: any = bookings[0];
  const bookingIds = bookings.map((b: any) => b.id);
  const poIds = bookings.flatMap((b: any) => (b.production_orders ?? []).map((p: any) => p.id)).filter(Boolean);

  const [
    { data: challans }, { data: challanItems }, { data: piItems }, { data: invItems }, { data: fgReceives }, { data: wastages },
    { data: customers }, { data: warehouses }, { data: materials },
    { data: buyersMaster }, { data: garmentsMaster }, { data: merchantsMaster }, { data: priceHistory },
    { data: autoInvoice }, { data: bookingMerchantLinks },
  ] = await Promise.all([
    supabase.from("delivery_challans").select("id, challan_no, booking_id").in("booking_id", bookingIds),
    supabase.from("delivery_challan_items").select("booking_id, quantity_pcs, delivery_challans(challan_no)").in("booking_id", bookingIds),
    supabase.from("pi_items").select("booking_id, proforma_invoices(pi_no)").in("booking_id", bookingIds),
    supabase.from("sales_invoice_items").select("booking_id, sales_invoices(invoice_no, auto_generated, source_booking_group_id)").in("booking_id", bookingIds),
    poIds.length ? supabase.from("finished_goods_receive").select("production_id, quantity_pcs").in("production_id", poIds) : Promise.resolve({ data: [] as any[] }),
    supabase.from("wastage").select("booking_id, production_id, quantity_lbs").or(
      [`booking_id.in.(${bookingIds.join(",")})`, ...(poIds.length ? [`production_id.in.(${poIds.join(",")})`] : [])].join(","),
    ),
    supabase.from("customers").select("*").order("name"),
    supabase.from("warehouses").select("id, name").order("name"),
    supabase.from("raw_materials").select("id, material_name").order("material_name"),
    supabase.from("buyers").select("id, customer_id, name, booking_thickness_mm, production_thickness_mm, pi_thickness_mm, print_colors_default, adhesive_rate_per_inch").order("name"),
    supabase.from("garments").select("id, customer_id, name, address").order("name"),
    supabase.from("merchants").select("id, name").order("name"),
    supabase.from("rate_history").select("customer_id, effective_from, rate, material_type").not("customer_id", "is", null),
    supabase.from("sales_invoices").select("payment_received").eq("source_booking_group_id", groupId).eq("auto_generated", true).maybeSingle(),
    fetchAllRows<any>(supabase, "bookings", "customer_id, merchant_id", (q) => q.not("merchant_id", "is", null)).then((data) => ({ data })),
  ]);

  const one = (v: any) => (Array.isArray(v) ? v[0] : v);
  const nf = (n: number) => Math.round(n).toLocaleString("en-IN");

  // ── প্রতিটা প্রোডাক্টের অগ্রগতি (সতর্কবার্তার জন্য) ──
  const progressById: Record<string, BookingItemProgress> = {};
  for (const b of bookings as any[]) {
    const po = (b.production_orders ?? [])[0];
    const notes: string[] = [];
    if (po?.blowing_completed_at) notes.push("Blowing সম্পন্ন");
    if (po?.printing_completed_at) notes.push("Printing সম্পন্ন");
    if (po?.cutting_completed_at) notes.push("Cutting সম্পন্ন");
    const producedPcs = Number(po?.cutting_produced_pcs) || Number(po?.printing_produced_pcs) || 0;
    if (!po?.cutting_completed_at && producedPcs > 0) notes.push(`উৎপাদিত ${nf(producedPcs)} pcs`);
    if (!notes.length && po && ((Number(po.blowing_produced_lbs) || 0) > 0 || (po.stage && po.stage !== "blowing"))) notes.push("Production শুরু হয়েছে");
    const fgPcs = (fgReceives ?? []).filter((r: any) => r.production_id === po?.id).reduce((s: number, r: any) => s + (Number(r.quantity_pcs) || 0), 0);
    if (fgPcs > 0) notes.push(`FG Receive ${nf(fgPcs)} pcs`);
    const myChallanItems = (challanItems ?? []).filter((r: any) => r.booking_id === b.id);
    const deliveredPcs = myChallanItems.reduce((s: number, r: any) => s + (Number(r.quantity_pcs) || 0), 0);
    const challanNos = new Set<string>([
      ...myChallanItems.map((r: any) => one(r.delivery_challans)?.challan_no).filter(Boolean),
      ...(challans ?? []).filter((c: any) => c.booking_id === b.id).map((c: any) => c.challan_no).filter(Boolean),
    ]);
    if (challanNos.size || deliveredPcs > 0) notes.push(`Challan ${[...challanNos].join(", ")}${deliveredPcs ? ` — ${nf(deliveredPcs)} pcs ডেলিভারি` : ""}`);
    if ((wastages ?? []).some((w: any) => w.booking_id === b.id || (po && w.production_id === po.id))) notes.push("Wastage আছে");
    const manualInv = (invItems ?? [])
      .filter((r: any) => r.booking_id === b.id)
      .map((r: any) => one(r.sales_invoices))
      .filter((v: any) => v && !(v.auto_generated && v.source_booking_group_id === groupId));
    if (manualInv.length) notes.push(`হাতে-বানানো Invoice ${[...new Set(manualInv.map((v: any) => v.invoice_no))].join(", ")}`);
    const piNos = [...new Set((piItems ?? []).filter((r: any) => r.booking_id === b.id).map((r: any) => one(r.proforma_invoices)?.pi_no).filter(Boolean))];
    if (piNos.length) notes.push(`PI ${piNos.join(", ")}`);
    progressById[b.id] = { notes, deliveredPcs, producedPcs };
  }

  // গ্রুপ-লেভেল সতর্কবার্তা (পেজের উপরে + সেভের সময় confirm)
  const warnings: string[] = [];
  const anyNote = (re: RegExp) => Object.values(progressById).some((p) => p.notes.some((n) => re.test(n)));
  if (anyNote(/Blowing|Printing|Cutting|উৎপাদিত|Production/)) warnings.push("Production শুরু হয়ে গেছে — Production-এর অগ্রগতি (stage, উৎপাদিত পরিমাণ) যেমন আছে তেমন থাকবে; Qty/মাপ বদলালে Production Order-এর Qty/Lbs বদলাবে।");
  if (anyNote(/^Challan/)) warnings.push("Challan হয়ে গেছে — Challan যেমন আছে থাকবে। Qty ডেলিভারির চেয়ে কমালে হিসাব গরমিল হবে।");
  if (anyNote(/^FG Receive/)) warnings.push("FG Receive হয়েছে — সেই প্রোডাক্টের Finished Goods (মাপ/পণ্য) বদলাবে না, স্টক আগের পণ্যেই থাকবে।");
  if (anyNote(/^Wastage/)) warnings.push("Wastage এন্ট্রি আছে — সেগুলো বদলাবে না।");
  if (anyNote(/^হাতে-বানানো Invoice/)) warnings.push("হাতে-বানানো Sales Invoice আছে — সেই Invoice-এর Qty/দাম নিজে থেকে বদলাবে না, দরকার হলে Invoice আলাদা করে এডিট করুন।");
  if (anyNote(/^PI /)) warnings.push("PI আছে — PI লাইনের Qty / মাপ / Description / Thickness নতুন করে বসবে ও PI total নতুন করে হিসাব হবে (Price/Unit একই থাকবে)।");
  warnings.push("কাঁচামালের পরিমাণ/Warehouse/তারিখ বদলালে আগের কাঁচামাল কর্তন ফেরত দিয়ে নতুন করে কাটা হবে (WIP-এ শুধু পার্থক্য)। কোনো প্রোডাক্টের কাজ শুরু হয়ে থাকলে সেটা তালিকা থেকে মোছা যাবে না।");
  const hasProgressWarning = warnings.length > 1;

  const customerRow = (customers ?? []).find((c: any) => c.id === first.customer_id) ?? null;
  const items = buildBookingItems(bookings, {
    warehouses: warehouses ?? [], customer: customerRow, priceHistory: (priceHistory ?? []) as any, progressById,
  });

  const editContext: BookingEditContext = {
    groupId,
    ...bookingHeader(first),
    paymentReceived: !!autoInvoice?.payment_received,
    priceOverride: "",
    items: items as BookingEditContext["items"],
    warnings: hasProgressWarning ? warnings : [],
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Booking Group এডিট করুন — {first.booking_no}</h1>
      {hasProgressWarning && (
        <div className="mb-4 rounded-lg border-2 border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold mb-1">⚠ সতর্কতা — এই বুকিং-এর কাজ ইতিমধ্যে এগিয়েছে। এডিট করলে:</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      <BookingForm
        customers={(customers ?? []) as any}
        warehouses={warehouses ?? []}
        materials={materials ?? []}
        buyersMaster={buyersMaster ?? []}
        garmentsMaster={garmentsMaster ?? []}
        merchantsMaster={merchantsMaster ?? []}
        bookingMerchantLinks={(bookingMerchantLinks ?? []) as any}
        priceHistory={(priceHistory ?? []) as any}
        editContext={editContext}
      />
    </div>
  );
}
