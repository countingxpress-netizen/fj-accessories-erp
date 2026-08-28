"use client";
import AdvisingBankRow from "./AdvisingBankRow";

export default function AdvisingBanksTable({ banks }: { banks: any[] }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-600">
          <tr>
            <th className="px-4 py-3">Bank Name</th>
            <th className="px-4 py-3">Branch</th>
            <th className="px-4 py-3">Address</th>
            <th className="px-4 py-3">SWIFT</th>
            <th className="px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {banks.map((b) => <AdvisingBankRow key={b.id} bank={b} />)}
          {banks.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-3 text-gray-400 italic">কোনো Advising Bank যোগ করা হয়নি</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
