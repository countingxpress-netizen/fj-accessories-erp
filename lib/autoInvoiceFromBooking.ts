import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { getCurrentUserId } from "@/lib/currentUser";

type SupabaseClient = ReturnType<typeof createClient>;

// এক booking_group সেভ করলে অটো একটা Sales Invoice তৈরি হয় — group-এর প্রতিটা
// booking = invoice-এর একটা লাইন, unit_price = booking-এর quoted_unit_price।
// Booking edit/delete-এ আবার এই sync ডাকা হয় যাতে invoice + JV আপডেট থাকে।
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
      created_by: args.createdBy,
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
    .select("id, invoice_no, voucher_id, payment_received")
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

/**
 * Booking group-এর auto Sales Invoice-কে বর্তমান (non-cancelled) booking-গুলোর সাথে
 * মিলিয়ে তৈরি / আপডেট করে। কোনো valid (দাম-সহ) booking না থাকলে invoice মুছে ফেলে।
 */
export async function syncAutoInvoiceForGroup(
  supabase: SupabaseClient,
  groupId: string,
  opts: AutoInvoiceOpts = {},
): Promise<AutoInvoiceResult> {
  const { data: groupBookings } = await supabase
    .from("bookings")
    .select("id, product_id, quantity_pcs, quoted_unit_price, booking_date, customer_id, style, delivery_point, customer_booking_ref, buyers(name), merchants(name)")
    .eq("booking_group_id", groupId)
    .neq("status", "cancelled");

  const existing = await findAutoInvoice(supabase, groupId);
  const rows = (groupBookings ?? []).filter(
    (b: any) => (b.quantity_pcs || 0) > 0 && (b.quoted_unit_price || 0) > 0,
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

  const { data: customer } = await supabase.from("customers").select("name").eq("id", first.customer_id).maybeSingle();
  const styles = Array.from(new Set(rows.map((r: any) => r.style).filter(Boolean))).join(", ");
  const bookingRefs = Array.from(new Set(rows.map((r: any) => r.customer_booking_ref).filter(Boolean))).join(", ");

  const header = {
    customer_id: first.customer_id,
    invoice_date: invoiceDate,
    buyer_name: first.buyers?.name ?? null,
    merchant_name: first.merchants?.name ?? null,
    style: styles || null,
    delivery_point: first.delivery_point ?? null,
    customer_booking_ref: bookingRefs || null,
    payment_received: paymentReceived,
    payment_type: paymentReceived ? "cash" : "credit",
  };

  const totalAmount = rows.reduce(
    (s: number, r: any) => s + Math.round((r.quantity_pcs || 0) * (r.quoted_unit_price || 0)),
    0,
  );

  let invoiceId: string;
  let invoiceNo: string;
  let repostJv = true;

  if (existing) {
    invoiceId = existing.id;
    invoiceNo = existing.invoice_no;

    // পুরনো total ও payment type — না বদলালে JV নতুন করে পোস্ট করার দরকার নেই
    const { data: oldItems } = await supabase.from("sales_invoice_items").select("amount").eq("invoice_id", invoiceId);
    const oldTotal = (oldItems ?? []).reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
    repostJv = !existing.voucher_id
      || oldTotal !== totalAmount
      || Boolean(existing.payment_received) !== paymentReceived;

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

  const { error: itemsError } = await supabase.from("sales_invoice_items").insert(
    rows.map((r: any) => ({
      invoice_id: invoiceId, product_id: r.product_id, booking_id: r.id,
      quantity_pcs: r.quantity_pcs, unit_price: r.quoted_unit_price,
    })),
  );
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
