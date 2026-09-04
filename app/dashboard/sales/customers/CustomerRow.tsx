"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteSimpleRow } from "@/lib/simpleDelete";
import { syncCustomerOpeningJv } from "@/lib/customerOpeningJv";
import GuardedAction from "@/app/dashboard/GuardedAction";
import RateHistoryPanel from "@/app/dashboard/sales/RateHistoryPanel";

type Customer = {
  id: string; name: string; code: string | null; address: string | null;
  phone: string | null; email: string | null; price_per_lbs: number | null;
  default_print_rate: number | null; default_adhesive_rate: number | null;
  opening_balance: number | null;
};

const COL_SPAN = 10;

export default function CustomerRow({
  customer, selected, onToggleSelect,
}: { customer: Customer; selected?: boolean; onToggleSelect?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [name, setName] = useState(customer.name);
  const [code, setCode] = useState(customer.code ?? "");
  const [address, setAddress] = useState(customer.address ?? "");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [printRate, setPrintRate] = useState(customer.default_print_rate != null ? String(customer.default_print_rate) : "0.20");
  const [adhesiveRate, setAdhesiveRate] = useState(customer.default_adhesive_rate != null ? String(customer.default_adhesive_rate) : "0.02");
  const [openingBalance, setOpeningBalance] = useState(customer.opening_balance != null ? String(customer.opening_balance) : "0");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSave() {
    setLoading(true);
    // Price/Lbs আর এখান থেকে বদলায় না — "Price History" থেকে তারিখ-ভিত্তিক ভাবে বদলাতে হয়।
    const { error } = await supabase
      .from("customers")
      .update({
        name, code: code.toUpperCase().trim() || null, address, phone, email,
        default_print_rate: parseFloat(printRate) || 0.20,
        default_adhesive_rate: parseFloat(adhesiveRate) || 0.02,
        opening_balance: parseFloat(openingBalance) || 0,
      })
      .eq("id", customer.id);
    if (error) { setLoading(false); setError(error.message); return; }
    await syncCustomerOpeningJv(supabase);
    setLoading(false);
    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm(`"${customer.name}" মুছে ফেলতে চান?`)) return;
    setLoading(true);
    const result = await deleteSimpleRow(supabase, "customers", customer.id);
    if (!result.ok) { setLoading(false); alert(result.error); return; }
    await syncCustomerOpeningJv(supabase);
    setLoading(false);
    router.refresh();
  }

  const checkboxCell = (
    <td className="px-4 py-2">
      <input
        type="checkbox"
        checked={!!selected}
        onChange={onToggleSelect}
        aria-label={`Select customer ${customer.name}`}
      />
    </td>
  );

  const historyRow = showHistory ? (
    <tr className="border-t bg-gray-50">
      <td colSpan={COL_SPAN} className="px-4 py-3">
        <RateHistoryPanel kind="customer" refId={customer.id} label={customer.name} />
      </td>
    </tr>
  ) : null;

  if (editing) {
    return (
      <>
        <tr className="border-t bg-yellow-50">
          {checkboxCell}
          <td className="px-4 py-2"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
          <td className="px-4 py-2"><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="w-20 rounded border px-2 py-1 text-sm" placeholder="AT" /></td>
          <td className="px-4 py-2"><input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
          <td className="px-4 py-2"><input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
          <td className="px-4 py-2 text-gray-500">
            {customer.price_per_lbs ?? "-"}
            <span className="block text-[11px] text-gray-400">Price History থেকে</span>
          </td>
          <td className="px-4 py-2"><input type="number" step="0.01" value={printRate} onChange={(e) => setPrintRate(e.target.value)} className="w-20 rounded border px-2 py-1 text-sm" /></td>
          <td className="px-4 py-2"><input type="number" step="0.001" value={adhesiveRate} onChange={(e) => setAdhesiveRate(e.target.value)} className="w-20 rounded border px-2 py-1 text-sm" /></td>
          <td className="px-4 py-2"><input type="number" step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} className="w-24 rounded border px-2 py-1 text-sm" /></td>
          <td className="px-4 py-2 text-right whitespace-nowrap">
            <button onClick={handleSave} disabled={loading} className="rounded bg-green-600 px-3 py-1 text-xs text-white mr-1">সেভ</button>
            <button onClick={() => setEditing(false)} className="rounded bg-gray-200 px-3 py-1 text-xs text-gray-700">বাতিল</button>
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </td>
        </tr>
        {historyRow}
      </>
    );
  }

  return (
    <>
      <tr className="border-t">
        {checkboxCell}
        <td className="px-4 py-2 font-medium">{customer.name}</td>
        <td className="px-4 py-2 text-gray-500">{customer.code || "-"}</td>
        <td className="px-4 py-2 text-gray-500">{customer.address || "-"}</td>
        <td className="px-4 py-2 text-gray-500">{customer.phone || "-"}</td>
        <td className="px-4 py-2 text-gray-500">
          {customer.price_per_lbs ?? "-"}
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="ml-2 text-xs text-blue-600 hover:underline"
          >
            {showHistory ? "History ▲" : "History ▼"}
          </button>
        </td>
        <td className="px-4 py-2 text-gray-500">{customer.default_print_rate ?? "0.20"}</td>
        <td className="px-4 py-2 text-gray-500">{customer.default_adhesive_rate ?? "0.02"}</td>
        <td className="px-4 py-2 text-right text-gray-500">{customer.opening_balance?.toFixed(2) ?? "0.00"}</td>
        <td className="px-4 py-2 text-right whitespace-nowrap">
          <GuardedAction table="customers" recordId={customer.id} recordLabel={customer.name} action="edit"
            onAllowed={() => setEditing(true)}
            className="rounded bg-blue-50 px-3 py-1 text-xs text-blue-700 mr-2 hover:bg-blue-100">Edit</GuardedAction>
          <GuardedAction table="customers" recordId={customer.id} recordLabel={customer.name} action="delete"
            onAllowed={handleDelete} disabled={loading}
            className="rounded bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100">Delete</GuardedAction>
        </td>
      </tr>
      {historyRow}
    </>
  );
}
