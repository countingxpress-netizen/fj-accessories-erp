"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { calcTubeCutting, toInches, hasAdhesiveCharge } from "@/lib/calcTubeCutting";
import { getCurrentUserId } from "@/lib/currentUser";
import { resolveRate } from "@/lib/rateHistory";
import { money } from "@/lib/format";
import { buildLbsLines, type LbsBooking } from "@/lib/lbsInvoice";

type Booking = {
  id: string; booking_no: string; booking_date: string | null; quantity_pcs: number; product_id: string; customer_id: string;
  style: string | null; garments_name: string | null; buyers: { name: string } | null; merchants: { name: string } | null;
  delivery_point: string | null; customer_booking_ref: string | null;
  has_print: boolean; print_colors: number; rate_per_color: number; rate_per_inch: number;
  measurement_type: string; measurement_unit: string;
  length_val: number; width_val: number; flap_val: number | null; gusset_val: number | null; pillow_val: number | null; thickness_mm: number;
  material_type: string;
  finished_goods: { product_name: string; length_cm: number; width_cm: number; thickness: number } | null;
};
type Customer = {
  id: string; name: string; price_per_lbs: number | null;
  lbs_invoicing_enabled?: boolean | null; making_cutting_rate?: number | null;
};
type PriceHistoryRow = { customer_id: string; effective_from: string; rate: number };

function formatMeasurement(b: Booking) {
  const unit = b.measurement_unit;
  const L = b.length_val, W = b.width_val, F = b.flap_val, G = b.gusset_val, P = b.pillow_val;
  if (b.measurement_type === "simple") return `L-${L} x W-${W} ${unit}`;
  if (b.measurement_type === "gusset") return `L-${L} x W-${W} + G-${G} ${unit}`;
  if (b.measurement_type === "adhesive") return `L-${L} + F-${F} x W-${W} ${unit}`;
  if (b.measurement_type === "flap_gusset") return `L-${L} + F-${F} + G-${G} x W-${W} ${unit}`;
  if (b.measurement_type === "pillow") return `L-${L} + P-${P} x W-${W} ${unit}`;
  return "-";
}

function getLineAmount(qty: number, unitPriceRounded: number) {
  // Amount = round(Qty × Unit Price) — half-up, পূর্ণসংখ্যা (আগে floor ছিল)
  return Math.round(qty * unitPriceRounded);
}

// Sales Invoice Edit — এই ফর্মটাই এডিট মোডে খোলে শুধু হাতে-বানানো (manual) invoice-এর
// জন্য (standard বা LBS)। auto invoice (Booking সেভ করলে যেটা হয়) এখানে আসে না —
// সেটা বদলাতে হলে সংশ্লিষ্ট Booking Group এডিট করতে হয়। "Other" invoice আলাদা
// EditOtherInvoiceForm-এ। editInvoice থাকলে Customer locked, invoice-এর booking-গুলো
// প্রি-সিলেক্ট, প্রতি লাইনে Qty এডিটেবল, সেভ করলে পুরনো invoice + JV জায়গায় আপডেট হয়
// (invoice_no একই থাকে)।
export type EditInvoiceCtx = {
  id: string;
  invoiceNo: string;
  invoiceType: "standard" | "lbs";
  customerId: string;
  invoiceDate: string;
  paymentReceived: boolean;
  voucherId: string | null;
  lines: { bookingId: string; qty: number; unitPrice: number }[];
  adjustmentSeed: Record<string, string>;
  lbsPowderRate: string;
  lbsMakingRate: string;
};

