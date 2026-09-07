import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AddCustomerGroupForm from "./AddCustomerGroupForm";
import GroupCard from "./GroupCard";

export default async function CustomerGroupsPage() {
  const supabase = await createClient();
  const { data: groups } = await supabase
    .from("customer_groups")
    .select("id, name, note")
    .order("name");
  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, code, group_id")
    .order("name");

  const allCustomers = customers ?? [];
  const ungrouped = allCustomers.filter((c) => !c.group_id);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Customer Groups (পার্টি)</h1>
        <Link href="/dashboard/sales" className="text-sm text-gray-500 hover:underline">← Sales-এ ফিরুন</Link>
      </div>

      <p className="text-sm text-gray-500 mb-4 max-w-3xl">
        কয়েকটা আলাদা কাস্টমারকে এক গ্রুপে রাখুন (যেমন সব নগদ পার্টি → &ldquo;নতুন পার্টি&rdquo;)।
        Invoice / Booking / Payment আগের মতোই আলাদা কাস্টমারেই হবে — শুধু{" "}
        <b>রিপোর্টে</b> (Customer Ledger তালিকা, Outstanding, Receivable Statement, Commission,
        Dashboard) গ্রুপে থাকা কাস্টমারগুলো আলাদা না দেখিয়ে <b>গ্রুপের নামে</b> এক লাইনে দেখাবে।
      </p>

      <AddCustomerGroupForm />

      <div className="space-y-4">
        {(groups ?? []).map((g) => (
          <GroupCard
            key={g.id}
            group={g}
            members={allCustomers.filter((c) => c.group_id === g.id)}
            assignable={allCustomers}
          />
        ))}
        {(groups ?? []).length === 0 && (
          <p className="text-gray-400 italic text-sm">এখনো কোনো গ্রুপ নেই — উপরে থেকে যোগ করুন।</p>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">
          গ্রুপ-বিহীন কাস্টমার ({ungrouped.length})
        </h2>
        <div className="rounded-xl border bg-white p-3 shadow-sm text-sm text-gray-600">
          {ungrouped.length === 0
            ? <span className="text-gray-400 italic">সব কাস্টমার কোনো না কোনো গ্রুপে আছে।</span>
            : ungrouped.map((c) => c.name).join(" · ")}
        </div>
      </div>
    </div>
  );
}
