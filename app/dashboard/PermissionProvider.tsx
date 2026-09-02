"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

// Staff (role='full_no_edit') এর জন্য Edit/Delete গেট করার সিস্টেম।
// Admin সবসময় allowed। Staff-এর জন্য প্রতিটা (table, record, action) কম্বিনেশনে
// admin-approved permission_requests row না থাকলে GuardedButton "Request" দেখায়।

type ReqInfo = { id: string; status: "pending" | "approved" };
type ReqMap = Record<string, ReqInfo>; // key: `${table}:${recordId}:${action}`

type Ctx = {
  isAdmin: boolean;
  userId: string;
  requests: ReqMap;
  refresh: () => void;
};

const PermissionContext = createContext<Ctx>({ isAdmin: false, userId: "", requests: {}, refresh: () => {} });

export function usePermission(table: string, recordId: string, action: "edit" | "delete") {
  const ctx = useContext(PermissionContext);
  const key = `${table}:${recordId}:${action}`;
  const req = ctx.requests[key];
  return {
    allowed: ctx.isAdmin || req?.status === "approved",
    pending: req?.status === "pending",
    requestId: req?.id,
    isAdmin: ctx.isAdmin,
    userId: ctx.userId,
    refresh: ctx.refresh,
  };
}

export default function PermissionProvider({
  isAdmin, userId, children,
}: { isAdmin: boolean; userId: string; children: React.ReactNode }) {
  const [requests, setRequests] = useState<ReqMap>({});
  const supabase = createClient();

  const load = useCallback(async () => {
    if (isAdmin || !userId) return;
    const { data } = await supabase
      .from("permission_requests")
      .select("id, table_name, record_id, action, status")
      .eq("requested_by", userId)
      .in("status", ["pending", "approved"]);
    const map: ReqMap = {};
    (data ?? []).forEach((r: any) => {
      map[`${r.table_name}:${r.record_id}:${r.action}`] = { id: r.id, status: r.status };
    });
    setRequests(map);
  }, [isAdmin, userId]);

  useEffect(() => { load(); }, [load]);

  return (
    <PermissionContext.Provider value={{ isAdmin, userId, requests, refresh: load }}>
      {children}
    </PermissionContext.Provider>
  );
}
