"use client";

import { useTranslations } from "next-intl";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import type { ShareOption } from "@/lib/nasdaq-news";

const label = (share: ShareOption) => `${share.name} (${share.ticker})`;

// Searchable picker of a share on Nasdaq Helsinki, searched by the company's name or ticker.
export function NasdaqSharePicker({
  id,
  shares,
  value,
  onChange,
  className,
}: {
  id: string;
  shares: ShareOption[];
  value: ShareOption | null;
  onChange: (share: ShareOption | null) => void;
  className?: string;
}) {
  const t = useTranslations("CompanyForm");

  return (
    <Combobox
      items={shares}
      value={value}
      onValueChange={onChange}
      itemToStringLabel={label}
      isItemEqualToValue={(item: ShareOption, selected: ShareOption) => item.ticker === selected.ticker}
    >
      <ComboboxInput id={id} placeholder={t("sharePlaceholder")} showClear className={className} />
      <ComboboxContent>
        <ComboboxEmpty>{t("shareEmpty")}</ComboboxEmpty>
        <ComboboxList>
          {(share: ShareOption) => (
            <ComboboxItem key={share.ticker} value={share}>
              {label(share)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
