"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@/components/markdown";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

// Text written in markdown, with tabs for writing it and previewing it rendered. `status` is shown
// beside the tabs, e.g. whether the text is saved. Starts in the write tab.
export function MarkdownEditor({
  value,
  onChange,
  label,
  placeholder,
  status,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  status?: React.ReactNode;
}) {
  const t = useTranslations("MarkdownEditor");
  const [mode, setMode] = useState<"write" | "preview">("write");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={mode} onValueChange={(value) => setMode(value)}>
          <TabsList>
            <TabsTrigger value="write" className="px-3">
              {t("write")}
            </TabsTrigger>
            <TabsTrigger value="preview" className="px-3">
              {t("preview")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {status}
      </div>
      {mode === "write" ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          autoFocus
          className="min-h-64 font-mono"
        />
      ) : value.trim() === "" ? (
        <p className="min-h-64 text-muted-foreground">{t("nothingToPreview")}</p>
      ) : (
        <div className="min-h-64">
          <Markdown>{value}</Markdown>
        </div>
      )}
    </>
  );
}
