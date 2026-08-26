import Link from "next/link";

const links = [
  { label: "Warehouses", href: "/dashboard/inventory/warehouses", desc: "গুদামের তালিকা তৈরি ও পরিচালনা" },
  { label: "Raw Material Stock", href: "/dashboard/inventory/raw-material", desc: "LLDPE, LDPE, PP, Recycled Chips-এর স্টক (Lbs/Kg/Bags)" },
  { label: "Stock Ledger", href: "/dashboard/inventory/stock-ledger", desc: "সব স্টক লেনদেনের ইতিহাস" },
  { label: "Warehouse Transfer", href: "/dashboard/inventory/warehouse-transfer", desc: "গুদাম থেকে গুদামে স্টক/ওয়েস্টেজ ট্রান্সফার রেজিস্টার" },
];

export default function InventoryHomePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Inventory</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <h2 className="font-semibold text-gray-800 mb-1">{l.label}</h2>
            <p className="text-sm text-gray-500">{l.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}