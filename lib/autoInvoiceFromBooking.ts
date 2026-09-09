import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { getCurrentUserId } from "@/lib/currentUser";
import { buildLbsLines, type LbsBooking } from "@/lib/lbsInvoice";

type SupabaseClient = ReturnType<typeof createClient>;

// এক booking_group সেভ করলে অটো একটা Sales Invoice তৈরি হয় — group-এর প্রতিটা
// booking = invoice-এর একটা লাইন, unit_price = booking-এর quoted_unit_price।
// Booking edit/delete-এ আবার এই sync ডাকা হয় যাতে invoice + JV আপডেট থাকে।
//
// customers.lbs_invoicing_enabled = true হলে standard লাইনের বদলে LBS Invoice
// (প্রোডাক্ট রো + Powder/Making/Printing/Non-Print/Adhesive চার্জ রো — lib/lbsInvoice.ts)।
//
// JV:  Dr 1000 Cash / 1100 AR      Cr 4000 Sales Revenue-Local
//      (Cash না Credit — paymentReceived অনুযায়ী)

export type AutoInvoiceOpts = {
  invoiceDate?: string;        // ডিফল্ট: group-এর booking_date
  paymentReceived?: boolean;   // ডিফল্ট: বিদ্যমান invoice-এর মান, নাহলে false (Credit)
  createdBy?: string | null;
  createIfMissing?: boolean;   // true হলেই নতুন invoice তৈরি হবে (শুধু Booking সেভের সময়)।
                               // edit/delete re-sync-এ false — পুরনো booking-এ হঠাৎ invoice বানাবে না।
};

export type AutoInvoiceResult =
  | { ok: true; invoiceId: string | null; invoiceNo?: string }
  | { ok: false; error: string };

async function clearInvoiceJv(supabase: SupabaseClient, invoiceId: string, voucherId: string | null) {
  if (!voucherId) return;
  // plain FK — voucher delete-এর আগে reference null করতে হয়
  await supabase.from("sales_invoices").update({ voucher_id: null }).eq("id", invoiceId);
  await supabase.from("journal_entry_lines").delete().eq("voucher_id", voucherId);
  await supabase.from("journal_vouchers").delete().eq("id", voucherId);
}

