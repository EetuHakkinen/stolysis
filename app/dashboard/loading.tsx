import { PageSkeleton } from "@/components/page-skeleton";

// Suspense fallback for every page under /dashboard, so client navigations
// between them don't block on request data (session, locale, db reads).
export default function Loading() {
  return <PageSkeleton />;
}
