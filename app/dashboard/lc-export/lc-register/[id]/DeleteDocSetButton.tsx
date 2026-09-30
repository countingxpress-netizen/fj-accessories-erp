"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DeleteDocSetButton({ setId, label }: { setId: string; label: string }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleDelete() {
    if (!window.confirm(`ডকুমেন্ট সেট ${label} মুছে ফেলতে চান?`)) return;
    const { error } = await supabase.from("lc_document_sets").delete().eq("id", setId);
    if (error) { alert("মুছে ফেলা যায়নি: " + error.message); return; }
    router.refresh();
  }

  return (
    <button type="button" onClick={handleDelete} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Delete</button>
  );
}
