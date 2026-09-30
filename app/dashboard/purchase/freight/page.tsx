import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";
import { loadPaidViaAccounts } from "@/lib/paidViaAccounts";
import FreightForm from "./FreightForm";
import FreightTable from "./FreightTable";
import { resolveDatePreset } from "@/lib/datePresets";
import DateRangeFields from "@/components/DateRangeFields";

export default async function PurchaseFreightPage({
  searchParams,
}: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const { range, from: rawFrom, to: rawTo } = await searchParams;
  // তারিখ-ফিল্টার preset (Today … Previous Year / Date Range / All Time) — ডিফল্ট All Time (আগের মতো)
  const period = resolveDatePreset(range, rawFrom, rawTo, "all");
  const from = period.from || undefined;
  const to = period.to || undefined;
  const supabase = await createClient();

  const [{ data: entries }, paidViaAccounts] = await Promise.all([
    supabase
      .from("purchase_entries")
      .select("id, entry_no, entry_date, suppliers(name), purchase_entry_items(quantity_lbs, raw_materials(material_name))")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false }),
    loadPaidViaAccounts(supabase),
  ]);

  const entryOptions = (entries ?? []).map((e: any) => {
    const mats = (e.purchase_entry_items ?? [])
      .map((i: any) => i.raw_materials?.material_name)
      .filter(Boolean);
    const uniqMats = Array.from(new Set(mats));
    return {
      id: e.id,
      label: `${e.entry_no ?? "PE"} · ${e.suppliers?.name ?? "-"} · ${e.entry_date}${uniqMats.length ? " · " + uniqMats.join(", ") : ""}`,
      entryDate: e.entry_date as string,
    };
  });

  let q = supabase
    .from("purchase_freight_charges")
    .select(`id, charge_date, amount, description, source, voucher_id,
      purchase_entries(entry_no, suppliers(name)),
      paid_via:chart_of_accounts(account_code, account_name),
      journal_vouchers(voucher_no)`)
    .order("charge_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (from) q = q.gte("charge_date", from);
  if (to) q = q.lte("charge_date", to);
  const { data: charges } = await q;

  const total = (charges ?? []).reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Freight / Carrying Charges</h1>
        <Link href="/dashboard/purchase" className="text-sm text-gray-500 hover:underline">← Purchase-এ ফিরুন</Link>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        ক্রয়ের ফ্রেইট/লেবার খরচ — কাঁচামালের দামে যোগ হয় (ওই ক্রয়ের material-গুলোর মধ্যে Lbs-অনুপাতে ভাগ)।
        JV: Dr Raw Material Inventory / Cr Cash-Bank। এক ক্রয়ে একাধিক charge যোগ করা যায়।
      </p>

      <FreightForm entries={entryOptions} paidViaAccounts={paidViaAccounts} />

      <form className="mt-6 mb-4 flex flex-wrap items-end gap-3">
        <DateRangeFields preset={period.preset} from={period.from} to={period.to} includeAll />
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">ফিল্টার করুন</button>
      </form>

      <div className="rounded-xl border bg-white p-4 shadow-sm mb-4 max-w-xs">
        <p className="text-xs text-gray-500">Total Freight</p>
        <p className="text-lg font-semibold">{money(total)}</p>
      </div>

      <FreightTable charges={charges ?? []} />
    </div>
  );
}
