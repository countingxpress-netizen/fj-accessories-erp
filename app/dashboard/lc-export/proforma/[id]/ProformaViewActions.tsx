"use client";
import { useRouter } from "next/navigation";
import GuardedAction from "@/app/dashboard/GuardedAction";

export default function ProformaViewActions({ piId, piNo }: { piId: string; piNo: string }) {
  const router = useRouter();

  return (
    <GuardedAction
      table="proforma_invoices" recordId={piId} recordLabel={piNo} action="edit"
      onAllowed={() => router.push(`/dashboard/lc-export/proforma/${piId}/edit`)}
      className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white"
    >
      Edit
    </GuardedAction>
  );
}
