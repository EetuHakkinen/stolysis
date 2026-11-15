"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { CompanyFormErrors, CompanyInput } from "@/actions/companies";
import { ButtonLink } from "@/components/button-link";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NasdaqIssuerPicker } from "@/components/nasdaq-issuer-picker";
import { NasdaqSharePicker } from "@/components/nasdaq-share-picker";
import type { ShareOption } from "@/lib/nasdaq-news";
import { defaultPriceSymbol } from "@/lib/stock-price";
import { cn } from "@/lib/utils";

// Width of the inputs in an inline form, which sit at the right edge of the form.
const INLINE_INPUT = "w-64";

// Form for a company's name and ticker (and price symbol, with `withPriceSymbol`), for both
// creating and editing a company. With `shares`, the form starts with a picker of a share on Nasdaq
// Helsinki that fills in the name, ticker and Nasdaq issuer. With `nasdaqIssuers`, the form has a
// picker of the company's Nasdaq issuer. Submit returns
// the validation errors; a successful submit that doesn't navigate away shows a saved note until
// the values change. An inline form has each label on the same row as its input, with the inputs
// and buttons aligned to the right. Children are extra fields shown before the buttons, with their
// values kept by the parent. A form with its own submit label moves on to something else, so it
// doesn't show the saved note.
export function CompanyForm({
  initialValues = { name: "", ticker: "" },
  submit,
  cancelHref,
  inline = false,
  withPriceSymbol = false,
  shares,
  nasdaqIssuers,
  submitLabel,
  pendingLabel,
  children,
}: {
  initialValues?: CompanyInput;
  submit: (values: CompanyInput) => Promise<{ errors?: CompanyFormErrors }>;
  cancelHref?: string;
  inline?: boolean;
  withPriceSymbol?: boolean;
  shares?: ShareOption[];
  nasdaqIssuers?: string[];
  submitLabel?: string;
  pendingLabel?: string;
  children?: React.ReactNode;
}) {
  const t = useTranslations("CompanyForm");
  const [values, setValues] = useState<CompanyInput>(initialValues);
  const [share, setShare] = useState<ShareOption | null>(null);
  const [errors, setErrors] = useState<CompanyFormErrors>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const setValue = (field: keyof CompanyInput, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };
  const set = (field: keyof CompanyInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValue(field, e.target.value);

  // The values stay when the share is cleared, so that they can be edited from there.
  function pickShare(next: ShareOption | null) {
    setShare(next);
    if (!next) return;
    setValues((prev) => ({ ...prev, name: next.name, ticker: next.ticker, nasdaqName: next.nasdaqName ?? "" }));
    setErrors(undefined);
    setSaved(false);
  }

  // The default price symbol follows the ticker being typed.
  const defaultTicker = values.ticker.trim().toUpperCase();

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

  function field(
    name: keyof CompanyInput,
    inputProps?: React.ComponentProps<typeof Input>,
    description?: string,
    control?: React.ReactNode,
  ) {
    const invalid = !!errors?.[name];
    const input = control ?? (
      <Input
        id={name}
        value={values[name] ?? ""}
        onChange={set(name)}
        aria-invalid={invalid}
        required
        {...inputProps}
      />
    );
    const error = <FieldError errors={errorsFor(name)} />;
    const help = description && <FieldDescription>{description}</FieldDescription>;

    return inline ? (
      <Field orientation="horizontal" data-invalid={invalid}>
        {/* Label rows are as high as the input, so the label stays centered on it above an error. */}
        <FieldLabel htmlFor={name} className="h-8 items-center">
          {t(name)}
        </FieldLabel>
        <FieldContent className={cn("flex-none", INLINE_INPUT)}>
          {input}
          {help}
          {error}
        </FieldContent>
      </Field>
    ) : (
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor={name}>{t(name)}</FieldLabel>
        {input}
        {help}
        {error}
      </Field>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <FieldGroup className={cn(inline && "gap-4")}>
        {shares && (
          <Field>
            <FieldLabel htmlFor="share">{t("share")}</FieldLabel>
            <NasdaqSharePicker id="share" shares={shares} value={share} onChange={pickShare} className="w-full" />
            <FieldDescription>{t("shareDescription")}</FieldDescription>
          </Field>
        )}
        {field("name")}
        {field("ticker", { className: "uppercase" })}
        {withPriceSymbol &&
          field(
            "priceSymbol",
            { className: "uppercase", required: false, placeholder: defaultPriceSymbol(defaultTicker) },
            t("priceSymbolDescription", { symbol: defaultPriceSymbol(defaultTicker) }),
          )}
        {nasdaqIssuers &&
          field(
            "nasdaqName",
            undefined,
            t("nasdaqNameDescription"),
            <NasdaqIssuerPicker
              id="nasdaqName"
              issuers={nasdaqIssuers}
              value={values.nasdaqName ?? ""}
              onChange={(value) => setValue("nasdaqName", value)}
              invalid={!!errors?.nasdaqName}
              className="w-full"
            />,
          )}
        {children}
        <Field orientation="horizontal" className={cn(inline && "justify-end")}>
          <Button type="submit" disabled={pending}>
            {pending ? (pendingLabel ?? t("saving")) : (submitLabel ?? t("save"))}
          </Button>
          {cancelHref && (
            <ButtonLink href={cancelHref} variant="outline">
              {t("cancel")}
            </ButtonLink>
          )}
          {saved && !pending && !submitLabel && (
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
