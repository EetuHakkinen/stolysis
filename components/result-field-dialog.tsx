"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ResultFieldErrors, ResultFieldInput } from "@/actions/result-fields";
import { EstimateType, ResultFieldType, YearlyValue } from "@/app/generated/prisma/enums";
import { OptionSelect } from "@/components/option-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// Special type option for an ordinary field.
const NO_TYPE = "none" as const;
const TYPE_OPTIONS = [NO_TYPE, ...Object.values(ResultFieldType)];

// Dialog for a result field's name, group, yearly value, estimate type and special type, for both
// creating and editing a field. The dialog closes once save succeeds; otherwise its errors are
// shown under the fields.
export function ResultFieldDialog({
  trigger,
  title,
  groups,
  initialValues,
  save,
}: {
  trigger: React.ReactElement;
  title: string;
  groups: { id: number; name: string }[];
  initialValues: ResultFieldInput;
  save: (values: ResultFieldInput) => Promise<ResultFieldErrors | undefined>;
}) {
  const t = useTranslations("ResultFields");
  const tDialogs = useTranslations("Dialogs");
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<ResultFieldErrors>();
  const [pending, startTransition] = useTransition();

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setValues(initialValues);
      setErrors(undefined);
    }
  }

  function set<K extends keyof ResultFieldInput>(key: K, value: ResultFieldInput[K]) {
    setValues((values) => ({ ...values, [key]: value }));
  }

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (values.name.trim() === "") return setErrors({ name: "required" });

    startTransition(async () => {
      const errors = await save(values);
      if (errors) setErrors(errors);
      else setOpen(false);
    });
  }

  const errorFor = (key: keyof ResultFieldErrors) => {
    const error = errors?.[key];
    return error ? [{ message: t(`errors.${error}`) }] : undefined;
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={!!errors?.name}>
              <FieldLabel htmlFor="result-field-name">{t("name")}</FieldLabel>
              <Input
                id="result-field-name"
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                aria-invalid={!!errors?.name}
                disabled={pending}
                autoFocus
              />
              <FieldError errors={errorFor("name")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="result-field-group">{t("group")}</FieldLabel>
              <OptionSelect
                id="result-field-group"
                options={groups.map((group) => ({ value: group.id, label: group.name }))}
                value={values.groupId}
                onChange={(groupId) => set("groupId", groupId)}
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="result-field-yearly-value">{t("yearlyValue")}</FieldLabel>
              <OptionSelect
                id="result-field-yearly-value"
                options={Object.values(YearlyValue).map((value) => ({
                  value,
                  label: t(`yearlyValues.${value}`),
                }))}
                value={values.yearlyValue}
                onChange={(yearlyValue) => set("yearlyValue", yearlyValue)}
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="result-field-estimate-type">{t("estimateType")}</FieldLabel>
              <OptionSelect
                id="result-field-estimate-type"
                options={Object.values(EstimateType).map((value) => ({
                  value,
                  label: t(`estimateTypes.${value}`),
                }))}
                value={values.estimateType}
                onChange={(estimateType) => set("estimateType", estimateType)}
                disabled={pending}
              />
              <FieldDescription>{t("estimateTypeDescription")}</FieldDescription>
            </Field>
            <Field data-invalid={!!errors?.type}>
              <FieldLabel htmlFor="result-field-type">{t("type")}</FieldLabel>
              <OptionSelect
                id="result-field-type"
                options={TYPE_OPTIONS.map((value) => ({
                  value,
                  label: t(`types.${value}`),
                }))}
                value={values.type ?? NO_TYPE}
                onChange={(type) => set("type", type === NO_TYPE ? null : type)}
                disabled={pending}
                invalid={!!errors?.type}
              />
              <FieldDescription>{t("typeDescription")}</FieldDescription>
              <FieldError errors={errorFor("type")} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{tDialogs("cancel")}</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? tDialogs("saving") : tDialogs("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
