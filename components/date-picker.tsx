"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { useFormatter, useLocale } from "next-intl";
import { enGB, fi } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fromLocalDate, toLocalDate } from "@/lib/note-date";

// Button showing a date that opens a calendar for picking another. Dates are "YYYY-MM-DD".
export function DatePicker({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const format = useFormatter();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const selected = toLocalDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" className="w-full justify-start font-normal" aria-label={label} />}
        disabled={disabled}
      >
        <CalendarIcon />
        {format.dateTime(selected, { dateStyle: "medium" })}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          required
          selected={selected}
          defaultMonth={selected}
          locale={locale === "fi" ? fi : enGB}
          onSelect={(date) => {
            onChange(fromLocalDate(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
