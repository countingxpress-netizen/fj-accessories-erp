"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/currentUser";
import { formatDate } from "@/lib/formatDate";

type Bank = { id: string; bank_name: string };
type LcOpeningBank = {
  id: string; bank_name: string; branch: string | null; address: string | null;
  applicant_bin: string | null; bond_license_no: string | null; boi_no: string | null;
  erc_no: string | null; irc_no: string | null; issuing_bank_bin: string | null;
};
type Customer = { id: string; name: string; address: string | null };
type Supplier = { id: string; name: string };
type Garment = { id: string; customer_id: string; name: string; address: string | null };
type PI = { id: string; pi_no: string; pi_date: string | null; customer_id: string | null; total_amount: number | null; customers: { name: string } | null };

// F&J-এর নিজস্ব "Export LC form.xlsx" নির্দেশনা + E:\Customer আর্কাইভের real LC Doc
// ফাইল (AT/Loopdot, Irish Garments) মিলিয়ে চূড়ান্ত — Excel-এর ঠিক এই ১০টা আইটেম, এই ক্রমে।
const REQUIRED_DOCUMENT_OPTIONS = [
  "Bill Of Exchange 1",
  "Bill Of Exchange 2",
  "Commercial Invoice",
  "Delivery Challan",
  "Truck Challan",
  "Packing List",
  "BENEFICIARY'S CERTIFICATE",
  "Certificate of Origin",
  "Inspection Certificate",
  "APPLICANT'S CERTIFICATE",
];

const DRAFTS_AT_OPTIONS: { value: string; label: string }[] = [
  { value: "at_sight", label: "At Sight" },
  { value: "90_days_sight", label: "90 Days Sight" },
  { value: "120_days_sight", label: "120 Days Sight" },
];
const DRAFTS_AT_CUSTOM_VALUE = "__custom__"; // যেকোনো ফিগার হতে পারে (যেমন "60 Days Sight") — নিচে টাইপ করা যায়

const BENEFICIARY_OPTIONS = ["F&J Accessories", "MK Accessories"];
const NEW_BANK_VALUE = "__new__";

