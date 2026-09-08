"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";

type PendingChallan = {
  id: string;
  challan_no: string;
  challan_date: string;
  totalQty: number;
  customers: { name: string } | null;
};

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export default function ChallanReceivedForm({ pending }: { pending: PendingChallan[] }) {
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [files, setFiles] = useState<Record<string, { url: string; name: string }>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const router = useRouter();
  const supabase = createClient();

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const allChecked = pending.length > 0 && selectedIds.length === pending.length;

  function toggle(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }
  function toggleAll() {
    if (allChecked) setSelected({});
    else setSelected(Object.fromEntries(pending.map((c) => [c.id, true])));
  }

  async function handleFile(challanId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (!ALLOWED.includes(file.type)) {
      setError("শুধু ছবি (JPG/PNG/WEBP) বা PDF আপলোড করা যাবে।");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("ফাইল ৮ MB-এর বেশি হতে পারবে না।");
      return;
    }
    setUploading((p) => ({ ...p, [challanId]: true }));
    const ext = file.name.split(".").pop();
    const path = `${challanId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("challan-receipts").upload(path, file, { contentType: file.type });
    setUploading((p) => ({ ...p, [challanId]: false }));
    if (upErr) {
      setError(`আপলোড ব্যর্থ: ${upErr.message}`);
      return;
    }
    const { data } = supabase.storage.from("challan-receipts").getPublicUrl(path);
    setFiles((p) => ({ ...p, [challanId]: { url: data.publicUrl, name: file.name } }));
    // ফাইল দিলে ধরে নিই এটাও রিসিভ হবে
    setSelected((p) => ({ ...p, [challanId]: true }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (selectedIds.length === 0) {
      setError("অন্তত একটা চালান সিলেক্ট করুন।");
      return;
    }
    setLoading(true);
    const errors: string[] = [];
    for (const id of selectedIds) {
      const patch: Record<string, any> = {
        delivery_status: "challan_received",
        received_date: receivedDate,
        received_note: note.trim() || null,
      };
      if (files[id]?.url) patch.received_file_url = files[id].url;
      const { error: updErr } = await supabase.from("delivery_challans").update(patch).eq("id", id);
      if (updErr) errors.push(`${id}: ${updErr.message}`);
    }
    setLoading(false);
    if (errors.length) {
      setError(errors.join("\n"));
      return;
    }
    setSelected({});
    setFiles({});
    setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Received Date</label>
          <input
            type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm" required
          />
        </div>
        <div className="flex-1 min-w-[240px]">
          <label className="block text-sm text-gray-600 mb-1">Note (ঐচ্ছিক)</label>
          <input
            type="text" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="সিলেক্ট করা সব চালানে বসবে"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2 w-10">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="সব সিলেক্ট" />
              </th>
              <th className="px-3 py-2">Challan No</th>
              <th className="px-3 py-2">Challan Date</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2">রিসিট স্ক্যান/ছবি (ঐচ্ছিক)</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2">
                  <input
                    type="checkbox" checked={!!selected[c.id]} onChange={() => toggle(c.id)}
                    aria-label={`Select challan ${c.challan_no}`}
                  />
                </td>
                <td className="px-3 py-2 font-medium">{c.challan_no}</td>
                <td className="px-3 py-2 text-gray-500">{formatDate(c.challan_date)}</td>
                <td className="px-3 py-2">{c.customers?.name ?? "-"}</td>
                <td className="px-3 py-2 text-right">{c.totalQty}</td>
                <td className="px-3 py-2">
                  <input
                    ref={(el) => { fileInputs.current[c.id] = el; }}
                    type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden" onChange={(e) => handleFile(c.id, e)}
                  />
                  {files[c.id] ? (
                    <span className="inline-flex items-center gap-2">
                      <a href={files[c.id].url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline text-xs max-w-[160px] truncate">
                        {files[c.id].name}
                      </a>
                      <button type="button" onClick={() => setFiles((p) => { const n = { ...p }; delete n[c.id]; return n; })}
                        className="text-xs text-red-600 hover:underline">সরান</button>
                    </span>
                  ) : (
                    <button
                      type="button" disabled={uploading[c.id]}
                      onClick={() => fileInputs.current[c.id]?.click()}
                      className="rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {uploading[c.id] ? "আপলোড হচ্ছে..." : "📎 আপলোড"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400 italic">Print করা কোনো চালান বাকি নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-red-600 whitespace-pre-line">{error}</p>}

      <button
        type="submit" disabled={loading || selectedIds.length === 0}
        className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40"
      >
        {loading ? "সেভ হচ্ছে..." : `Received (${selectedIds.length})`}
      </button>
    </form>
  );
}
