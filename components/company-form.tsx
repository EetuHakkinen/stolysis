"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  createCompany,
  type CompanyFormErrors,
  type CompanyInput,
} from "@/actions/companies";
import { ButtonLink } from "@/components/button-link";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function CompanyForm() {
  const t = useTranslations("CompanyForm");
  const [values, setValues] = useState<CompanyInput>({ name: "", ticker: "" });
  const [errors, setErrors] = useState<CompanyFormErrors>();
  const [pending, startTransition] = useTransition();

  const set = (field: keyof CompanyInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((prev) => ({ ...prev, [field]: e.target.value }));

  const errorsFor = (field: keyof CompanyInput) =>
    errors?.[field]?.map((key) => ({ message: t(`errors.${key}`) }));

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      // Redirects to /dashboard on success, so only errors come back.
      const result = await createCompany(values);
      setErrors(result.errors);
    });
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <Field data-invalid={!!errors?.name}>
          <FieldLabel htmlFor="name">{t("name")}</FieldLabel>
          <Input
            id="name"
            value={values.name}
            onChange={set("name")}
            aria-invalid={!!errors?.name}
            required
          />
          <FieldError errors={errorsFor("name")} />
        </Field>
        <Field data-invalid={!!errors?.ticker}>
          <FieldLabel htmlFor="ticker">{t("ticker")}</FieldLabel>
          <Input
            id="ticker"
            value={values.ticker}
            onChange={set("ticker")}
            aria-invalid={!!errors?.ticker}
            className="uppercase"
            required
          />
          <FieldError errors={errorsFor("ticker")} />
        </Field>
        <Field orientation="horizontal">
          <Button type="submit" disabled={pending}>
            {pending ? t("saving") : t("save")}
          </Button>
          <ButtonLink href="/dashboard" variant="outline">
            {t("cancel")}
          </ButtonLink>
        </Field>
      </FieldGroup>
    </form>
  );
}
