import type { SupabaseClient } from "@supabase/supabase-js";

// স্টক বাড়ানো/কমানো — সবসময় এখান দিয়ে (migration 20261003090000_atomic_stock_adjust)।
// ডাটাবেস নিজেই quantity = quantity + delta করে (row না থাকলে তৈরি), তাই দুজন একসাথে সেভ করলেও
// কারো পরিবর্তন হারায় না। আগের "পড়ো → হিসাব করো → লেখো" ধরন দিয়ে আর স্টক বদলাবেন না।
// delta: বাড়লে +, কমলে −। ফেরত দেয় নতুন পরিমাণ (ব্যর্থ হলে error)।

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = SupabaseClient | any;

export async function adjustRawStock(
  supabase: Client, materialId: string, warehouseId: string, delta: number,
): Promise<{ ok: boolean; quantity?: number; error?: string }> {
  if (!materialId || !warehouseId || !Number.isFinite(delta) || delta === 0) return { ok: true };
  const { data, error } = await supabase.rpc("adjust_raw_material_stock", {
    p_material_id: materialId, p_warehouse_id: warehouseId, p_delta: delta,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, quantity: Number(data) };
}

export async function adjustFgStock(
  supabase: Client, productId: string, warehouseId: string, delta: number,
): Promise<{ ok: boolean; quantity?: number; error?: string }> {
  if (!productId || !warehouseId || !Number.isFinite(delta) || delta === 0) return { ok: true };
  const { data, error } = await supabase.rpc("adjust_finished_goods_stock", {
    p_product_id: productId, p_warehouse_id: warehouseId, p_delta: delta,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, quantity: Number(data) };
}
