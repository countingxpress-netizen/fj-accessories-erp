"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NavIcon from "./NavIcon";

type MenuItem = { label: string; href: string };
type MenuGroup = { label: string; href: string; icon: string; items?: MenuItem[] };

const menu: MenuGroup[] = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
  {
    label: "Accounting", href: "/dashboard/accounting", icon: "accounting",
    items: [
      { label: "Chart of Accounts", href: "/dashboard/accounting" },
      { label: "Journal Vouchers", href: "/dashboard/accounting/journal" },
      { label: "General Ledger", href: "/dashboard/accounting/ledger" },
      { label: "Trial Balance", href: "/dashboard/accounting/trial-balance" },
      { label: "Cash Book", href: "/dashboard/accounting/cash-book" },
      { label: "Bank Book", href: "/dashboard/accounting/bank-book" },
      { label: "Profit বণ্টন", href: "/dashboard/accounting/profit-distribution" },
    ],
  },
  {
    label: "Inventory", href: "/dashboard/inventory", icon: "inventory",
    items: [
      { label: "Warehouses", href: "/dashboard/inventory/warehouses" },
      { label: "Raw Material Stock", href: "/dashboard/inventory/raw-material" },
      { label: "Stock Ledger", href: "/dashboard/inventory/stock-ledger" },
      { label: "Warehouse Transfer", href: "/dashboard/inventory/warehouse-transfer" },
    ],
  },
  {
    label: "Purchase", href: "/dashboard/purchase", icon: "purchase",
    items: [
      { label: "Suppliers", href: "/dashboard/purchase/suppliers" },
      { label: "Purchase Entry", href: "/dashboard/purchase/entry" },
      { label: "Freight Charges", href: "/dashboard/purchase/freight" },
      { label: "Expenses", href: "/dashboard/purchase/expenses" },
      { label: "Payment Given", href: "/dashboard/purchase/payment-given" },
      { label: "Supplier Ledger", href: "/dashboard/purchase/supplier-ledger" },
    ],
  },
  {
    label: "Sales", href: "/dashboard/sales", icon: "sales",
    items: [
      { label: "Customers", href: "/dashboard/sales/customers" },
      { label: "Customer Groups", href: "/dashboard/sales/customer-groups" },
      { label: "Buyers", href: "/dashboard/sales/buyers" },
      { label: "Garments", href: "/dashboard/sales/garments" },
      { label: "Booking Received", href: "/dashboard/sales/bookings" },
      { label: "Quotation", href: "/dashboard/sales/quotations" },
      { label: "Sales Invoice", href: "/dashboard/sales/invoices" },
      { label: "Delivery Challan", href: "/dashboard/sales/delivery-challan" },
      { label: "Payment Received", href: "/dashboard/sales/payment-received" },
      { label: "Customer Ledger", href: "/dashboard/sales/customer-ledger" },
    ],
  },
  {
    label: "Production", href: "/dashboard/production", icon: "production",
    items: [
      { label: "Production Orders", href: "/dashboard/production/orders" },
      { label: "Complete Production", href: "/dashboard/production/complete" },
      { label: "Finished Goods Receive", href: "/dashboard/production/finished-goods-receive" },
      { label: "Wastage", href: "/dashboard/production/wastage" },
    ],
  },
  {
    label: "Payroll", href: "/dashboard/payroll", icon: "payroll",
    items: [
      { label: "Employees", href: "/dashboard/payroll/employees" },
      { label: "Salary Revisions", href: "/dashboard/payroll/salary-revisions" },
      { label: "Attendance", href: "/dashboard/payroll/attendance" },
      { label: "Overtime রিপোর্ট", href: "/dashboard/payroll/overtime" },
      { label: "Employee Advance", href: "/dashboard/payroll/advances" },
      { label: "Salary Sheet", href: "/dashboard/payroll/salary-sheet" },
      { label: "Eid Bonus", href: "/dashboard/payroll/bonus" },
    ],
  },
  {
    label: "LC & Export", href: "/dashboard/lc-export", icon: "export",
    items: [
      { label: "Proforma Invoice", href: "/dashboard/lc-export/proforma" },
      { label: "Advising Banks", href: "/dashboard/lc-export/advising-banks" },
      { label: "LC Register", href: "/dashboard/lc-export/lc-register" },
      { label: "Export Invoice", href: "/dashboard/lc-export/export-invoice" },
      { label: "Packing List", href: "/dashboard/lc-export/packing-list" },
      { label: "EXP Tracking", href: "/dashboard/lc-export/exp-tracking" },
      { label: "Bank Charges", href: "/dashboard/lc-export/bank-charges" },
    ],
  },
  {
    label: "Reports", href: "/dashboard/reports", icon: "reports",
    items: [
      { label: "Profit & Loss", href: "/dashboard/accounting/profit-loss" },
      { label: "Balance Sheet", href: "/dashboard/accounting/balance-sheet" },
      { label: "Stock Report", href: "/dashboard/reports/stock-report" },
      { label: "Production Report", href: "/dashboard/reports/production-report" },
      { label: "Cash Flow", href: "/dashboard/reports/cash-flow" },
      { label: "Outstanding Report", href: "/dashboard/reports/outstanding" },
      { label: "Expense Report", href: "/dashboard/reports/expense-report" },
      { label: "Receivable Statement", href: "/dashboard/reports/receivable-statement" },
      { label: "Sales by Customer", href: "/dashboard/reports/sales-by-customer" },
      { label: "Commission Report", href: "/dashboard/reports/commission" },
    ],
  },
];

function isItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/** বর্তমান route যে group-এ পড়ে — সবচেয়ে নির্দিষ্ট (দীর্ঘতম) href জেতে। */
function activeGroupLabel(pathname: string): string | null {
  let best: { label: string; len: number } | null = null;
  for (const g of menu) {
    const hrefs = [g.href, ...(g.items?.map((i) => i.href) ?? [])];
    for (const h of hrefs) {
      if (h === "/dashboard" ? pathname === h : isItemActive(pathname, h)) {
        if (!best || h.length > best.len) best = { label: g.label, len: h.length };
      }
    }
  }
  return best?.label ?? null;
}

export default function SidebarMenu() {
  const pathname = usePathname() || "";
  const activeLabel = useMemo(() => activeGroupLabel(pathname), [pathname]);
  const [openGroup, setOpenGroup] = useState<string | null>(activeLabel);

  // route বদলালে ওই section অটো খুলে দাও
  useEffect(() => {
    setOpenGroup(activeLabel);
  }, [activeLabel]);

  return (
    <nav className="space-y-0.5 flex-1 overflow-y-auto">
      {menu.map((group) => {
        const groupActive = activeLabel === group.label;

        if (!group.items) {
          return (
            <Link
              key={group.href}
              href={group.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                groupActive ? "bg-gray-800 text-white font-medium" : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <NavIcon name={group.icon} />
              <span>{group.label}</span>
            </Link>
          );
        }

        const isOpen = openGroup === group.label;
        return (
          <div key={group.label}>
            <button
              type="button"
              onClick={() => setOpenGroup(isOpen ? null : group.label)}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                groupActive ? "text-white font-medium" : "text-gray-300 hover:bg-gray-800 hover:text-white"
              } ${isOpen && !groupActive ? "bg-gray-800/60" : ""} ${groupActive ? "bg-gray-800" : ""}`}
            >
              <NavIcon name={group.icon} />
              <span className="flex-1 text-left">{group.label}</span>
              <svg
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round"
                className={`h-3.5 w-3.5 text-gray-500 transition-transform ${isOpen ? "rotate-90" : ""}`}
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            {isOpen && (
              <div className="ml-[1.35rem] border-l border-gray-700 pl-2 py-0.5 space-y-0.5">
                {group.items.map((item) => {
                  const itemActive = isItemActive(pathname, item.href) &&
                    // Reports-এর P&L ইত্যাদি /dashboard/accounting-এ পড়ে — সঠিক group-এ থাকলে তবেই active
                    activeLabel === group.label;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                        itemActive
                          ? "bg-gray-800 text-white font-medium"
                          : "text-gray-400 hover:bg-gray-800 hover:text-white"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
