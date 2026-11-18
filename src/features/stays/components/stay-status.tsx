import { StatusBadge, type StatusTone } from "@/components/status-badge";

import { STAY_STATUS_LABELS, type StayBookingStatus } from "../schemas";

const TONES: Record<StayBookingStatus, StatusTone> = {
  pending_payment: "warning",
  confirmed: "success",
  cancelled: "neutral",
  expired: "neutral",
  completed: "info",
};

export function StayStatusBadge({ status }: { status: StayBookingStatus }) {
  return <StatusBadge status={status} label={STAY_STATUS_LABELS[status]} tone={TONES[status]} />;
}
