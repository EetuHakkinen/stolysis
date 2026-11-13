"use client";

import { useFormatter } from "next-intl";
import { cn } from "@/lib/utils";

// A fraction as a signed percent with one decimal (0.25 = +25,0 %), green when positive and red
// when negative; "–" when unknown.
export function SignedPercent({ value, className }: { value: number | null; className?: string }) {
  const format = useFormatter();
  return (
    <span
      className={cn(
        "tabular-nums",
        value != null && value > 0 && "text-emerald-600 dark:text-emerald-500",
        value != null && value < 0 && "text-destructive",
        className,
      )}
    >
      {value == null
        ? "–"
        : format.number(value, {
            style: "percent",
            signDisplay: "exceptZero",
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}
    </span>
  );
}
