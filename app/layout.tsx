import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { Geist, Geist_Mono } from "next/font/google";
import { HtmlLangScript } from "@/components/html-lang-script";
import { ThemeScript } from "@/components/theme-script";
import { defaultLocale } from "@/i18n/config";
import { defaultTheme } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stolysis",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={defaultLocale}
      // HtmlLangScript and ThemeScript correct lang and theme before hydration
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${defaultTheme} h-full antialiased`}
      style={{ colorScheme: defaultTheme }}
    >
      <head>
        <HtmlLangScript />
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">
        <ClerkProvider appearance={{ theme: shadcn }}>{children}</ClerkProvider>
      </body>
    </html>
  );
}
