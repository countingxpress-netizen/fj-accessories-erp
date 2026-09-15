// finished_goods.product_name-এর ডিফল্ট ফলব্যাক তৈরি হয় "{style} (LxW)" প্যাটার্নে
// (lib/bookingGroupWrite.ts) — Product Details ফাঁকা রাখলে। কিন্তু প্রিন্ট/এক্সেলে
// "Product" কলামে মেজারমেন্ট আলাদা কলামেই থাকে, তাই এখানে সাইজ অংশটা বাদ দেওয়া হয়।
export function cleanProductLabel(name: string | null | undefined): string {
  if (!name) return "-";
  return name.replace(/\s*\([\d.]+\s*x\s*[\d.]+\)\s*$/i, "").trim() || "-";
}
