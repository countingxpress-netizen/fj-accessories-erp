"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/currentUser";
import { formatDate } from "@/lib/formatDate";

type Bank = { id: string; bank_name: string };
type Customer = { id: string; name: string; address: string | null };
type Supplier = { id: string; name: string };
type PI = { id: string; pi_no: string; pi_date: string | null; customer_id: string | null; customers: { name: string } | null };

const REQUIRED_DOCUMENT_OPTIONS = [
  "Bill Of Exchange",
  "Commercial Invoice",
  "Delivery Challan",
  "Truck Challan",
  "Packing List",
  "BENEFICIARY'S CERTIFICATE",
  "APPLICANT'S CERTIFICATE",
  "Certificate of Origin",
];

const DRAFTS_AT_OPTIONS: { value: string; label: string }[] = [
  { value: "at_sight", label: "At Sight" },
  { value: "90_days_sight", label: "90 Days Sight" },
  { value: "120_days_sight", label: "120 Days Sight" },
];

const BENEFICIARY_OPTIONS = ["F&J Accessories", "MK Accessories"];

export default function NewLCForm({ banks, customers, suppliers, pis }: { banks: Bank[]; customers: Customer[]; suppliers: Supplier[]; pis: PI[] }) {
  const [lcType, setLcType] = useState<"import" | "export">("export");
  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [lcNo, setLcNo] = useState("");
  const [bankId, setBankId] = useState("");
  const [lcDate, setLcDate] = useState(new Date().toISOString().slice(0, 10));
  const [amendmentNo, setAmendmentNo] = useState("");
  const [amendmentDate, setAmendmentDate] = useState("");
  const [shipmentDate, setShipmentDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [applicant, setApplicant] = useState("");
  const [applicantTouched, setApplicantTouched] = useState(false);
  const [beneficiaryEntity, setBeneficiaryEntity] = useState(BENEFICIARY_OPTIONS[0]);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD"); // Import LC-তেই শুধু বদলানো যায়; Export সবসময় USD
  const [draftsAt, setDraftsAt] = useState("at_sight");
  const [requiredDocuments, setRequiredDocuments] = useState<string[]>([]);
  const [piSearch, setPiSearch] = useState("");
  const [selectedPiIds, setSelectedPiIds] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const selectedCustomer = customers.find((c) => c.id === customerId);

  function handleCustomerChange(id: string) {
    setCustomerId(id);
    if (!applicantTouched) {
      const c = customers.find((x) => x.id === id);
      setApplicant(c ? [c.name, c.address].filter(Boolean).join("\n") : "");
    }
  }

  function toggleDocument(doc: string) {
    setRequiredDocuments((prev) => (prev.includes(doc) ? prev.filter((d) => d !== doc) : [...prev, doc]));
  }

  function togglePi(id: string) {
    setSelectedPiIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const filteredPis = useMemo(() => {
    const q = piSearch.trim().toLowerCase();
    const list = q
      ? pis.filter((p) => `${p.pi_no} ${p.customers?.name ?? ""}`.toLowerCase().includes(q))
      : pis;
    // নির্বাচিত Customer-এর PI-গুলো ওপরে দেখাব — বাকি সব PI (বুকিং-লিংকড বা Manual, যেকোনো কাস্টমারের) নিচে থাকবে
    return [...list].sort((a, b) => {
      const aMine = a.customer_id === customerId ? 0 : 1;
      const bMine = b.customer_id === customerId ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;
      return (b.pi_date ?? "").localeCompare(a.pi_date ?? "");
    });
  }, [pis, piSearch, customerId]);

  const selectedPiCount = Object.values(selectedPiIds).filter(Boolean).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!lcNo || !bankId || !amount) { setError("LC No, Bank ও Amount দিন।"); return; }
    setLoading(true);

    const createdBy = await getCurrentUserId(supabase);

    if (lcType === "import") {
      const { error } = await supabase.from("lc_register").insert({
        lc_type: "import", lc_no: lcNo, bank_id: bankId,
        supplier_id: supplierId || null,
        lc_date: lcDate, expiry_date: expiryDate || null,
        amount: parseFloat(amount), currency, status: "active",
        created_by: createdBy,
      });
      setLoading(false);
      if (error) { setError(error.message); return; }
      router.push("/dashboard/lc-export/lc-register");
      return;
    }

    // Export LC — বিস্তারিত ফিল্ড + একাধিক PI লিংক
    const piIds = Object.entries(selectedPiIds).filter(([, v]) => v).map(([id]) => id);
    const { data: inserted, error } = await supabase
      .from("lc_register")
      .insert({
        lc_type: "export", lc_no: lcNo, bank_id: bankId,
        customer_id: customerId || null,
        lc_date: lcDate, expiry_date: expiryDate || null,
        amendment_no: amendmentNo || null, amendment_date: amendmentDate || null,
        shipment_date: shipmentDate || null,
        applicant: applicant || null, beneficiary_entity: beneficiaryEntity,
        amount: parseFloat(amount), currency: "USD",
        drafts_at: draftsAt, required_documents: requiredDocuments,
        status: "active", created_by: createdBy,
      })
      .select("id")
      .single();

    if (error) { setLoading(false); setError(error.message); return; }

    if (piIds.length) {
      const { error: linkError } = await supabase
        .from("lc_pi_items")
        .insert(piIds.map((pi_id) => ({ lc_id: inserted.id, pi_id })));
      if (linkError) { setLoading(false); setError(linkError.message); return; }
      await supabase.from("proforma_invoices").update({ status: "lc_opened" }).in("id", piIds);
    }

    setLoading(false);
    router.push("/dashboard/lc-export/lc-register");
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-3xl">
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm text-gray-600 mb-1">{lcType === "export" ? "Customer" : "Supplier"}</label>
          {lcType === "export" ? (
            <select value={customerId} onChange={(e) => handleCustomerChange(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
              <option value="">-- বাছুন --</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
              <option value="">-- বাছুন --</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">LC Type</label>
          <select value={lcType} onChange={(e) => setLcType(e.target.value as any)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="export">Export</option>
            <option value="import">Import</option>
          </select>
        </div>
      </div>

      {lcType === "import" ? (
        <>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">LC No</label>
              <input value={lcNo} onChange={(e) => setLcNo(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Bank</label>
              <select value={bankId} onChange={(e) => setBankId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[160px]" required>
                <option value="">-- বাছুন --</option>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.bank_name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">LC Date</label>
              <input type="date" value={lcDate} onChange={(e) => setLcDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Expiry Date</label>
              <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Amount</label>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" required />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="BDT">BDT</option>
              </select>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">LC Number</label>
              <input value={lcNo} onChange={(e) => setLcNo(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">LC Opening Date</label>
              <input type="date" value={lcDate} onChange={(e) => setLcDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Amendment Number</label>
              <input value={amendmentNo} onChange={(e) => setAmendmentNo(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Amendment Date</label>
              <input type="date" value={amendmentDate} onChange={(e) => setAmendmentDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Shipment Date</label>
              <input type="date" value={shipmentDate} onChange={(e) => setShipmentDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Expiry Date</label>
              <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm text-gray-600 mb-1">LC Opening Bank</label>
              <select value={bankId} onChange={(e) => setBankId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
                <option value="">-- বাছুন --</option>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.bank_name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-sm text-gray-600 mb-1">Applicant</label>
              <textarea
                value={applicant}
                onChange={(e) => { setApplicant(e.target.value); setApplicantTouched(true); }}
                rows={2}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Beneficiary</label>
              <select value={beneficiaryEntity} onChange={(e) => setBeneficiaryEntity(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                {BENEFICIARY_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">LC USD Amount</label>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-40" required />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Drafts at</label>
              <select value={draftsAt} onChange={(e) => setDraftsAt(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                {DRAFTS_AT_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-2">Required Documents</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {REQUIRED_DOCUMENT_OPTIONS.map((doc) => (
                <label key={doc} className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={requiredDocuments.includes(doc)} onChange={() => toggleDocument(doc)} />
                  {doc}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-2">
              PI Selection {selectedPiCount > 0 && <span className="text-gray-400">({selectedPiCount} টা বাছা হয়েছে)</span>}
            </label>
            <input
              value={piSearch} onChange={(e) => setPiSearch(e.target.value)}
              placeholder="PI No / Customer দিয়ে খুঁজুন..."
              className="w-full rounded-lg border px-3 py-2 text-sm mb-2"
            />
            <div className="max-h-56 overflow-y-auto rounded-lg border divide-y">
              {filteredPis.map((p) => (
                <label key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={!!selectedPiIds[p.id]} onChange={() => togglePi(p.id)} />
                    <span className="font-medium">{p.pi_no}</span>
                    <span className="text-gray-400">{p.customers?.name ?? "Manual"}</span>
                  </span>
                  <span className="text-gray-400 text-xs">{p.pi_date ? formatDate(p.pi_date) : "-"}</span>
                </label>
              ))}
              {filteredPis.length === 0 && <p className="px-3 py-2 text-gray-400 italic text-sm">কোনো PI পাওয়া যায়নি</p>}
            </div>
          </div>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "LC সেভ করুন"}
      </button>
    </form>
  );
}
