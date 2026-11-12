import { StatusBadge, type StatusTone } from "@/components/status-badge";

import { BOOKING_STATUS_LABELS, type BookingStatus } from "../schemas";

const TONES: Record<BookingStatus, StatusTone> = {
  requested: "warning",
  accepted: "brand",
  confirmed: "success",
  declined: "danger",
  expired: "neutral",
  cancelled: "neutral",
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <StatusBadge status={status} label={BOOKING_STATUS_LABELS[status]} tone={TONES[status]} />;
}
