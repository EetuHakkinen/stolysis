"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Select of a fixed list of options, each with a value and a label.
export function OptionSelect<T extends string | number>({
  id,
  options,
  value,
  onChange,
  disabled,
  invalid,
}: {
  id?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(value) => {
        if (value != null) onChange(value);
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
