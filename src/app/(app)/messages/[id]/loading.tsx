import { LoadingState } from "@/components/feedback/loading-state";

export default function Loading() {
  return <LoadingState variant="list" count={5} label="Loading conversation" />;
}
