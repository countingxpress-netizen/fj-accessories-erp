import { cleanProductLabel } from "./cleanProductLabel";

export type ChallanItemLike = {
  id: string;
  print_label?: string | null;
  finished_goods?: { product_name?: string | null } | null;
};

export type GroupedChallanItem<T> = { item: T; label: string; groupStart: boolean; groupSize: number };

// একই Product (স্টাইল, সাইজ বাদে) পরপর একাধিক লাইনে থাকলে (যেমন আলাদা measurement/batch
// অনুযায়ী আলাদা বুকিং কিন্তু একই স্টাইল) — Product কলাম merge & center করে দেখানোর জন্য
// গ্রুপিং করা হয়। শুধু *পরপর* (consecutive) রো-ই মার্জ হয়, প্রিন্ট/এক্সেল দুটোতেই একই লজিক।
export function groupChallanItemsByProduct<T extends ChallanItemLike>(items: T[]): GroupedChallanItem<T>[] {
  const withLabel = items.map((item) => ({
    item,
    label: item.print_label || cleanProductLabel(item.finished_goods?.product_name),
  }));

  const result: GroupedChallanItem<T>[] = [];
  let i = 0;
  while (i < withLabel.length) {
    let j = i;
    while (j + 1 < withLabel.length && withLabel[j + 1].label === withLabel[i].label) j++;
    const groupSize = j - i + 1;
    for (let k = i; k <= j; k++) {
      result.push({ item: withLabel[k].item, label: withLabel[i].label, groupStart: k === i, groupSize });
    }
    i = j + 1;
  }
  return result;
}
