import { LoadingState } from "@/components/feedback/loading-state";
import { Container } from "@/components/layout/section";

/** Default route-level loading UI: a page-shaped skeleton. */
export default function Loading() {
  return (
    <Container className="py-10 sm:py-16">
      <LoadingState variant="page" label="Loading page" />
    </Container>
  );
}
