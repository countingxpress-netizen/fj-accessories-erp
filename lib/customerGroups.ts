import type { SupabaseClient } from "@supabase/supabase-js";

// Customer Group ("পার্টি") — রিপোর্ট রোল-আপ হেল্পার।
//
// গ্রুপে থাকা কাস্টমারগুলো রিপোর্টে আলাদা না দেখিয়ে গ্রুপের নামে এক লাইনে দেখানো হয়।
// গ্রুপ-বিহীন কাস্টমার অপরিবর্তিত থাকে। কোনো লেনদেন গ্রুপে পোস্ট হয় না — শুধু
// কাস্টমার-কী করা সংখ্যাগুলো গ্রুপ-কী তে যোগ (fold) করা হয়।

export type GroupMap = {
  /** customerId -> groupId (শুধু গ্রুপভুক্ত কাস্টমারদের জন্য) */
  groupIdOf: Record<string, string>;
  /** groupId -> গ্রুপের নাম */
  nameOf: Record<string, string>;
  /** groupId -> সদস্য customerId[] */
  membersOf: Record<string, string[]>;
  /** অন্তত একটা গ্রুপ আছে কি না */
  any: boolean;
};

export async function loadGroupMap(supabase: SupabaseClient): Promise<GroupMap> {
  const [{ data: groups }, { data: custs }] = await Promise.all([
    supabase.from("customer_groups").select("id, name"),
    supabase.from("customers").select("id, group_id"),
  ]);

  const nameOf: Record<string, string> = {};
  (groups ?? []).forEach((g: { id: string; name: string }) => { nameOf[g.id] = g.name; });

  const groupIdOf: Record<string, string> = {};
  const membersOf: Record<string, string[]> = {};
  (custs ?? []).forEach((c: { id: string; group_id: string | null }) => {
    if (c.group_id && nameOf[c.group_id]) {
      groupIdOf[c.id] = c.group_id;
      (membersOf[c.group_id] ??= []).push(c.id);
    }
  });

  return { groupIdOf, nameOf, membersOf, any: (groups ?? []).length > 0 };
}

/** একটা কাস্টমার রিপোর্টে যে সারিতে দেখাবে তার পরিচয় — গ্রুপ থাকলে গ্রুপ, নইলে কাস্টমার নিজেই। */
export function displayEntity(
  gm: GroupMap,
  customerId: string,
  customerName?: string | null,
): { key: string; id: string; name: string; isGroup: boolean } {
  const gid = gm.groupIdOf[customerId];
  if (gid) return { key: `g:${gid}`, id: gid, name: gm.nameOf[gid] ?? "-", isGroup: true };
  return { key: `c:${customerId}`, id: customerId, name: customerName ?? "-", isGroup: false };
}

/** রিপোর্ট সারির লেজার লিংক — গ্রুপ হলে গ্রুপ-লেজার, নইলে কাস্টমার-লেজার। */
export function ledgerHref(entity: { id: string; isGroup: boolean }): string {
  return entity.isGroup
    ? `/dashboard/sales/customer-ledger/group/${entity.id}`
    : `/dashboard/sales/customer-ledger/${entity.id}`;
}

/**
 * কাস্টমার-কী করা সংখ্যার ম্যাপকে গ্রুপ-কী তে fold করে।
 * `customers` = সব কাস্টমার (id, name), `perCustomer` = customerId -> সংখ্যা।
 * ফেরত দেয় display সারি (গ্রুপ + গ্রুপ-বিহীন কাস্টমার মিশ্রিত), যোগফল অপরিবর্তিত।
 */
export function foldNumbers(
  gm: GroupMap,
  customers: { id: string; name: string }[],
  perCustomer: Record<string, number>,
): { key: string; id: string; name: string; isGroup: boolean; value: number }[] {
  const out: Record<string, { key: string; id: string; name: string; isGroup: boolean; value: number }> = {};
  customers.forEach((c) => {
    const e = displayEntity(gm, c.id, c.name);
    (out[e.key] ??= { key: e.key, id: e.id, name: e.name, isGroup: e.isGroup, value: 0 }).value += perCustomer[c.id] ?? 0;
  });
  return Object.values(out);
}
