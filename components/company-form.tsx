"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { CompanyFormErrors, CompanyInput } from "@/actions/companies";
import { ButtonLink } from "@/components/button-link";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Width of the inputs in an inline form, which sit at the right edge of the form.
const INLINE_INPUT = "w-64";

// Form for a company's name and ticker, for both creating and editing a company. Submit returns
// the validation errors; a successful submit that doesn't navigate away shows a saved note until
// the values change. An inline form has each label on the same row as its input, with the inputs
// and buttons aligned to the right.
export function CompanyForm({
  initialValues = { name: "", ticker: "" },
  submit,
  cancelHref,
  inline = false,
}: {
  initialValues?: CompanyInput;
  submit: (values: CompanyInput) => Promise<{ errors?: CompanyFormErrors }>;
  cancelHref?: string;
  inline?: boolean;
}) {
  const t = useTranslations("CompanyForm");
  const [values, setValues] = useState<CompanyInput>(initialValues);
  const [errors, setErrors] = useState<CompanyFormErrors>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = (field: keyof CompanyInput) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((prev) => ({ ...prev, [field]: e.target.value }));
    setSaved(false);
  };

  const errorsFor = (field: keyof CompanyInput) =>
    errors?.[field]?.map((key) => ({ message: t(`errors.${key}`) }));

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await submit(values);
      setErrors(result.errors);
      setSaved(!result.errors);
    });
  }

  function field(name: keyof CompanyInput, inputProps?: React.ComponentProps<typeof Input>) {
    const invalid = !!errors?.[name];
    const input = (
      <Input
        id={name}
        value={values[name]}
        onChange={set(name)}
        aria-invalid={invalid}
        required
        {...inputProps}
      />
    );
    const error = <FieldError errors={errorsFor(name)} />;

    return inline ? (
      <Field orientation="horizontal" data-invalid={invalid}>
        {/* Label rows are as high as the input, so the label stays centered on it above an error. */}
        <FieldLabel htmlFor={name} className="h-8 items-center">
          {t(name)}
        </FieldLabel>
        <FieldContent className={cn("flex-none", INLINE_INPUT)}>
          {input}
          {error}
        </FieldContent>
      </Field>
    ) : (
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor={name}>{t(name)}</FieldLabel>
        {input}
        {error}
      </Field>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <FieldGroup className={cn(inline && "gap-4")}>
        {field("name")}
        {field("ticker", { className: "uppercase" })}
        <Field orientation="horizontal" className={cn(inline && "justify-end")}>
          <Button type="submit" disabled={pending}>
            {pending ? t("saving") : t("save")}
          </Button>
          {cancelHref && (
            <ButtonLink href={cancelHref} variant="outline">
              {t("cancel")}
            </ButtonLink>
          )}
          {saved && !pending && (
            // Before the buttons when they are aligned to the right.
            <span className={cn("text-sm text-muted-foreground", inline && "order-first")}>
              {t("saved")}
            </span>
          )}
        </Field>
      </FieldGroup>
    </form>
  );
}
