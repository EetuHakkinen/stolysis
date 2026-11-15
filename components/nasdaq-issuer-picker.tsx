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

// Searchable picker of a Nasdaq issuer name; an empty string stands for none. The current value is
// offered even when it's not in the list, e.g. when the list couldn't be fetched.
export function NasdaqIssuerPicker({
  id,
  issuers,
  value,
  onChange,
  invalid,
  className,
}: {
  id: string;
  issuers: string[];
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  className?: string;
}) {
  const t = useTranslations("CompanyForm");
  const items = value && !issuers.includes(value) ? [value, ...issuers] : issuers;

  return (
    <Combobox items={items} value={value || null} onValueChange={(next) => onChange(next ?? "")}>
      <ComboboxInput
        id={id}
        placeholder={t("nasdaqNamePlaceholder")}
        aria-invalid={invalid}
        showClear
        className={className}
      />
      <ComboboxContent>
        <ComboboxEmpty>{t("nasdaqNameEmpty")}</ComboboxEmpty>
        <ComboboxList>
          {(issuer: string) => (
            <ComboboxItem key={issuer} value={issuer}>
              {issuer}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
