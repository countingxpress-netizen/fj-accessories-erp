"use client";
import { useState } from "react";

/**
 * Floating bar shown when 1+ rows are selected on a list page.
 * Confirmation (with the exact count) happens here before `onDeleteSelected`
 * runs, so callers only need to implement the actual delete loop.
 */
export function BulkActionBar({
  count,
  itemLabel = "আইটেম",
  onDeleteSelected,
  onClear,
}: {
  count: number;
  itemLabel?: string;
  onDeleteSelected: () => Promise<void> | void;
  onClear: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  if (count === 0) return null;

  async function handleDelete() {
    if (!window.confirm(`${count}টি ${itemLabel} মুছে ফেলতে চান? এই কাজটি ফেরানো যাবে না।`)) return;
    setDeleting(true);
    try {
      await onDeleteSelected();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="sticky top-2 z-30 mb-3 flex items-center justify-between rounded-xl border border-gray-900 bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg">
      <span>{count}টি {itemLabel} সিলেক্ট করা হয়েছে</span>
      <div className="flex items-center gap-2">
        <button
          onClick={onClear}
          disabled={deleting}
          className="rounded-lg px-3 py-1.5 text-xs text-gray-200 hover:bg-white/10 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium hover:bg-red-700 disabled:opacity-50"
        >
          {deleting ? "মুছে ফেলা হচ্ছে..." : "Delete Selected"}
        </button>
      </div>
    </div>
  );
}
