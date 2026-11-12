"use client";

import { useTranslations } from "next-intl";
import type { EstimateYear } from "@/lib/estimates";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Select for the financial year whose estimates the valuation uses.
export function ValuationTargetPicker({
  years,
  selectedId,
  onSelect,
}: {
  years: EstimateYear[];
  selectedId: number | null;
  onSelect: (yearId: number) => void;
}) {
  const t = useTranslations("Valuation");
  const items = years.map((year) => ({ value: year.id, label: year.name ?? "" }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">{t("targetYear")}</span>
      <Select
        items={items}
        value={selectedId}
        onValueChange={(value) => {
          if (value != null) onSelect(value);
        }}
      >
        <SelectTrigger className="min-w-32" aria-label={t("targetYear")}>
          <SelectValue placeholder={t("chooseTargetYear")} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
