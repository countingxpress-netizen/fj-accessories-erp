"use client";

export default function PrintButton() {
  return (
    <div className="print:hidden mb-4 flex justify-end gap-2">
      <button
        onClick={() => window.print()}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white"
      >
        🖨 Print
      </button>
    </div>
  );
}