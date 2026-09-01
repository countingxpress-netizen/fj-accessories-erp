"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Company = {
  id?: string;
  name?: string | null; address?: string | null; phone?: string | null; email?: string | null;
  tin?: string | null; bin_vat?: string | null; trade_license?: string | null; logo_url?: string | null;
  signature_url?: string | null;
};

const FIELDS: { key: keyof Company; label: string; wide?: boolean; preview?: boolean }[] = [
  { key: "name", label: "Company Name" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address", wide: true },
  { key: "email", label: "Email" },
  { key: "tin", label: "TIN" },
  { key: "bin_vat", label: "BIN / VAT" },
  { key: "trade_license", label: "Trade License" },
  { key: "logo_url", label: "Logo URL (Print/Invoice হেডারে দেখাবে)", preview: true },
  { key: "signature_url", label: "Authorized Signature Image URL (Print/Invoice-এ দেখাবে)", preview: true },
];

export default function CompanyProfileForm({ company }: { company: Company | null }) {
  const [form, setForm] = useState<Company>(company ?? {});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function set(key: keyof Company, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name?.trim()) { setError("Company Name দিন।"); return; }
    setLoading(true);

    const payload: Record<string, any> = {
      name: form.name?.trim(),
      address: form.address || null, phone: form.phone || null, email: form.email || null,
      tin: form.tin || null, bin_vat: form.bin_vat || null,
      trade_license: form.trade_license || null, logo_url: form.logo_url || null,
      signature_url: form.signature_url || null,
    };

    let { error: err } = company?.id
      ? await supabase.from("company_profile").update(payload).eq("id", company.id)
      : await supabase.from("company_profile").insert(payload);

    // signature_url কলামটি migration না চালানো পর্যন্ত DB-তে না-ও থাকতে পারে —
    // সেক্ষেত্রে বাকি ফিল্ডগুলো যেন সেভ হতে পারে তার জন্য fallback।
    if (err?.message?.includes("signature_url")) {
      delete payload.signature_url;
      ({ error: err } = company?.id
        ? await supabase.from("company_profile").update(payload).eq("id", company.id)
        : await supabase.from("company_profile").insert(payload));
      if (!err) setError("⚠️ বাকি সব সেভ হয়েছে, কিন্তু Signature URL সেভ হয়নি — company_branding migration পুশ করা দরকার।");
    }

    setLoading(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FIELDS.map((f) => (
          <div key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
            <label className="block text-sm text-gray-600 mb-1">{f.label}</label>
            <div className="flex items-center gap-3">
              <input
                value={(form[f.key] as string) ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              {f.preview && (form[f.key] as string) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form[f.key] as string} alt={f.label} className="h-10 w-auto object-contain border rounded" />
              )}
            </div>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-700">✅ সেভ হয়েছে।</p>}
      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "সেভ করুন"}
      </button>
    </form>
  );
}