async function postInvoiceJv(
  supabase: SupabaseClient,
  args: {
    invoiceNo: string; invoiceDate: string; customerName: string;
    paymentReceived: boolean; totalAmount: number; createdBy: string | null;
  },
): Promise<string | null> {
  const debitCode = args.paymentReceived ? "1000" : "1100";
  const { data: debitAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", debitCode).single();
  const { data: salesAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", "4000").single();
  if (!debitAccount || !salesAccount) return null;

  const voucherNo = await generateNextDocNo(supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", args.invoiceDate);
  const { data: voucher } = await supabase
    .from("journal_vouchers")
    .insert({
      voucher_no: voucherNo, voucher_date: args.invoiceDate,
      narration: `Sales Invoice ${args.invoiceNo} — ${args.customerName} (Booking থেকে অটো, ${args.paymentReceived ? "Cash" : "Credit"})`,
      created_by: args.createdBy, source: "sales_invoice",
    })
    .select().single();
  if (!voucher) return null;

  await supabase.from("journal_entry_lines").insert([
    { voucher_id: voucher.id, account_id: debitAccount.id, debit: args.totalAmount, credit: 0, memo: `Invoice ${args.invoiceNo}` },
    { voucher_id: voucher.id, account_id: salesAccount.id, debit: 0, credit: args.totalAmount, memo: `Invoice ${args.invoiceNo}` },
  ]);
  return voucher.id as string;
}

async function findAutoInvoice(supabase: SupabaseClient, groupId: string) {
  const { data } = await supabase
    .from("sales_invoices")
    .select("id, invoice_no, voucher_id, payment_received, invoice_date")
    .eq("source_booking_group_id", groupId)
    .eq("auto_generated", true)
    .order("created_at", { ascending: true })
    .limit(1);
  return (data ?? [])[0] ?? null;
}

async function destroyInvoice(supabase: SupabaseClient, inv: { id: string; voucher_id: string | null }) {
  await clearInvoiceJv(supabase, inv.id, inv.voucher_id);
  await supabase.from("sales_invoice_items").delete().eq("invoice_id", inv.id);
  await supabase.from("sales_invoices").delete().eq("id", inv.id);
}

/** Booking group-এর auto Sales Invoice + JV পুরোপুরি মুছে ফেলে (booking group delete হলে)। */
export async function deleteAutoInvoiceForGroup(supabase: SupabaseClient, groupId: string): Promise<void> {
  const inv = await findAutoInvoice(supabase, groupId);
  if (inv) await destroyInvoice(supabase, inv);
}

// এক group-এর সব booking থেকে যে row-গুলো insert হবে (standard বা LBS)।
type ItemInsert = {
  invoice_id: string;
  product_id?: string | null;
  booking_id?: string | null;
  quantity_pcs: number;
  unit_price: number;
  line_type?: string;
  line_label?: string | null;
  required_lbs?: number | null;
};

/**
 * Booking group-এর auto Sales Invoice-কে বর্তমান (non-cancelled) booking-গুলোর সাথে
 * মিলিয়ে তৈরি / আপডেট করে। কোনো valid booking না থাকলে invoice মুছে ফেলে।
 */
export async function syncAutoInvoiceForGroup(
  supabase: SupabaseClient,
  groupId: string,
  opts: AutoInvoiceOpts = {},
): Promise<AutoInvoiceResult> {
  const { data: groupBookings } = await supabase
    .from("bookings")
    .select(`id, product_id, quantity_pcs, quoted_unit_price, booking_date, customer_id, style,
      delivery_point, customer_booking_ref, buyers(name), merchants(name),
      thickness_mm, material_type, measurement_type, measurement_unit,
      length_val, width_val, flap_val, gusset_val, pillow_val, plain_cm_conversion,
      has_print, print_colors, rate_per_color, rate_per_inch`)
    .eq("booking_group_id", groupId)
    .neq("status", "cancelled");

  const existing = await findAutoInvoice(supabase, groupId);

  const firstAny: any = (groupBookings ?? [])[0];
  const { data: customer } = firstAny
    ? await supabase
        .from("customers")
        .select("*")
        .eq("id", firstAny.customer_id)
        .maybeSingle()
    : { data: null };
  const isLbs = !!(customer as any)?.lbs_invoicing_enabled;

  // LBS-এ: এই group-এর কোনো booking যদি অন্য কোনো invoice-এ (হাতে বানানো period bill,
  // বা অন্য group-এর auto invoice) ইতিমধ্যে থাকে — সেটা এই auto invoice-এ দুবার নেব না।
  let billedElsewhere = new Set<string>();
  if (isLbs && (groupBookings ?? []).length > 0) {
    const { data: otherItems } = await supabase
      .from("sales_invoice_items")
      .select("booking_id, invoice_id")
      .in("booking_id", (groupBookings ?? []).map((b: any) => b.id));
    billedElsewhere = new Set(
      (otherItems ?? [])
        .filter((it: any) => it.booking_id && it.invoice_id !== existing?.id)
        .map((it: any) => it.booking_id as string),
    );
  }

  const rows = (groupBookings ?? []).filter(
    (b: any) =>
      (b.quantity_pcs || 0) > 0 &&
      (isLbs ? !billedElsewhere.has(b.id) : (b.quoted_unit_price || 0) > 0),
  );

  // valid কোনো লাইন নেই → invoice থাকলে মুছে ফেলো
  if (rows.length === 0) {
    if (existing) await destroyInvoice(supabase, existing);
    return { ok: true, invoiceId: null };
  }

  // invoice নেই আর তৈরি করার অনুমতিও নেই (edit/delete re-sync) → কিছু করার নেই
  if (!existing && !opts.createIfMissing) {
    return { ok: true, invoiceId: null };
  }

  const first: any = rows[0];
  const invoiceDate = opts.invoiceDate || first.booking_date || new Date().toISOString().slice(0, 10);
  const paymentReceived = opts.paymentReceived ?? existing?.payment_received ?? false;
  const createdBy = opts.createdBy ?? (await getCurrentUserId(supabase));

  const styles = Array.from(new Set(rows.map((r: any) => r.style).filter(Boolean))).join(", ");
  const bookingRefs = Array.from(new Set(rows.map((r: any) => r.customer_booking_ref).filter(Boolean))).join(", ");

  const header = {
    customer_id: first.customer_id,
    invoice_date: invoiceDate,
    // invoice_type শুধু LBS হলে সেট করি — standard-এ DB default 'standard' (মাইগ্রেশন-পূর্ব
    // ডিপ্লয়েও standard auto-invoice ভাঙবে না)।
    ...(isLbs ? { invoice_type: "lbs" } : {}),
    buyer_name: first.buyers?.name ?? null,
    merchant_name: first.merchants?.name ?? null,
    style: styles || null,
    delivery_point: first.delivery_point ?? null,
    customer_booking_ref: bookingRefs || null,
    payment_received: paymentReceived,
    payment_type: paymentReceived ? "cash" : "credit",
  };

  // ── লাইন ও Total বানানো ──────────────────────────────────────────────────
  let makeItems: (invoiceId: string) => ItemInsert[];
  let totalAmount: number;

  if (isLbs) {
    // LBS-এ Powder/Material rate = customers.price_per_lbs (সরাসরি, তারিখ-ভিত্তিক নয়)।
    // Making-Cutting rate-এর মতোই LBS ব্লকে হাতে বসানো একটা সাধারণ মান।
    const materialRatePerLbs = Number(customer?.price_per_lbs ?? 0);

    const { productLines, chargeLines, total } = buildLbsLines(
      rows as unknown as LbsBooking[],
      {
        materialRatePerLbs,
        makingCuttingRate: Number(customer?.making_cutting_rate ?? 0),
        bigBagDoublePrint: true,
      },
    );
    totalAmount = total;
    makeItems = (invoiceId) => [
      ...productLines.map((l) => ({
        invoice_id: invoiceId, product_id: l.product_id, booking_id: l.booking_id,
        quantity_pcs: l.quantity_pcs, unit_price: 0,
        line_type: l.line_type, line_label: l.label, required_lbs: l.required_lbs,
      })),
      ...chargeLines.map((l) => ({
        invoice_id: invoiceId, product_id: null, booking_id: null,
        quantity_pcs: l.quantity_pcs, unit_price: l.unit_price,
        line_type: l.line_type, line_label: l.label, required_lbs: null,
      })),
    ];
  } else {
    totalAmount = rows.reduce(
      (s: number, r: any) => s + Math.round((r.quantity_pcs || 0) * (r.quoted_unit_price || 0)),
      0,
    );
    makeItems = (invoiceId) =>
      rows.map((r: any) => ({
        invoice_id: invoiceId, product_id: r.product_id, booking_id: r.id,
        quantity_pcs: r.quantity_pcs, unit_price: r.quoted_unit_price,
      }));
  }

  // ── invoice তৈরি / আপডেট ────────────────────────────────────────────────
  let invoiceId: string;
  let invoiceNo: string;
  let repostJv = true;

  if (existing) {
    invoiceId = existing.id;
    invoiceNo = existing.invoice_no;

    const { data: oldItems } = await supabase.from("sales_invoice_items").select("amount").eq("invoice_id", invoiceId);
    const oldTotal = (oldItems ?? []).reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
    repostJv = !existing.voucher_id
      || oldTotal !== totalAmount
      || Boolean(existing.payment_received) !== paymentReceived
      || (existing.invoice_date ?? null) !== invoiceDate; // তারিখ বদলালে JV-ও নতুন তারিখে

    await supabase.from("sales_invoices").update(header).eq("id", invoiceId);
    if (repostJv) await clearInvoiceJv(supabase, invoiceId, existing.voucher_id);
    await supabase.from("sales_invoice_items").delete().eq("invoice_id", invoiceId);
  } else {
    invoiceNo = await generateNextDocNo(supabase, "sales_invoices", "invoice_no", "INV", "invoice_date", invoiceDate);
    const { data: inv, error } = await supabase
      .from("sales_invoices")
      .insert({ invoice_no: invoiceNo, ...header, source_booking_group_id: groupId, auto_generated: true, created_by: createdBy })
      .select().single();
    if (error || !inv) return { ok: false, error: error?.message ?? "Sales Invoice তৈরি ব্যর্থ হয়েছে।" };
    invoiceId = inv.id;
  }

  const { error: itemsError } = await supabase.from("sales_invoice_items").insert(makeItems(invoiceId));
  if (itemsError) return { ok: false, error: itemsError.message };

  if (repostJv) {
    const voucherId = await postInvoiceJv(supabase, {
      invoiceNo, invoiceDate, customerName: customer?.name ?? "",
      paymentReceived, totalAmount, createdBy,
    });
    if (voucherId) await supabase.from("sales_invoices").update({ voucher_id: voucherId }).eq("id", invoiceId);
  }

  return { ok: true, invoiceId, invoiceNo };
}
