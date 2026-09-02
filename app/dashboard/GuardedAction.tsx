"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePermission } from "./PermissionProvider";

// Edit/Delete বাটনের জায়গায় বসে — Admin বা approved-permission থাকলে আসল বাটন,
// নাহলে "Request" বাটন যেটা admin-কে অনুমতির অনুরোধ পাঠায়।
export default function GuardedAction({
  table, recordId, recordLabel, action, onAllowed, className, children, disabled,
}: {
  table: string;
  recordId: string;
  recordLabel: string;
  action: "edit" | "delete";
  onAllowed: () => void;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { allowed, pending, isAdmin, requestId, userId, refresh } = usePermission(table, recordId, action);
  const [requesting, setRequesting] = useState(false);
  const supabase = createClient();

  if (allowed) {
    return (
      <button
        onClick={async () => {
          onAllowed();
          if (!isAdmin && requestId) {
            await supabase.from("permission_requests").update({ status: "fulfilled" }).eq("id", requestId);
            refresh();
          }
        }}
        disabled={disabled}
        className={className}
      >
        {children}
      </button>
    );
  }

  if (pending) {
    return <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-400 italic">অনুরোধ পাঠানো হয়েছে</span>;
  }

  async function handleRequest() {
    setRequesting(true);
    await supabase.from("permission_requests").insert({
      table_name: table, record_id: recordId, record_label: recordLabel, action, requested_by: userId,
    });
    setRequesting(false);
    refresh();
  }

  return (
    <button
      onClick={handleRequest}
      disabled={requesting}
      className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 disabled:opacity-50"
    >
      🔒 {requesting ? "..." : `Request ${action === "edit" ? "Edit" : "Delete"}`}
    </button>
  );
}