export default function NewLCForm({
  banks, lcOpeningBanks, customers, suppliers, garments, pis,
}: {
  banks: Bank[]; lcOpeningBanks: LcOpeningBank[]; customers: Customer[]; suppliers: Supplier[];
  garments: Garment[]; pis: PI[];
}) {
  const [lcType, setLcType] = useState<"import" | "export">("export");
  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [lcNo, setLcNo] = useState("");
  const [bankId, setBankId] = useState(""); // Import LC — F&J-এর নিজের bank account
  const [lcDate, setLcDate] = useState(new Date().toISOString().slice(0, 10));
  const [amendmentNo, setAmendmentNo] = useState("");
  const [amendmentDate, setAmendmentDate] = useState("");
  const [shipmentDate, setShipmentDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [salesContractNo, setSalesContractNo] = useState("");
  const [salesContractDate, setSalesContractDate] = useState("");

  // Applicant/Garments — এখন Garments লিস্ট থেকে ড্রপডাউন, ঠিকানা এডিটযোগ্য (Proforma
  // ফর্মের garments dropdown-এর মতোই কনভেনশন)
  const [garmentsId, setGarmentsId] = useState("");
  const [applicant, setApplicant] = useState("");
  const [applicantTouched, setApplicantTouched] = useState(false);
  const [beneficiaryEntity, setBeneficiaryEntity] = useState(BENEFICIARY_OPTIONS[0]);

  // LC Opening Bank — বায়ারের ইস্যু করা ব্যাংক (F&J-এর নিজের bank account থেকে আলাদা
  // টেবিল, lc_opening_banks) — বিদ্যমান বাছুন বা "+ নতুন" দিয়ে সাথে সাথে তৈরি করুন
  const [lcOpeningBankId, setLcOpeningBankId] = useState("");
  const [newBankName, setNewBankName] = useState("");
  const [newBankBranch, setNewBankBranch] = useState("");
  const [newBankAddress, setNewBankAddress] = useState("");
  const [newApplicantBin, setNewApplicantBin] = useState("");
  const [newBondLicenseNo, setNewBondLicenseNo] = useState("");
  const [newBoiNo, setNewBoiNo] = useState("");
  const [newErcNo, setNewErcNo] = useState("");
  const [newIrcNo, setNewIrcNo] = useState("");
  const [newIssuingBankBin, setNewIssuingBankBin] = useState("");
  const [newBangladeshBankRefNo, setNewBangladeshBankRefNo] = useState("");
  const [newHsCodeNo, setNewHsCodeNo] = useState("");
  const [newCustomFields, setNewCustomFields] = useState([
    { label: "", value: "" }, { label: "", value: "" }, { label: "", value: "" },
  ]);

  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [currency, setCurrency] = useState("USD"); // Import LC-তেই শুধু বদলানো যায়; Export সবসময় USD
  const [draftsAt, setDraftsAt] = useState("at_sight");
  const [draftsAtCustom, setDraftsAtCustom] = useState("");
  const [requiredDocuments, setRequiredDocuments] = useState<string[]>([]);
  const [piSearch, setPiSearch] = useState("");
  const [selectedPiIds, setSelectedPiIds] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const availableGarments = garments.filter((g) => g.customer_id === customerId);

  function handleCustomerChange(id: string) {
    setCustomerId(id);
    setGarmentsId("");
    if (!applicantTouched) {
      const c = customers.find((x) => x.id === id);
      setApplicant(c ? [c.name, c.address].filter(Boolean).join("\n") : "");
    }
  }

  function handleGarmentChange(id: string) {
    setGarmentsId(id);
    const g = garments.find((x) => x.id === id);
    if (g) {
      setApplicant([g.name, g.address].filter(Boolean).join("\n"));
      setApplicantTouched(true);
    }
  }

  function toggleDocument(doc: string) {
    setRequiredDocuments((prev) => (prev.includes(doc) ? prev.filter((d) => d !== doc) : [...prev, doc]));
  }

  function togglePi(id: string) {
    setSelectedPiIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const filteredPis = useMemo(() => {
    // Customer বাছা থাকলে শুধু সেই কাস্টমারের PI — একটা LC একটা বায়ারের জন্যই হয়
    const base = customerId ? pis.filter((p) => p.customer_id === customerId) : pis;
    const q = piSearch.trim().toLowerCase();
    const list = q ? base.filter((p) => `${p.pi_no} ${p.customers?.name ?? ""}`.toLowerCase().includes(q)) : base;
    return [...list].sort((a, b) => (b.pi_date ?? "").localeCompare(a.pi_date ?? ""));
  }, [pis, piSearch, customerId]);

  const selectedPiCount = Object.values(selectedPiIds).filter(Boolean).length;
  const selectedPiTotal = useMemo(
    () => pis.filter((p) => selectedPiIds[p.id]).reduce((s, p) => s + (Number(p.total_amount) || 0), 0),
    [pis, selectedPiIds],
  );

  // PI বাছাই বদলালে LC Amount অটো বসে — ইউজার হাতে বদলে থাকলে (amountTouched) সেটা অক্ষুণ্ণ থাকে
  useEffect(() => {
    if (lcType === "export" && !amountTouched && selectedPiTotal > 0) {
      setAmount(String(Math.round(selectedPiTotal * 100) / 100));
    }
  }, [selectedPiTotal, amountTouched, lcType]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!lcNo || !amount) { setError("LC No ও Amount দিন।"); return; }
    setLoading(true);

    const createdBy = await getCurrentUserId(supabase);

    if (lcType === "import") {
      if (!bankId) { setLoading(false); setError("Bank বাছুন।"); return; }
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

    // Export LC — LC Opening Bank বাছা বা নতুন হলে আগে সেভ করে নিতে হবে
    let finalLcOpeningBankId = lcOpeningBankId;
    if (lcOpeningBankId === NEW_BANK_VALUE) {
      if (!newBankName.trim()) { setLoading(false); setError("নতুন ব্যাংকের নাম দিন।"); return; }
      const filledCustomFields = newCustomFields.filter((f) => f.label.trim() || f.value.trim());
      const { data: newBank, error: bankErr } = await supabase
        .from("lc_opening_banks")
        .insert({
          bank_name: newBankName.trim(), branch: newBankBranch || null, address: newBankAddress || null,
          applicant_bin: newApplicantBin || null, bond_license_no: newBondLicenseNo || null,
          boi_no: newBoiNo || null, erc_no: newErcNo || null, irc_no: newIrcNo || null,
          issuing_bank_bin: newIssuingBankBin || null,
          bangladesh_bank_ref_no: newBangladeshBankRefNo || null, hs_code_no: newHsCodeNo || null,
          custom_fields: filledCustomFields.length ? filledCustomFields : null,
        })
        .select("id").single();
      if (bankErr || !newBank) { setLoading(false); setError(bankErr?.message ?? "নতুন ব্যাংক সেভ ব্যর্থ হয়েছে।"); return; }
      finalLcOpeningBankId = newBank.id;
    } else if (!lcOpeningBankId) {
      setLoading(false); setError("LC Opening Bank বাছুন।"); return;
    }

    if (draftsAt === DRAFTS_AT_CUSTOM_VALUE && !draftsAtCustom.trim()) {
      setLoading(false); setError("Drafts at-এর কাস্টম মান দিন।"); return;
    }
    const finalDraftsAt = draftsAt === DRAFTS_AT_CUSTOM_VALUE ? draftsAtCustom.trim() : draftsAt;

    const piIds = Object.entries(selectedPiIds).filter(([, v]) => v).map(([id]) => id);
    const { data: inserted, error } = await supabase
      .from("lc_register")
      .insert({
        lc_type: "export", lc_no: lcNo, lc_opening_bank_id: finalLcOpeningBankId,
        customer_id: customerId || null,
        lc_date: lcDate, expiry_date: expiryDate || null,
        amendment_no: amendmentNo || null, amendment_date: amendmentDate || null,
        shipment_date: shipmentDate || null,
        sales_contract_no: salesContractNo || null, sales_contract_date: salesContractDate || null,
        applicant: applicant || null, beneficiary_entity: beneficiaryEntity,
        amount: parseFloat(amount), currency: "USD",
        drafts_at: finalDraftsAt, required_documents: requiredDocuments,
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
              <label className="block text-sm text-gray-600 mb-1">Export LC/Sales Contract No</label>
              <input value={salesContractNo} onChange={(e) => setSalesContractNo(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Sales Contract Date</label>
              <input type="date" value={salesContractDate} onChange={(e) => setSalesContractDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Shipment Date</label>
              <input type="date" value={shipmentDate} onChange={(e) => setShipmentDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Expiry Date</label>
              <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="rounded-lg border p-3 bg-gray-50 space-y-3">
            <p className="text-sm font-semibold text-gray-700">LC Opening Bank (বায়ারের ইস্যু করা ব্যাংক)</p>
            <select
              value={lcOpeningBankId}
              onChange={(e) => setLcOpeningBankId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              required
            >
              <option value="">-- বাছুন --</option>
              {lcOpeningBanks.map((b) => <option key={b.id} value={b.id}>{b.bank_name}{b.branch ? ` — ${b.branch}` : ""}</option>)}
              <option value={NEW_BANK_VALUE}>+ নতুন ব্যাংক যোগ করুন</option>
            </select>
            {lcOpeningBankId === NEW_BANK_VALUE && (
              <div className="grid grid-cols-2 gap-3">
                <input value={newBankName} onChange={(e) => setNewBankName(e.target.value)} placeholder="Bank Name *" className="rounded-lg border px-3 py-2 text-sm" />
                <input value={newBankBranch} onChange={(e) => setNewBankBranch(e.target.value)} placeholder="Branch" className="rounded-lg border px-3 py-2 text-sm" />
                <input value={newBankAddress} onChange={(e) => setNewBankAddress(e.target.value)} placeholder="Address" className="col-span-2 rounded-lg border px-3 py-2 text-sm" />
                <input value={newApplicantBin} onChange={(e) => setNewApplicantBin(e.target.value)} placeholder="Applicant BIN" className="rounded-lg border px-3 py-2 text-sm" />
                <input value={newIssuingBankBin} onChange={(e) => setNewIssuingBankBin(e.target.value)} placeholder="Issuing Bank's BIN" className="rounded-lg border px-3 py-2 text-sm" />
                <input value={newBondLicenseNo} onChange={(e) => setNewBondLicenseNo(e.target.value)} placeholder="Bond License No" className="rounded-lg border px-3 py-2 text-sm" />
                <input value={newBoiNo} onChange={(e) => setNewBoiNo(e.target.value)} placeholder="Boi No" className="rounded-lg border px-3 py-2 text-sm" />
                <input value={newErcNo} onChange={(e) => setNewErcNo(e.target.value)} placeholder="ERC No" className="rounded-lg border px-3 py-2 text-sm" />
                <input value={newIrcNo} onChange={(e) => setNewIrcNo(e.target.value)} placeholder="IRC No" className="rounded-lg border px-3 py-2 text-sm" />
                <input value={newBangladeshBankRefNo} onChange={(e) => setNewBangladeshBankRefNo(e.target.value)} placeholder="Bangladesh Bank Ref No." className="rounded-lg border px-3 py-2 text-sm" />
                <input value={newHsCodeNo} onChange={(e) => setNewHsCodeNo(e.target.value)} placeholder="H.S Code No:" className="rounded-lg border px-3 py-2 text-sm" />
                <div className="col-span-2 pt-2 border-t">
                  <p className="text-xs text-gray-500 mb-2">কাস্টম ফিল্ড (ঐচ্ছিক)</p>
                  {newCustomFields.map((f, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <input
                        value={f.label}
                        onChange={(e) => setNewCustomFields((prev) => prev.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))}
                        placeholder={`ফিল্ডের নাম ${i + 1}`}
                        className="flex-1 rounded-lg border px-3 py-2 text-sm"
                      />
                      <input
                        value={f.value}
                        onChange={(e) => setNewCustomFields((prev) => prev.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)))}
                        placeholder="মান"
                        className="flex-1 rounded-lg border px-3 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm text-gray-600 mb-1">Applicant/Garments</label>
              <select value={garmentsId} onChange={(e) => handleGarmentChange(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm mb-2">
                <option value="">-- Garments বাছুন --</option>
                {availableGarments.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <textarea
                value={applicant}
                onChange={(e) => { setApplicant(e.target.value); setApplicantTouched(true); }}
                rows={2}
                placeholder="Garments বাছলে অটো বসবে, দরকারে এডিট করুন"
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
              <input
                type="number" step="0.01" value={amount}
                onChange={(e) => { setAmount(e.target.value); setAmountTouched(true); }}
                className="rounded-lg border px-3 py-2 text-sm w-40" required
              />
              {selectedPiCount > 0 && (
                <p className="text-[11px] text-gray-400 mt-1">
                  বাছাই করা {selectedPiCount} PI-র যোগফল: {selectedPiTotal.toFixed(2)}
                  {amountTouched && (
                    <button type="button" onClick={() => { setAmountTouched(false); setAmount(String(Math.round(selectedPiTotal * 100) / 100)); }} className="ml-1 text-blue-600 hover:underline">
                      Auto বসান
                    </button>
                  )}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Drafts at</label>
              <select value={draftsAt} onChange={(e) => setDraftsAt(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                {DRAFTS_AT_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                <option value={DRAFTS_AT_CUSTOM_VALUE}>Custom (নিজে লিখুন)</option>
              </select>
              {draftsAt === DRAFTS_AT_CUSTOM_VALUE && (
                <input
                  value={draftsAtCustom} onChange={(e) => setDraftsAtCustom(e.target.value)}
                  placeholder="যেমন: 60 Days Sight" className="mt-2 rounded-lg border px-3 py-2 text-sm w-40"
                />
              )}
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
