import { Skeleton } from "@/components/ui/skeleton";

// Generic loading placeholder for a page: title row and a few content rows.
// Text-free on purpose, so it needs no request data and stays in the static shell.
export function PageSkeleton() {
  return (
    <div aria-busy className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-32" />
      </div>
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
