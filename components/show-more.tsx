"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useElementHeight } from "@/hooks/use-element-height";

// Content that doesn't fit maxHeight even with some slack is cut to it, fading out at the bottom,
// with a button for showing the rest and hiding it again. Without maxHeight everything is shown.
export function ShowMore({ maxHeight, children }: { maxHeight: number | null; children: React.ReactNode }) {
  const t = useTranslations("ShowMore");
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const contentHeight = useElementHeight(content);
  const [expanded, setExpanded] = useState(false);
  // Content only a little taller than maxHeight is shown in full rather than cut.
  const collapsible = maxHeight != null && contentHeight > maxHeight * 1.25;
  const collapsed = collapsible && !expanded;

  return (
    <div className="flex flex-col gap-1">
      <div className="relative overflow-hidden" style={collapsed ? { maxHeight } : undefined}>
        <div ref={setContent}>{children}</div>
        {collapsed && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-background" />
        )}
      </div>
      {collapsible && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
          {t(expanded ? "less" : "more")}
        </Button>
      )}
    </div>
  );
}
