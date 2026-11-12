import { PageSkeleton } from "@/components/page-skeleton";

// Navigating here from the company page re-renders below the [ticker] segment, whose loading
// boundary is already shown, so this page needs a Suspense fallback of its own.
export default function Loading() {
  return <PageSkeleton />;
}
