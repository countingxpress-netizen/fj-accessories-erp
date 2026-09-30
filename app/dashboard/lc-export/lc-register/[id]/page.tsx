import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { money } from "@/lib/format";
import { lineAmount, masterTotals, setTotals } from "@/lib/lcMasterPi";
import { docsWithoutTemplate, templatesFor } from "@/lib/lcDocuments";
import RequiredDocsEditor from "./RequiredDocsEditor";
import CreateMasterPiButton from "./CreateMasterPiButton";
import DeleteDocSetButton from "./DeleteDocSetButton";
import SerialNoEditor from "./SerialNoEditor";

export default async function LCViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: lc } = await supabase
    .from("lc_register")
    .select(`*, lc_opening_banks(*), customers(name), suppliers(name),
      lc_pi_items(pi_id, proforma_invoices(id, pi_no, pi_date, total_amount))`)
    .eq("id", id).single();
  if (!lc) return notFound();

  const { data: master } = await supabase
    .from("lc_master_pis")
    .select("*, lc_master_pi_items(*)")
    .eq("lc_id", id).maybeSingle();
  const masterItems = [...((master?.lc_master_pi_items ?? []) as any[])].sort((a, b) => a.sl_no - b.sl_no);
  const totals = master ? masterTotals(master, masterItems) : null;

  const { data: sets } = await supabase
    .from("lc_document_sets")
    .select("*, lc_document_set_items(master_item_id, qty_pcs)")
    .eq("lc_id", id).order("set_no");

  const linkedPis = ((lc.lc_pi_items ?? []) as any[]).map((x) => x.proforma_invoices).filter(Boolean);
  const templates = templatesFor(lc.required_documents);
  const missingTemplates = docsWithoutTemplate(lc.required_documents);
  const base = `/dashboard/lc-export/lc-register/${id}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/dashboard/lc-export/lc-register" className="text-sm text-gray-500 hover:underline">← LC Register</Link>
          <h1 className="text-2xl font-semibold">{lc.serial_no != null ? `${lc.serial_no}. ` : ""}LC {lc.lc_no}</h1>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs ${lc.lc_type === "export" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
          {lc.lc_type === "export" ? "Export" : "Import"} · {lc.status}
        </span>
      </div>

      <div className="grid gap-4 rounded-xl border bg-white p-5 text-sm shadow-sm sm:grid-cols-3">
        {lc.lc_type === "export" && (
          <div className="sm:col-span-3">
            <SerialNoEditor lcId={id} initial={lc.serial_no ?? null} lcDate={lc.lc_date} beneficiary={lc.beneficiary_entity} />
          </div>
        )}
        <div><p className="text-xs text-gray-500">Customer</p><p className="font-medium">{lc.customers?.name ?? lc.suppliers?.name ?? "-"}</p></div>
        <div><p className="text-xs text-gray-500">LC Date / Expiry</p><p>{formatDate(lc.lc_date)} / {lc.expiry_date ? formatDate(lc.expiry_date) : "-"}</p></div>
        <div><p className="text-xs text-gray-500">Amount</p><p className="font-semibold">{money(lc.amount)} {lc.currency}</p></div>
        <div><p className="text-xs text-gray-500">LC Opening Bank</p><p>{lc.lc_opening_banks?.bank_name ?? "-"}{lc.lc_opening_banks?.branch ? `, ${lc.lc_opening_banks.branch}` : ""}</p></div>
        <div><p className="text-xs text-gray-500">Export LC/SC No</p><p>{lc.sales_contract_no ?? "-"}{lc.sales_contract_date ? ` (${formatDate(lc.sales_contract_date)})` : ""}</p></div>
        <div><p className="text-xs text-gray-500">Applicant</p><p className="whitespace-pre-line">{lc.applicant ?? "-"}</p></div>
        <div className="sm:col-span-3">
          <p className="text-xs text-gray-500">Linked PI ({linkedPis.length})</p>
          <p className="text-xs">{linkedPis.map((p: any) => p.pi_no).join(", ") || "-"}</p>
        </div>
      </div>

      {lc.lc_type === "export" && (
        <>
          <RequiredDocsEditor lcId={id} initial={lc.required_documents ?? []} />

          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Master PI</h2>
              {master && (
                <div className="flex gap-2">
                  <Link href={`${base}/master-pi`} className="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white">View &amp; Edit</Link>
                  <Link href={`${base}/master-pi/print`} className="rounded-lg border px-4 py-2 text-sm">🖨 Print</Link>
                </div>
              )}
            </div>
            {!master ? (
              <CreateMasterPiButton lcId={id} applicant={lc.applicant ?? ""} piIds={linkedPis.map((p: any) => p.id)} />
            ) : (
              <>
                <p className="mb-2 text-xs text-gray-500 whitespace-pre-line">{master.pi_ref_text}</p>
                <div className="max-h-80 overflow-auto rounded border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50 text-left text-gray-600">
                      <tr>
                        <th className="px-2 py-1">Sl</th><th className="px-2 py-1">Description</th><th className="px-2 py-1">Measurement</th>
                        <th className="px-2 py-1 text-right">Qty (Pcs)</th><th className="px-2 py-1 text-right">Price</th><th className="px-2 py-1 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {masterItems.map((it) => (
                        <tr key={it.id} className="border-t">
                          <td className="px-2 py-1">{it.sl_no}</td>
                          <td className="px-2 py-1 whitespace-pre-line">{it.description}</td>
                          <td className="px-2 py-1">{it.measurement}</td>
                          <td className="px-2 py-1 text-right">{Number(it.qty_pcs).toLocaleString("en-IN")}</td>
                          <td className="px-2 py-1 text-right">{Number(it.price_unit).toFixed(master.price_decimals ?? 4)}/{it.price_basis}</td>
                          <td className="px-2 py-1 text-right">{money(lineAmount(Number(it.qty_pcs), Number(it.price_unit), it.price_basis))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totals && (
                  <p className="mt-2 text-right text-sm">
                    Subtotal ${money(totals.subtotal)} − Discount ${money(totals.discount)} = <strong>${money(totals.total)}</strong>
                    {Math.abs(totals.total - Number(lc.amount)) >= 0.01 && (
                      <span className="ml-2 text-xs text-amber-600">(LC Amount {money(lc.amount)}-এর সাথে মিলছে না)</span>
                    )}
                  </p>
                )}
              </>
            )}
          </section>

          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">LC Documents</h2>
                <p className="text-xs text-gray-500">
                  প্রতিটা শিপমেন্ট/ডেলিভারির জন্য একটা সেট। প্রিন্টে আসবে: {templates.map((t) => t.title).join(", ") || "— (উপরে Required Documents বাছুন)"}
                </p>
                {missingTemplates.length > 0 && (
                  <p className="text-xs text-amber-600">টেমপলেট এখনো নেই: {missingTemplates.join(", ")}</p>
                )}
              </div>
              {master && (
                <Link href={`${base}/documents/new`} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">+ নতুন ডকুমেন্ট সেট</Link>
              )}
            </div>
            {!master ? (
              <p className="text-sm text-gray-400 italic">আগে Master PI তৈরি করুন।</p>
            ) : (sets ?? []).length === 0 ? (
              <p className="text-sm text-gray-400 italic">এখনো কোনো ডকুমেন্ট সেট নেই।</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Set</th><th className="px-3 py-2">Invoice No</th><th className="px-3 py-2">Delivery Date</th>
                    <th className="px-3 py-2 text-right">Qty (Pcs)</th><th className="px-3 py-2 text-right">Amount (USD)</th><th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(sets ?? []).map((s: any) => {
                    const st = setTotals(master, masterItems, s.lc_document_set_items ?? []);
                    return (
                      <tr key={s.id} className="border-t">
                        <td className="px-3 py-2 font-medium">#{s.set_no}</td>
                        <td className="px-3 py-2">{s.invoice_no ?? "-"}</td>
                        <td className="px-3 py-2">{s.delivery_date ? formatDate(s.delivery_date) : "-"}</td>
                        <td className="px-3 py-2 text-right">{st.totalPcs.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-2 text-right">{money(st.total)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <Link href={`${base}/documents/${s.id}/print`} className="mr-2 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100">🖨 Documents</Link>
                          <Link href={`${base}/documents/${s.id}/edit`} className="mr-2 rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200">Edit</Link>
                          <DeleteDocSetButton setId={s.id} label={`#${s.set_no}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
