"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { parseNumber } from "@/lib/parse-number";
import { cn } from "cn";

// Number input that saves on blur when the text has changed. The typed number is converted to the
// saved value with toValue (e.g. rounded to what can be stored), and the saved value is shown with
// toNumber, so the input shows what's saved. Empty text saves null.
export function SavedNumberInput({
  value,
  toValue = (typed) => typed,
  toNumber = (value) => value,
  save,
  className,
}: {
  value: number | null;
  toValue?: (typed: number) => number;
  toNumber?: (value: number) => number;
  save: (value: number | null) => Promise<boolean>;
  className?: string;
}) {
  const t = useTranslations("SavedNumberInput");
  const format = useFormatter();

  function formatValue(value: number | null) {
    if (value == null) return "";
    return format.number(toNumber(value), { maximumFractionDigits: 6, useGrouping: false });
  }

  const [text, setText] = useState(() => formatValue(value));
  const [savedText, setSavedText] = useState(text);
  const [error, setError] = useState<"invalid" | "saveFailed">();
  const [pending, startTransition] = useTransition();

  function blur() {
    if (text === savedText) return setError(undefined);
    const parsed = parseNumber(text);
    if (parsed === undefined) return setError("invalid");

    const value = parsed == null ? null : toValue(parsed);
    const formatted = formatValue(value);
    setText(formatted);
    startTransition(async () => {
      const saved = await save(value);
      if (!saved) return setError("saveFailed");
      setError(undefined);
      setSavedText(formatted);
    });
  }

  return (
    <Input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={blur}
      inputMode="decimal"
      aria-invalid={!!error}
      title={error && t(`errors.${error}`)}
      className={cn("h-7 w-20 text-right tabular-nums", pending && "opacity-60", className)}
    />
  );
}
