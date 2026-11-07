import { PageSkeleton } from "@/components/page-skeleton";

// Dynamic segment: navigating between two of its pages re-renders below the
// /dashboard loading boundary, so it needs a Suspense fallback of its own.
export default function Loading() {
  return <PageSkeleton />;
}
