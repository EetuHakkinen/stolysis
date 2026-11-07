import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";

export default function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  return (
    <Suspense>
      <Protected>{children}</Protected>
    </Suspense>
  );
}

// Reads the session at request time, so it must stream in behind Suspense.
// Children stay inside so nothing renders until the user is authenticated.
async function Protected({ children }: { children: React.ReactNode }) {
  await auth.protect();
  return children;
}
