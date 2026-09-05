"use client";
import { useRouter } from "next/navigation";
import GuardedAction from "@/app/dashboard/GuardedAction";

export default function BookingViewActions({ bookingId, bookingNo }: { bookingId: string; bookingNo: string }) {
  const router = useRouter();

  return (
    <GuardedAction
      table="bookings" recordId={bookingId} recordLabel={bookingNo} action="edit"
      onAllowed={() => router.push(`/dashboard/sales/bookings/${bookingId}/edit`)}
      className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white"
    >
      Edit
    </GuardedAction>
  );
}
