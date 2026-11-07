import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { NextIntlClientProvider } from "next-intl";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

export default function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  return (
    <Suspense>
      <Protected>
        <NextIntlClientProvider>
          <header className="flex justify-end gap-2 p-4">
            <ThemeToggle />
            <LocaleSwitcher />
          </header>
          {children}
        </NextIntlClientProvider>
      </Protected>
    </Suspense>
  );
}

// Reads the session at request time, so it must stream in behind Suspense.
// Children stay inside so nothing renders until the user is authenticated.
async function Protected({ children }: { children: React.ReactNode }) {
  await auth.protect();
  return children;
}
