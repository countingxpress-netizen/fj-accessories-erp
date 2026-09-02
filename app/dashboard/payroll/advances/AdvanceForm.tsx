"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { postPayrollAdvance } from "@/lib/payrollJv";
import { getCurrentUserId } from "@/lib/currentUser";

type Employee = { id: string; name: string; employee_code: string };
type Account = { id: string; account_code: string; account_name: string };

export default function AdvanceForm({
  employees, cashBankAccounts,
}: { employees: Employee[]; cashBankAccounts: Account[] }) {
  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState(cashBankAccounts[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const amt = parseFloat(amount);
    if (!employeeId || !accountId || !amt || amt <= 0) {
      setError("Employee, Paid Via ও সঠিক Amount দিন।");
      return;
    }
    setLoading(true);

    const emp = employees.find((x) => x.id === employeeId);
    const voucherId = await postPayrollAdvance(supabase, {
      date,
      narration: `Advance to ${emp?.name ?? "employee"}${note ? " — " + note : ""}`,
      memo: `Advance ${emp?.employee_code ?? ""}`,
      amount: amt,
      depositAccountId: accountId,
    });

    const createdBy = await getCurrentUserId(supabase);
    const { error: insErr } = await supabase.from("employee_advances").insert({
      employee_id: employeeId, amount: amt, advance_date: date, note: note || null, voucher_id: voucherId,
      created_by: createdBy,
    });

    setLoading(false);
    if (insErr) { setError(insErr.message); return; }
    setAmount(""); setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-2xl">
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm text-gray-600 mb-1">Employee</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
            <option value="">-- বাছুন --</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.employee_code} — {e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Amount</label>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-32 rounded-lg border px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Paid Via</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[160px]" required>
            {cashBankAccounts.length === 0 && <option value="">Cash/Bank নেই</option>}
            {cashBankAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm text-gray-600 mb-1">Note (ঐচ্ছিক)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "অগ্রিম দিন"}
      </button>
    </form>
  );
}
