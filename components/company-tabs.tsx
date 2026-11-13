"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type CompanyTab = "news" | "notes";

// A company's news and notes in tabs. The open tab is kept in the URL, so it survives a reload and
// pagination; changing it only replaces the history entry.
export function CompanyTabs({
  initialTab,
  news,
  notes,
}: {
  initialTab: CompanyTab;
  news: React.ReactNode;
  notes: React.ReactNode;
}) {
  const t = useTranslations("CompanyTabs");
  const [tab, setTab] = useState(initialTab);

  function select(value: CompanyTab) {
    setTab(value);
    const url = new URL(window.location.href);
    if (value === "news") url.searchParams.delete("tab");
    else url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url);
  }

  const tabs: { value: CompanyTab; content: React.ReactNode }[] = [
    { value: "news", content: news },
    { value: "notes", content: notes },
  ];

  return (
    <Tabs value={tab} onValueChange={select}>
      <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden group-data-horizontal/tabs:h-10">
        {tabs.map((item) => (
          <TabsTrigger key={item.value} value={item.value} className="px-3 text-base">
            {t(item.value)}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((item) => (
        <TabsContent key={item.value} value={item.value} className="flex flex-col gap-4">
          {item.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
