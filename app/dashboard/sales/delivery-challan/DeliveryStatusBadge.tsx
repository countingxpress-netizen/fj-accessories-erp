// Read-only Delivery Status badge. স্ট্যাটাস আর হাতে বদলানো যায় না —
//   challan_ready    : চালান তৈরি
//   delivery_done    : চালান Print করা হয়েছে (Print বাটন)
//   challan_received : Challan Received পেজ থেকে confirm করা হয়েছে

const statusConfig: Record<string, { label: string; className: string }> = {
  challan_ready: { label: "Challan Ready", className: "bg-blue-100 text-blue-700 border-blue-200" },
  delivery_done: { label: "Delivery Done", className: "bg-green-100 text-green-700 border-green-200" },
  challan_received: { label: "Challan Received", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
};

export default function DeliveryStatusBadge({ currentStatus }: { currentStatus: string }) {
  const cfg = statusConfig[currentStatus] ?? statusConfig.challan_ready;
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
