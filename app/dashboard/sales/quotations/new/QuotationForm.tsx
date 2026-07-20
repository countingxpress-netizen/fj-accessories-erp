"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";

type Customer = { id: string; name: string };
type Product = { id: string; product_name: string };

export default function QuotationForm({ customers, products }: { customers: Customer[]; products: Product[] }) {
  const [customerId, setCustomerId] = useState("");
  const [quotationDate, setQuotationDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([{ product_id: "", quantity: "", unit_price: "" }]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function updateItem(i: number, field: string, value: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [field]: value } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, { product_id: "", quantity: "", unit_price: "" }]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const validItems = items.filter((i) => i.product_id && parseFloat(i.quantity) > 0);
    if (!customerId || validItems.length === 0) {
      setError("Customer এবং অন্তত ১টা পণ্য যোগ করুন।");
      return;
    }
    setLoading(true);

    const quotationNo = await generateNextDocNo(supabase, "quotations", "quotation_no", "QT", "quotation_date", quotationDate);
    const { data: quotation, error: qError } = await supabase
      .from("quotations")
      .insert({ quotation_no: quotationNo, customer_id: customerId, quotation_date: quotationDate, status: "draft" })
      .select().single();

    if (qError || !quotation) {
      setLoading(false);
      setError(qError?.message ?? "Quotation তৈরি ব্যর্থ হয়েছে।");
      return;
    }

    await supabase.from("quotation_items").insert(
      validItems.map((i) => ({
        quotation_id: quotation.id, product_id: i.product_id,
        quantity_pcs: parseFloat(i.quantity), unit_price: parseFloat(i.unit_price) || 0,
      }))
    );

    setLoading(false);
    router.push("/dashboard/sales/quotations");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-2xl">
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm text-gray-600 mb-1">Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
            <option value="">-- বাছুন --</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Date</label>
          <input type="date" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
      </div>

      {items.map((it, i) => (
        <div key={i} className="flex gap-3">
          <select value={it.product_id} onChange={(e) => updateItem(i, "product_id", e.target.value)} className="flex-1 rounded-lg border px-3 py-2 text-sm">
            <option value="">-- Product বাছুন --</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.product_name}</option>)}
          </select>
          <input type="number" placeholder="Qty" value={it.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} className="w-28 rounded-lg border px-3 py-2 text-sm" />
          <input type="number" step="0.01" placeholder="Unit Price" value={it.unit_price} onChange={(e) => updateItem(i, "unit_price", e.target.value)} className="w-32 rounded-lg border px-3 py-2 text-sm" />
        </div>
      ))}
      <button type="button" onClick={addItem} className="rounded-lg border border-dashed px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
        + আরেকটি পণ্য যোগ করুন
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Quotation সেভ করুন"}
      </button>
    </form>
  );
}