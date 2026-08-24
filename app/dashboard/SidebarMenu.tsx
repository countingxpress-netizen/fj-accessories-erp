"use client";
import { useState } from "react";
import Link from "next/link";

type MenuItem = { label: string; href: string };
type MenuGroup = { label: string; href: string; items?: MenuItem[] };

const menu: MenuGroup[] = [
  { label: "Dashboard", href: "/dashboard" },
  {
    label: "Accounting", href: "/dashboard/accounting",
    items: [
      { label: "Chart of Accounts", href: "/dashboard/accounting" },
      { label: "Journal Vouchers", href: "/dashboard/accounting/journal" },
      { label: "General Ledger", href: "/dashboard/accounting/ledger" },
      { label: "Trial Balance", href: "/dashboard/accounting/trial-balance" },
      { label: "Cash Book", href: "/dashboard/accounting/cash-book" },
      { label: "Bank Book", href: "/dashboard/accounting/bank-book" },
    ],
  },
  {
    label: "Inventory", href: "/dashboard/inventory",
    items: [
      { label: "Warehouses", href: "/dashboard/inventory/warehouses" },
      { label: "Raw Material Stock", href: "/dashboard/inventory/raw-material" },
      { label: "Finished Goods", href: "/dashboard/inventory/finished-goods" },
      { label: "Stock Ledger", href: "/dashboard/inventory/stock-ledger" },
    ],
  },
    {
    label: "Purchase", href: "/dashboard/purchase",
    items: [
      { label: "Suppliers", href: "/dashboard/purchase/suppliers" },
      { label: "Purchase Entry", href: "/dashboard/purchase/entry" },
      { label: "Expenses", href: "/dashboard/purchase/expenses" },
      { label: "Payment Given", href: "/dashboard/purchase/payment-given" },
      { label: "Supplier Ledger", href: "/dashboard/purchase/supplier-ledger" },
    ],
  },
  {
    label: "Sales", href: "/dashboard/sales",
    items: [
      { label: "Customers", href: "/dashboard/sales/customers" },
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
    label: "Production", href: "/dashboard/production",
    items: [
      { label: "Production Orders", href: "/dashboard/production/orders" },
      { label: "Finished Goods Receive", href: "/dashboard/production/finished-goods-receive" },
      { label: "Wastage", href: "/dashboard/production/wastage" },
    ],
  },
  {
    label: "Payroll", href: "/dashboard/payroll",
    items: [
      { label: "Employees", href: "/dashboard/payroll/employees" },
      { label: "Attendance", href: "/dashboard/payroll/attendance" },
      { label: "Overtime", href: "/dashboard/payroll/overtime" },
      { label: "Salary Sheet", href: "/dashboard/payroll/salary-sheet" },
    ],
  },
  {
    label: "LC & Export", href: "/dashboard/lc-export",
    items: [
      { label: "Proforma Invoice", href: "/dashboard/lc-export/proforma" },
      { label: "LC Register", href: "/dashboard/lc-export/lc-register" },
      { label: "Export Invoice", href: "/dashboard/lc-export/export-invoice" },
      { label: "Packing List", href: "/dashboard/lc-export/packing-list" },
      { label: "EXP Tracking", href: "/dashboard/lc-export/exp-tracking" },
      { label: "Bank Charges", href: "/dashboard/lc-export/bank-charges" },
    ],
  },
  {
    label: "Reports", href: "/dashboard/reports",
    items: [
      { label: "Profit & Loss", href: "/dashboard/accounting/profit-loss" },
      { label: "Balance Sheet", href: "/dashboard/accounting/balance-sheet" },
      { label: "Stock Report", href: "/dashboard/reports/stock-report" },
      { label: "Production Report", href: "/dashboard/reports/production-report" },
      { label: "Cash Flow", href: "/dashboard/reports/cash-flow" },
      { label: "Outstanding Report", href: "/dashboard/reports/outstanding" },
      { label: "Expense Report", href: "/dashboard/reports/expense-report" },
      { label: "Receivable Statement", href: "/dashboard/reports/receivable-statement" },
    ],
  },
];

export default function SidebarMenu() {
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  return (
    <div className="space-y-1 flex-1 overflow-y-auto">
      {menu.map((group) => {
        if (!group.items) {
          return (
            <Link key={group.href} href={group.href} className="block rounded px-3 py-2 hover:bg-gray-800">
              {group.label}
            </Link>
          );
        }
        const isOpen = openGroup === group.label;
        return (
          <div key={group.label}>
            <button
              type="button"
              onClick={() => setOpenGroup(isOpen ? null : group.label)}
              className="w-full flex items-center justify-between rounded px-3 py-2 hover:bg-gray-800 text-left"
            >
              <span>{group.label}</span>
              <span className={`transition-transform text-xs ${isOpen ? "rotate-90" : ""}`}>▶</span>
            </button>
            {isOpen && (
              <div className="ml-3 border-l border-gray-700 pl-2 space-y-1 mb-1">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block rounded px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}