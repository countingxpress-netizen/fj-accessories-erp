"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const statusConfig: Record<string, { label: string; icon: string; className: string }> = {
  challan_ready: { label: "Challan Ready", icon: "🔵", className: "bg-blue-100 text-blue-700 border-blue-200" },
  in_transit: { label: "In Transit", icon: "🚚", className: "bg-purple-100 text-purple-700 border-purple-200" },
  delivery_done: { label: "Delivery Done", icon: "🟢", className: "bg-green-100 text-green-700 border-green-200" },
  challan_received: { label: "Challan Received", icon: "✅", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  cancelled: { label: "Cancelled", icon: "🔴", className: "bg-red-100 text-red-700 border-red-200" },
};

const statusOrder = ["challan_ready", "in_transit", "delivery_done", "challan_received", "cancelled"];

export default function DeliveryStatusBadge({ challanId, currentStatus }: { challanId: string; currentStatus: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();

  const current = statusConfig[currentStatus] ?? statusConfig.challan_ready;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function updateStatus(newStatus: string) {
    setLoading(true);
    await supabase.from("delivery_challans").update({ delivery_status: newStatus }).eq("id", challanId);
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition hover:shadow-sm disabled:opacity-50 ${current.className}`}
      >
        <span>{current.icon}</span>
        <span>{current.label}</span>
        <span className="text-[10px] opacity-60">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-48 rounded-lg border bg-white shadow-lg py-1">
          {statusOrder.map((key) => {
            const cfg = statusConfig[key];
            return (
              <button
                key={key}
                onClick={() => updateStatus(key)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-xs text-left hover:bg-gray-50 ${
                  key === currentStatus ? "font-semibold" : ""
                }`}
              >
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
                {key === currentStatus && <span className="ml-auto text-green-600">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}








