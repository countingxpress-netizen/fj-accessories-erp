"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewRevisionButton({ piId }: { piId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleCreateRevision() {
    if (!window.confirm("এই PI-এর নতুন Revision তৈরি করতে চান? মূল PI অক্ষত থাকবে।")) return;
    setLoading(true);

    const { data: original } = await supabase.from("proforma_invoices").select("*").eq("id", piId).single();
    if (!original) { setLoading(false); return; }

    const { data: newPi } = await supabase
      .from("proforma_invoices")
      .insert({
        pi_no: original.pi_no, customer_id: original.customer_id, pi_date: new Date().toISOString().slice(0, 10),
        style: original.style, buyer_name: original.buyer_name, merchant_name: original.merchant_name,
        total_amount: original.total_amount, currency: original.currency,
        discount_type: original.discount_type, discount_value: original.discount_value,
        terms_conditions: original.terms_conditions, is_manual: original.is_manual,
        status: "draft", revision: (original.revision ?? 0) + 1, parent_pi_id: piId,
      })
      .select().single();

    if (newPi) {
      const { data: items } = await supabase.from("pi_items").select("*").eq("pi_id", piId);
      if (items && items.length) {
        await supabase.from("pi_items").insert(
          items.map((it: any) => ({
            pi_id: newPi.id, booking_id: it.booking_id, sl_no: it.sl_no,
            description: it.description, measurement: it.measurement,
            qty_pcs: it.qty_pcs, price_unit: it.price_unit, price_basis: it.price_basis,
          }))
        );
      }
      router.push(`/dashboard/lc-export/proforma/${newPi.id}/edit`);
    }
    setLoading(false);
  }

  return (
    <button onClick={handleCreateRevision} disabled={loading} className="rounded-lg border border-gray-900 px-4 py-2 text-sm text-gray-900">
      {loading ? "তৈরি হচ্ছে..." : "+ New Revision"}
    </button>
  );
}