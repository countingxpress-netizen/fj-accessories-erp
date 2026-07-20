import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: company } = await supabase.from("company_profile").select("*").single();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
      {company && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="font-semibold">{company.name}</p>
          <p className="text-sm text-gray-600">{company.address}</p>
          <p className="text-sm text-gray-600">TIN: {company.tin} | BIN: {company.bin_vat}</p>
        </div>
      )}
    </div>
  );
}