export default function SalesInvoiceForm({
  customers, bookings, invoicedMap, priceHistory = [], editInvoice,
}: { customers: Customer[]; bookings: Booking[]; invoicedMap: Record<string, number>; priceHistory?: PriceHistoryRow[]; editInvoice?: EditInvoiceCtx }) {
  const isEdit = !!editInvoice;
  const editLineIds = useMemo(() => new Set((editInvoice?.lines ?? []).map((l) => l.bookingId)), [editInvoice]);

  const [customerId, setCustomerId] = useState(editInvoice?.customerId ?? "");
  const [buyerFilter, setBuyerFilter] = useState("");
  const [merchantFilter, setMerchantFilter] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [garmentsFilter, setGarmentsFilter] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(editInvoice?.invoiceDate ?? new Date().toISOString().slice(0, 10));
  const [paymentReceived, setPaymentReceived] = useState(editInvoice?.paymentReceived ?? false);
  const [selectedBookings, setSelectedBookings] = useState<Record<string, boolean>>(
    () => Object.fromEntries((editInvoice?.lines ?? []).map((l) => [l.bookingId, true])),
  );
  const [priceOverride, setPriceOverride] = useState<Record<string, string>>({});
  const [adjustment, setAdjustment] = useState<Record<string, string>>(editInvoice?.adjustmentSeed ?? {});
  // এডিট মোডে প্রতি লাইনে Qty (ডিফল্ট = আগের Qty, max = বাকি Qty)
  const [qtyOverride, setQtyOverride] = useState<Record<string, string>>(
    () => Object.fromEntries((editInvoice?.lines ?? []).map((l) => [l.bookingId, String(l.qty)])),
  );
  // LBS Invoicing — চার্জ rate override (ফাঁকা = customer/booking থেকে ডিফল্ট)
  const [lbsPowderRate, setLbsPowderRate] = useState(editInvoice?.lbsPowderRate ?? "");
  const [lbsMakingRate, setLbsMakingRate] = useState(editInvoice?.lbsMakingRate ?? "");
  const [lbsPrintRate, setLbsPrintRate] = useState("");
  const [lbsAdhesiveRate, setLbsAdhesiveRate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const isLbsCustomer = !!selectedCustomer?.lbs_invoicing_enabled;
  // এডিট মোডে invoice type-ই ঠিক করে LBS UI দেখাবে কিনা (customer পরে LBS হলেও পুরনো
  // standard invoice standard-ই থাকবে, উল্টোটাও)।
  const showLbs = isEdit ? editInvoice!.invoiceType === "lbs" : isLbsCustomer;

  const historyForCustomer = useMemo(
    () => priceHistory.filter((h) => h.customer_id === customerId),
    [priceHistory, customerId]
  );

  // Booking-এর Booking Date ধরে সেই দিনে কার্যকর Price/Lbs (history না থাকলে
  // customer-এর বর্তমান price_per_lbs fallback)।
  function bookingPricePerLbs(b: Booking) {
    return resolveRate(historyForCustomer, b.booking_date, selectedCustomer?.price_per_lbs ?? 0);
  }

  // এডিট মোডে invoice-এর প্রতিটা লাইনের আগের Qty
  const storedQtyById = useMemo(
    () => Object.fromEntries((editInvoice?.lines ?? []).map((l) => [l.bookingId, l.qty])),
    [editInvoice],
  );

  const customerBookings = useMemo(() => {
    return bookings
      .filter((b) => b.customer_id === customerId)
      .map((b) => {
        const invoiced = invoicedMap[b.id] ?? 0;
        const remaining = b.quantity_pcs - invoiced;
        // এডিট মোডে নিজের লাইন সবসময় সিলেক্ট করা যাবে — max = বাকি Qty, তবে অন্তত আগের Qty
        const maxQty = editLineIds.has(b.id) ? Math.max(remaining, storedQtyById[b.id] ?? 0) : remaining;
        return { ...b, invoiced, remaining, maxQty };
      })
      .filter((b) => b.remaining > 0 || editLineIds.has(b.id))
      .filter((b) => !buyerFilter || b.buyers?.name === buyerFilter)
      .filter((b) => !merchantFilter || b.merchants?.name === merchantFilter)
      .filter((b) => !styleFilter || b.style === styleFilter)
      .filter((b) => !garmentsFilter || b.garments_name === garmentsFilter);
  }, [bookings, customerId, invoicedMap, buyerFilter, merchantFilter, styleFilter, garmentsFilter, editLineIds, storedQtyById]);

  // এডিট মোডে সিলেক্ট করা লাইনের কার্যকর Qty (Qty ইনপুট → নাহলে আগের/বাকি Qty)
  function effectiveQty(b: { id: string; remaining: number }) {
    if (!isEdit) return b.remaining;
    const raw = qtyOverride[b.id];
    if (raw === undefined) return storedQtyById[b.id] ?? b.remaining;
    return parseFloat(raw) || 0;
  }

  const availableBuyers = useMemo(
    () => Array.from(new Set(bookings.filter((b) => b.customer_id === customerId).map((b) => b.buyers?.name).filter(Boolean))) as string[],
    [bookings, customerId]
  );
  const availableMerchants = useMemo(
    () => Array.from(new Set(bookings.filter((b) => b.customer_id === customerId).map((b) => b.merchants?.name).filter(Boolean))) as string[],
    [bookings, customerId]
  );
  const availableStyles = useMemo(
    () => Array.from(new Set(bookings.filter((b) => b.customer_id === customerId).map((b) => b.style).filter(Boolean))) as string[],
    [bookings, customerId]
  );
  const availableGarments = useMemo(
    () => Array.from(new Set(bookings.filter((b) => b.customer_id === customerId).map((b) => b.garments_name).filter(Boolean))) as string[],
    [bookings, customerId]
  );

  function getSurcharge(b: Booking, cuttingInch: number) {
    let printCharge = 0, adhesiveCharge = 0;
    // বড় ব্যাগে (Cutting > 29") Print rate দ্বিগুণ — PI-র calcPiUnitPriceWithMarkup-এর সাথে মিল
    if (b.has_print) printCharge = (b.print_colors || 0) * (b.rate_per_color || 0.20) * (cuttingInch > 29 ? 2 : 1);
    // Adhesive/Flap Gusset-এ width_val-ই cutting, তাই একই cuttingInch (CM to Inch টেবিল-সহ) ব্যবহার হবে
    if (hasAdhesiveCharge(b.measurement_type)) adhesiveCharge = cuttingInch * (b.rate_per_inch || 0.02);
    return { printCharge, adhesiveCharge };
  }

  function getUnitPrice(b: Booking) {
    const overridden = priceOverride[b.id];
    const pricePerLbs = overridden ? parseFloat(overridden) : bookingPricePerLbs(b);
    if (!pricePerLbs || !b.thickness_mm) return 0;

    const { tube, cutting } = calcTubeCutting(b);
    const { tubeInch, cuttingInch } = toInches(tube, cutting, b.measurement_unit, b.material_type, b.has_print);

    const baseUnitPrice = (pricePerLbs * tubeInch * cuttingInch * b.thickness_mm) / 75000;
    const { printCharge, adhesiveCharge } = getSurcharge(b, cuttingInch);
    const adj = parseFloat(adjustment[b.id] || "0") || 0; // প্রতি পিসে ± (ঋণাত্মকও হতে পারে)
    return baseUnitPrice + printCharge + adhesiveCharge + adj;
  }

  const lineItems = customerBookings
    .filter((b) => selectedBookings[b.id])
    .map((b) => {
      const qty = effectiveQty(b); // New: Full Quantity; Edit: প্রতি লাইনের Qty ইনপুট
      const unitPriceRaw = getUnitPrice(b);
      const unitPrice = Math.round(unitPriceRaw * 100) / 100;
      return { booking: b, qty, unitPrice, amount: getLineAmount(qty, unitPrice) };
    });

  const totalAmount = lineItems.reduce((s, li) => s + li.amount, 0);

  // ── LBS Invoicing হিসাব ──────────────────────────────────────────────────
  const lbsSelectedBookings = useMemo(
    () =>
      customerBookings
        .filter((b) => selectedBookings[b.id])
        .map((b) => ({ ...b, quantity_pcs: effectiveQty(b) })), // New: বাকি; Edit: Qty ইনপুট
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customerBookings, selectedBookings, qtyOverride]
  );

  const lbsResult = useMemo(() => {
    if (!showLbs || lbsSelectedBookings.length === 0) return null;
    return buildLbsLines(lbsSelectedBookings as unknown as LbsBooking[], {
      materialRatePerLbs: parseFloat(lbsPowderRate) || Number(selectedCustomer?.price_per_lbs ?? 0),
      makingCuttingRate: parseFloat(lbsMakingRate) || Number(selectedCustomer?.making_cutting_rate ?? 0),
      printRate: lbsPrintRate.trim() === "" ? undefined : parseFloat(lbsPrintRate) || 0,
      adhesiveRate: lbsAdhesiveRate.trim() === "" ? undefined : parseFloat(lbsAdhesiveRate) || 0,
      bigBagDoublePrint: true,
    });
  }, [showLbs, lbsSelectedBookings, lbsPowderRate, lbsMakingRate, lbsPrintRate, lbsAdhesiveRate, selectedCustomer]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (isEdit) {
      await handleEditSubmit();
      return;
    }

    if (isLbsCustomer) {
      await handleLbsSubmit();
      return;
    }
    if (!customerId || lineItems.length === 0) {
      setError("Customer বাছুন এবং অন্তত একটা বুকিং সিলেক্ট করুন।");
      return;
    }
    if (lineItems.some((li) => li.unitPrice <= 0)) {
      setError("কোনো একটা বুকিং-এর Unit Price ০ বা তার কম — Price/Lbs বা Adjustment দেখুন।");
      return;
    }

    setLoading(true);

    const firstBooking = lineItems[0].booking;
    const styles = Array.from(new Set(lineItems.map((li) => li.booking.style).filter(Boolean))).join(", ");
    const bookingRefs = Array.from(new Set(lineItems.map((li) => li.booking.customer_booking_ref).filter(Boolean))).join(", ");

    const invoiceNo = await generateNextDocNo(supabase, "sales_invoices", "invoice_no", "INV", "invoice_date", invoiceDate);
    const createdBy = await getCurrentUserId(supabase);

    const { data: invoice, error: invoiceError } = await supabase
      .from("sales_invoices")
      .insert({
        invoice_no: invoiceNo, customer_id: customerId, invoice_date: invoiceDate,
        buyer_name: firstBooking.buyers?.name ?? null,
        merchant_name: firstBooking.merchants?.name ?? null,
        style: styles || null,
        delivery_point: firstBooking.delivery_point ?? null,
        customer_booking_ref: bookingRefs || null,
        payment_received: paymentReceived,
        created_by: createdBy,
      })
      .select().single();

    if (invoiceError || !invoice) {
      setLoading(false);
      setError(invoiceError?.message ?? "Invoice তৈরি ব্যর্থ হয়েছে।");
      return;
    }

    const { error: itemsError } = await supabase.from("sales_invoice_items").insert(
      lineItems.map((li) => ({
        invoice_id: invoice.id, product_id: li.booking.product_id, booking_id: li.booking.id,
        quantity_pcs: li.qty, unit_price: li.unitPrice,
      }))
    );

    if (itemsError) {
      setLoading(false);
      setError(itemsError.message);
      return;
    }

    const debitAccountCode = paymentReceived ? "1000" : "1100";
    const { data: debitAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", debitAccountCode).single();
    const { data: salesAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", "4000").single();

    if (debitAccount && salesAccount) {
      const voucherNo = await generateNextDocNo(supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", invoiceDate);
      const { data: voucher } = await supabase
        .from("journal_vouchers")
        .insert({
          voucher_no: voucherNo, voucher_date: invoiceDate,
          narration: `Sales Invoice ${invoiceNo} — ${selectedCustomer?.name} (${paymentReceived ? "Cash" : "Credit"})`,
          created_by: createdBy,
        })
        .select().single();

      if (voucher) {
        await supabase.from("journal_entry_lines").insert([
          { voucher_id: voucher.id, account_id: debitAccount.id, debit: totalAmount, credit: 0, memo: `Invoice ${invoiceNo}` },
          { voucher_id: voucher.id, account_id: salesAccount.id, debit: 0, credit: totalAmount, memo: `Invoice ${invoiceNo}` },
        ]);
        await supabase.from("sales_invoices").update({ voucher_id: voucher.id }).eq("id", invoice.id);
      }
    }

    setLoading(false);
    router.push("/dashboard/sales/invoices");
    router.refresh();
  }

  // ── Manual invoice edit — পুরনো invoice + JV জায়গায় আপডেট (invoice_no একই) ──────
  async function handleEditSubmit() {
    if (!editInvoice) return;
    const isLbs = editInvoice.invoiceType === "lbs";

    if (isLbs) {
      if (!lbsResult || lbsResult.total <= 0) {
        setError("Total ০ — Powder/Making rate বা বুকিং সিলেকশন দেখুন।");
        return;
      }
    } else {
      if (lineItems.length === 0) { setError("অন্তত একটা বুকিং সিলেক্ট করুন।"); return; }
      for (const li of lineItems) {
        const b = li.booking as any;
        if (li.qty <= 0) { setError(`${b.booking_no}-এ Qty দিন।`); return; }
        if (li.qty > b.maxQty) { setError(`${b.booking_no}-এ সর্বোচ্চ ${b.maxQty} পিস পর্যন্ত দেওয়া যাবে।`); return; }
      }
      if (lineItems.some((li) => li.unitPrice <= 0)) {
        setError("কোনো একটা বুকিং-এর Unit Price ০ বা তার কম — Price/Lbs বা Adjustment দেখুন।");
        return;
      }
    }

    setLoading(true);
    const createdBy = await getCurrentUserId(supabase);

    const src: any[] = isLbs ? lbsSelectedBookings : lineItems.map((li) => li.booking);
    const first: any = src[0];
    const styles = Array.from(new Set(src.map((b) => b.style).filter(Boolean))).join(", ");
    const bookingRefs = Array.from(new Set(src.map((b) => b.customer_booking_ref).filter(Boolean))).join(", ");

    await supabase.from("sales_invoices").update({
      invoice_date: invoiceDate,
      payment_received: paymentReceived,
      payment_type: paymentReceived ? "cash" : "credit",
      buyer_name: first?.buyers?.name ?? null,
      merchant_name: first?.merchants?.name ?? null,
      style: styles || null,
      delivery_point: first?.delivery_point ?? null,
      customer_booking_ref: bookingRefs || null,
    }).eq("id", editInvoice.id);

    await supabase.from("sales_invoice_items").delete().eq("invoice_id", editInvoice.id);
    const items: Record<string, unknown>[] = isLbs
      ? [
          ...lbsResult!.productLines.map((l) => ({
            invoice_id: editInvoice.id, product_id: l.product_id, booking_id: l.booking_id,
            quantity_pcs: l.quantity_pcs, unit_price: 0,
            line_type: l.line_type, line_label: l.label, required_lbs: l.required_lbs,
          })),
          ...lbsResult!.chargeLines.map((l) => ({
            invoice_id: editInvoice.id, product_id: null, booking_id: null,
            quantity_pcs: l.quantity_pcs, unit_price: l.unit_price,
            line_type: l.line_type, line_label: l.label, required_lbs: null,
          })),
        ]
      : lineItems.map((li) => ({
          invoice_id: editInvoice.id, product_id: li.booking.product_id, booking_id: li.booking.id,
          quantity_pcs: li.qty, unit_price: li.unitPrice,
        }));
    const { error: itemsError } = await supabase.from("sales_invoice_items").insert(items);
    if (itemsError) { setLoading(false); setError(itemsError.message); return; }

    // পুরনো JV মুছে নতুন — invoice row টিকে থাকছে, তাই আগে voucher_id null করতে হবে
    const total = isLbs ? lbsResult!.total : totalAmount;
    if (editInvoice.voucherId) {
      await supabase.from("sales_invoices").update({ voucher_id: null }).eq("id", editInvoice.id);
      await supabase.from("journal_entry_lines").delete().eq("voucher_id", editInvoice.voucherId);
      await supabase.from("journal_vouchers").delete().eq("id", editInvoice.voucherId);
    }

    const debitCode = paymentReceived ? "1000" : "1100";
    const { data: debitAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", debitCode).single();
    const { data: salesAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", "4000").single();
    if (debitAccount && salesAccount) {
      const voucherNo = await generateNextDocNo(supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", invoiceDate);
      const { data: voucher } = await supabase
        .from("journal_vouchers")
        .insert({
          voucher_no: voucherNo, voucher_date: invoiceDate,
          narration: `Sales Invoice ${editInvoice.invoiceNo} — ${selectedCustomer?.name ?? ""} (${paymentReceived ? "Cash" : "Credit"}, edited)`,
          created_by: createdBy,
        })
        .select().single();
      if (voucher) {
        await supabase.from("journal_entry_lines").insert([
          { voucher_id: voucher.id, account_id: debitAccount.id, debit: total, credit: 0, memo: `Invoice ${editInvoice.invoiceNo}` },
          { voucher_id: voucher.id, account_id: salesAccount.id, debit: 0, credit: total, memo: `Invoice ${editInvoice.invoiceNo}` },
        ]);
        await supabase.from("sales_invoices").update({ voucher_id: voucher.id }).eq("id", editInvoice.id);
      }
    }

    setLoading(false);
    router.push("/dashboard/sales/invoices");
    router.refresh();
  }

  // LBS Invoice — প্রোডাক্ট রো + Powder/Making/Printing/Non-Print/Adhesive চার্জ রো।
  async function handleLbsSubmit() {
    if (!customerId || lbsSelectedBookings.length === 0) {
      setError("Customer বাছুন এবং অন্তত একটা বুকিং সিলেক্ট করুন।");
      return;
    }
    if (!lbsResult || lbsResult.total <= 0) {
      setError("Total ০ — Powder/Making rate বা বুকিং সিলেকশন দেখুন।");
      return;
    }
    setLoading(true);

    const first = lbsSelectedBookings[0];
    const styles = Array.from(new Set(lbsSelectedBookings.map((b) => b.style).filter(Boolean))).join(", ");
    const bookingRefs = Array.from(new Set(lbsSelectedBookings.map((b) => b.customer_booking_ref).filter(Boolean))).join(", ");

    const invoiceNo = await generateNextDocNo(supabase, "sales_invoices", "invoice_no", "INV", "invoice_date", invoiceDate);
    const createdBy = await getCurrentUserId(supabase);

    const { data: invoice, error: invoiceError } = await supabase
      .from("sales_invoices")
      .insert({
        invoice_no: invoiceNo, customer_id: customerId, invoice_date: invoiceDate,
        invoice_type: "lbs",
        buyer_name: first.buyers?.name ?? null,
        merchant_name: first.merchants?.name ?? null,
        style: styles || null,
        delivery_point: first.delivery_point ?? null,
        customer_booking_ref: bookingRefs || null,
        payment_received: paymentReceived,
        payment_type: paymentReceived ? "cash" : "credit",
        created_by: createdBy,
      })
      .select().single();

    if (invoiceError || !invoice) {
      setLoading(false);
      setError(invoiceError?.message ?? "Invoice তৈরি ব্যর্থ হয়েছে।");
      return;
    }

    const items = [
      ...lbsResult.productLines.map((l) => ({
        invoice_id: invoice.id, product_id: l.product_id, booking_id: l.booking_id,
        quantity_pcs: l.quantity_pcs, unit_price: 0,
        line_type: l.line_type, line_label: l.label, required_lbs: l.required_lbs,
      })),
      ...lbsResult.chargeLines.map((l) => ({
        invoice_id: invoice.id, product_id: null, booking_id: null,
        quantity_pcs: l.quantity_pcs, unit_price: l.unit_price,
        line_type: l.line_type, line_label: l.label, required_lbs: null,
      })),
    ];
    const { error: itemsError } = await supabase.from("sales_invoice_items").insert(items);
    if (itemsError) { setLoading(false); setError(itemsError.message); return; }

    const debitAccountCode = paymentReceived ? "1000" : "1100";
    const { data: debitAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", debitAccountCode).single();
    const { data: salesAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", "4000").single();

    if (debitAccount && salesAccount) {
      const voucherNo = await generateNextDocNo(supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", invoiceDate);
      const { data: voucher } = await supabase
        .from("journal_vouchers")
        .insert({
          voucher_no: voucherNo, voucher_date: invoiceDate,
          narration: `Sales Invoice ${invoiceNo} — ${selectedCustomer?.name} (LBS, ${paymentReceived ? "Cash" : "Credit"})`,
          created_by: createdBy,
        })
        .select().single();
      if (voucher) {
        await supabase.from("journal_entry_lines").insert([
          { voucher_id: voucher.id, account_id: debitAccount.id, debit: lbsResult.total, credit: 0, memo: `Invoice ${invoiceNo}` },
          { voucher_id: voucher.id, account_id: salesAccount.id, debit: 0, credit: lbsResult.total, memo: `Invoice ${invoiceNo}` },
        ]);
        await supabase.from("sales_invoices").update({ voucher_id: voucher.id }).eq("id", invoice.id);
      }
    }

    setLoading(false);
    router.push("/dashboard/sales/invoices");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
      {isEdit && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-800">
          <p className="font-semibold">Sales Invoice এডিট — {editInvoice!.invoiceNo}</p>
          <p className="text-xs mt-1">
            হাতে-বানানো invoice। সেভ করলে এই invoice ও তার Journal Voucher জায়গায় আপডেট হবে
            (invoice নম্বর একই থাকবে)। প্রতি লাইনে Qty বদলানো যাবে।
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 max-w-xs">
          <label className="block text-sm text-gray-600 mb-1">Customer</label>
          <select value={customerId} disabled={isEdit} onChange={(e) => { setCustomerId(e.target.value); setSelectedBookings({}); setPriceOverride({}); setAdjustment({}); setBuyerFilter(""); setMerchantFilter(""); setStyleFilter(""); setGarmentsFilter(""); setLbsPowderRate(""); setLbsMakingRate(""); setLbsPrintRate(""); setLbsAdhesiveRate(""); }} className="w-full rounded-lg border px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-600" required>
            <option value="">-- বাছুন --</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {customerId && (
          <>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Buyer Filter</label>
              <select value={buyerFilter} onChange={(e) => setBuyerFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                <option value="">সব</option>
                {availableBuyers.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Merchant Filter</label>
              <select value={merchantFilter} onChange={(e) => setMerchantFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                <option value="">সব</option>
                {availableMerchants.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Style Filter</label>
              <select value={styleFilter} onChange={(e) => setStyleFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                <option value="">সব</option>
                {availableStyles.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Garments Filter</label>
              <select value={garmentsFilter} onChange={(e) => setGarmentsFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                <option value="">সব</option>
                {availableGarments.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </>
        )}
        <div>
          <label className="block text-sm text-gray-600 mb-1">Invoice Date</label>
          <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm bg-gray-50 border rounded-lg px-3 py-2 w-fit">
        <input type="checkbox" checked={paymentReceived} onChange={(e) => setPaymentReceived(e.target.checked)} />
        Payment Received (টিক থাকলে Cash Sale, না থাকলে বাকিতে বিক্রি)
      </label>

      {customerId && showLbs && (
        <div className="space-y-3">
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            এই Customer <b>LBS Invoicing</b>-এ — Invoice হয় Powder / Making Cutting / Printing / Non-Print / Adhesive চার্জে।
            বুকিং সিলেক্ট করলে চার্জ রো নিচে হিসাব হবে।
          </p>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-3 py-2 w-10"></th>
                  <th className="px-3 py-2">Booking</th>
                  <th className="px-3 py-2">Style</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Measurement</th>
                  <th className="px-3 py-2 text-right">Order Thickness</th>
                  <th className="px-3 py-2 text-right">Qty (বাকি)</th>
                </tr>
              </thead>
              <tbody>
                {customerBookings.map((b) => {
                  const checked = !!selectedBookings[b.id];
                  return (
                    <tr key={b.id} className="border-t">
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={checked} onChange={(e) => setSelectedBookings((prev) => ({ ...prev, [b.id]: e.target.checked }))} />
                      </td>
                      <td className="px-3 py-2 font-medium">{b.booking_no}</td>
                      <td className="px-3 py-2 text-gray-500">{b.style || "-"}</td>
                      <td className="px-3 py-2">{b.finished_goods?.product_name}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{formatMeasurement(b)}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{b.thickness_mm} mm</td>
                      <td className="px-3 py-2 text-right">
                        {isEdit && checked ? (
                          <input
                            type="number" step="1" min="0" max={b.maxQty}
                            value={qtyOverride[b.id] ?? String(storedQtyById[b.id] ?? b.remaining)}
                            onChange={(e) => setQtyOverride((prev) => ({ ...prev, [b.id]: e.target.value }))}
                            className="w-24 rounded border px-2 py-1 text-sm text-right"
                          />
                        ) : b.remaining}
                      </td>
                    </tr>
                  );
                })}
                {customerBookings.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-3 text-gray-400 italic">এই ফিল্টারে বাকি বুকিং নেই</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {lbsResult && (
            <>
              <div className="flex flex-wrap gap-3">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Powder Rate /Lb</label>
                  <input type="number" step="0.01" value={lbsPowderRate} placeholder={String(selectedCustomer?.price_per_lbs ?? 0)} onChange={(e) => setLbsPowderRate(e.target.value)} className="w-28 rounded border px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Making-Cutting Rate /Lb</label>
                  <input type="number" step="0.01" value={lbsMakingRate} placeholder={String(selectedCustomer?.making_cutting_rate ?? 0)} onChange={(e) => setLbsMakingRate(e.target.value)} className="w-28 rounded border px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Print Rate /Pc</label>
                  <input type="number" step="0.01" value={lbsPrintRate} placeholder="booking থেকে" onChange={(e) => setLbsPrintRate(e.target.value)} className="w-28 rounded border px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Adhesive Rate /Inch</label>
                  <input type="number" step="0.01" value={lbsAdhesiveRate} placeholder="booking থেকে" onChange={(e) => setLbsAdhesiveRate(e.target.value)} className="w-28 rounded border px-2 py-1 text-sm" />
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-3 py-2">Item / চার্জ</th>
                      <th className="px-3 py-2">Measurement</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Rate</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lbsResult.productLines.map((l) => (
                      <tr key={l.booking_id} className="border-t">
                        <td className="px-3 py-2">{l.label}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{l.measurement}</td>
                        <td className="px-3 py-2 text-right">{l.quantity_pcs.toLocaleString("en-IN")} Pcs</td>
                        <td className="px-3 py-2 text-right text-gray-500">{l.required_lbs.toLocaleString("en-IN")} Lbs</td>
                        <td className="px-3 py-2 text-right text-gray-400">—</td>
                      </tr>
                    ))}
                    {lbsResult.chargeLines.map((l) => (
                      <tr key={l.line_type} className="border-t">
                        <td className="px-3 py-2 font-medium">{l.label}</td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right">{l.quantity_pcs ? l.quantity_pcs.toLocaleString("en-IN") : ""}</td>
                        <td className="px-3 py-2 text-right">{money(l.unit_price)}</td>
                        <td className="px-3 py-2 text-right">{l.amount ? money(l.amount) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t font-semibold">
                    <tr><td colSpan={4} className="px-3 py-2 text-right">Total</td><td className="px-3 py-2 text-right">{money(lbsResult.total)}</td></tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {customerId && !showLbs && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2 w-10"></th>
                <th className="px-3 py-2">Booking</th>
                <th className="px-3 py-2">Style</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Measurement</th>
                <th className="px-3 py-2 text-right">Order Thickness</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 w-32">Price/Lbs</th>
                <th className="px-3 py-2 w-28">Adjustment</th>
                <th className="px-3 py-2 text-right">Unit Price</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {customerBookings.map((b) => {
                const unitPriceRaw = getUnitPrice(b);
                const unitPrice = Math.round(unitPriceRaw * 100) / 100;
                const checked = !!selectedBookings[b.id];
                return (
                  <tr key={b.id} className="border-t">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={checked} onChange={(e) => setSelectedBookings((prev) => ({ ...prev, [b.id]: e.target.checked }))} />
                    </td>
                    <td className="px-3 py-2 font-medium">{b.booking_no}</td>
                    <td className="px-3 py-2 text-gray-500">{b.style || "-"}</td>
                    <td className="px-3 py-2">{b.finished_goods?.product_name}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{formatMeasurement(b)}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{b.thickness_mm} mm</td>
                    <td className="px-3 py-2 text-right">
                      {!checked ? "-" : isEdit ? (
                        <span className="inline-flex flex-col items-end">
                          <input
                            type="number" step="1" min="0" max={b.maxQty}
                            value={qtyOverride[b.id] ?? String(storedQtyById[b.id] ?? b.remaining)}
                            onChange={(e) => setQtyOverride((prev) => ({ ...prev, [b.id]: e.target.value }))}
                            className="w-24 rounded border px-2 py-1 text-sm text-right"
                          />
                          <span className="text-[11px] text-gray-400">max {b.maxQty}</span>
                        </span>
                      ) : b.remaining}
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" step="0.01" placeholder={String(bookingPricePerLbs(b) || "")} value={priceOverride[b.id] || ""} onChange={(e) => setPriceOverride((prev) => ({ ...prev, [b.id]: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" />
                      <span className="block text-[11px] text-gray-400">
                        Booking {b.booking_date ?? "?"} → {bookingPricePerLbs(b) || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" step="0.01" placeholder="0" value={adjustment[b.id] || ""} onChange={(e) => setAdjustment((prev) => ({ ...prev, [b.id]: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" />
                      <span className="block text-[11px] text-gray-400">প্রতি পিসে ± (ঋণাত্মকও)</span>
                    </td>
                    <td className="px-3 py-2 text-right">{money((Math.round(unitPrice * 100) / 100))}</td>
                    <td className="px-3 py-2 text-right">{checked ? money(getLineAmount(effectiveQty(b), unitPrice)) : "-"}</td>
                  </tr>
                );
              })}
              {customerBookings.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-3 text-gray-400 italic">এই ফিল্টারে কোনো বুকিং নেই</td></tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 border-t font-semibold">
              <tr><td colSpan={10} className="px-3 py-2 text-right">Total</td><td className="px-3 py-2 text-right">{money(totalAmount)}</td></tr>
            </tfoot>
          </table>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading || (showLbs ? !lbsResult || lbsResult.total <= 0 : lineItems.length === 0)}
        className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40"
      >
        {loading
          ? "সেভ হচ্ছে..."
          : isEdit
            ? "পরিবর্তন সেভ করুন (Journal Voucher নতুন হবে)"
            : showLbs ? "LBS Invoice তৈরি করুন" : "Sales Invoice তৈরি করুন"}
      </button>
    </form>
  );
}