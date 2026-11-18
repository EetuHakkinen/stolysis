"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addInvestorCall, type InvestorCallErrors, type InvestorCallInput } from "@/actions/news";
import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fromLocalDate } from "@/lib/note-date";

// Form in the add news dialog for saving an investor call transcript as a company's news.
export function InvestorCallForm({
  companies,
  companyId = null,
  onSaved,
}: {
  companies: { id: number; name: string }[];
  companyId?: number | null;
  onSaved: () => void;
}) {
  const t = useTranslations("AddNews.investorCall");
  const tAddNews = useTranslations("AddNews");
  const [values, setValues] = useState<InvestorCallInput>(() => ({
    companyId,
    title: "",
    transcript: "",
    date: fromLocalDate(new Date()),
  }));
  const [errors, setErrors] = useState<InvestorCallErrors>();
  const [pending, startTransition] = useTransition();
  const companyItems = companies.map((company) => ({ value: company.id, label: company.name }));

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await addInvestorCall(values);
      if (result.errors) return setErrors(result.errors);
      onSaved();
    });
  }

  function message(error: InvestorCallErrors[keyof InvestorCallErrors]) {
    return error ? [{ message: t(`errors.${error}`) }] : undefined;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogDescription>{t("description")}</DialogDescription>
      <FieldGroup>
        <Field data-invalid={!!errors?.companyId}>
          <FieldLabel htmlFor="investor-call-company">{t("company")}</FieldLabel>
          <Select
            items={companyItems}
            value={values.companyId}
            onValueChange={(companyId) => {
              if (companyId != null) setValues({ ...values, companyId });
            }}
            disabled={pending}
          >
            <SelectTrigger id="investor-call-company" className="w-full" aria-invalid={!!errors?.companyId}>
              <SelectValue placeholder={t("chooseCompany")} />
            </SelectTrigger>
            <SelectContent>
              {companyItems.map((company) => (
                <SelectItem key={company.value} value={company.value}>
                  {company.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={message(errors?.companyId)} />
        </Field>
        <Field data-invalid={!!errors?.date}>
          <FieldLabel>{t("date")}</FieldLabel>
          <DatePicker
            value={values.date}
            onChange={(date) => setValues({ ...values, date })}
            label={t("date")}
            disabled={pending}
          />
          <FieldError errors={message(errors?.date)} />
        </Field>
        <Field data-invalid={!!errors?.title}>
          <FieldLabel htmlFor="investor-call-title">{t("newsTitle")}</FieldLabel>
          <Input
            id="investor-call-title"
            value={values.title}
            onChange={(e) => setValues({ ...values, title: e.target.value })}
            aria-invalid={!!errors?.title}
            disabled={pending}
          />
          <FieldError errors={message(errors?.title)} />
        </Field>
        <Field data-invalid={!!errors?.transcript}>
          <FieldLabel htmlFor="investor-call-transcript">{t("transcript")}</FieldLabel>
          <Textarea
            id="investor-call-transcript"
            value={values.transcript}
            onChange={(e) => setValues({ ...values, transcript: e.target.value })}
            rows={10}
            aria-invalid={!!errors?.transcript}
            disabled={pending}
            className="max-h-80"
          />
          <FieldError errors={message(errors?.transcript)} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{tAddNews("cancel")}</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? tAddNews("saving") : tAddNews("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
