import ChallanRow from "./ChallanRow";

export default function ChallanTable({
  challans, piNoByChallan = {}, latestChallanNo = "", bkById = {},
}: {
  challans: any[]; piNoByChallan?: Record<string, string>; latestChallanNo?: string;
  bkById?: Record<string, any>;
}) {
  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-600">
          <tr>
            <th className="px-3 py-2 w-8"></th>
            <th className="px-4 py-2">Challan No</th>
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Customer</th>
            <th className="px-4 py-2">Booking</th>
            <th className="px-4 py-2">PI No</th>
            <th className="px-4 py-2">Product</th>
            <th className="px-4 py-2 text-right">Qty</th>
            <th className="px-4 py-2">Type</th>
            <th className="px-4 py-2">Delivery Status</th>
            <th className="px-4 py-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {challans.map((c: any) => (
            <ChallanRow
              key={c.id}
              challan={c}
              piNo={piNoByChallan[c.id] ?? ""}
              isLatest={!!latestChallanNo && c.challan_no === latestChallanNo}
              bkById={bkById}
            />
          ))}
          {challans.length === 0 && (
            <tr>
              <td colSpan={11} className="px-4 py-4 text-center text-gray-400 italic">
                এখনো কোনো Delivery Challan নেই
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
