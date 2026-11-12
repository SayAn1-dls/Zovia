import { LoadingState } from "@/components/feedback/loading-state";

export default function Loading() {
  return <LoadingState variant="form" count={8} label="Loading your profile" />;
}
