"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ResultFieldGroupSettingsData } from "@/actions/result-field-groups";
import type { ValuationMultipleErrors, ValuationMultipleFields } from "@/actions/valuation";
import { ValuationBasis } from "@/app/generated/prisma/enums";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Dialog for a valuation multiple's name, result field and basis, for both creating and editing a
// multiple. The dialog closes once save succeeds; otherwise its errors are shown under the fields.
export function ValuationMultipleDialog({
  trigger,
  title,
  groups,
  initialValues,
  save,
}: {
  trigger: React.ReactElement;
  title: string;
  // The company's result fields by group, which the multiple can be based on.
  groups: ResultFieldGroupSettingsData[];
  // Values to start with; the result field is unset when creating a multiple.
  initialValues: Omit<ValuationMultipleFields, "resultFieldId"> & { resultFieldId: number | null };
  save: (values: ValuationMultipleFields) => Promise<ValuationMultipleErrors | undefined>;
}) {
  const t = useTranslations("ValuationMultiples");
  const tDialogs = useTranslations("Dialogs");
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<ValuationMultipleErrors & { resultFieldId?: "required" }>();
  const [pending, startTransition] = useTransition();
  const fieldItems = groups.flatMap((group) => group.fields.map((field) => ({ value: field.id, label: field.name })));

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setValues(initialValues);
      setErrors(undefined);
    }
  }

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const { resultFieldId } = values;
    const invalid: typeof errors = {};
    if (values.name.trim() === "") invalid.name = "required";
    if (resultFieldId == null) invalid.resultFieldId = "required";
    if (resultFieldId == null || Object.keys(invalid).length > 0) return setErrors(invalid);

    startTransition(async () => {
      const errors = await save({ ...values, resultFieldId });
      if (errors) setErrors(errors);
      else setOpen(false);
    });
  }

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
              <FieldLabel htmlFor="valuation-multiple-name">{tDialogs("name")}</FieldLabel>
              <Input
                id="valuation-multiple-name"
                value={values.name}
                onChange={(e) => setValues({ ...values, name: e.target.value })}
                aria-invalid={!!errors?.name}
                disabled={pending}
                autoFocus
              />
              <FieldError errors={errors?.name ? [{ message: t(`errors.${errors.name}`) }] : undefined} />
            </Field>
            <Field data-invalid={!!errors?.resultFieldId}>
              <FieldLabel htmlFor="valuation-multiple-field">{t("resultField")}</FieldLabel>
              <Select
                items={fieldItems}
                value={values.resultFieldId}
                onValueChange={(resultFieldId) => {
                  if (resultFieldId != null) setValues({ ...values, resultFieldId });
                }}
                disabled={pending}
              >
                <SelectTrigger id="valuation-multiple-field" className="w-full" aria-invalid={!!errors?.resultFieldId}>
                  <SelectValue placeholder={t("chooseResultField")} />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectGroup key={group.id}>
                      <SelectLabel>{group.name}</SelectLabel>
                      {group.fields.map((field) => (
                        <SelectItem key={field.id} value={field.id}>
                          {field.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={errors?.resultFieldId ? [{ message: t("errors.fieldRequired") }] : undefined} />
            </Field>
            <Field>
              <FieldLabel htmlFor="valuation-multiple-basis">{t("basis")}</FieldLabel>
              <OptionSelect
                id="valuation-multiple-basis"
                options={Object.values(ValuationBasis).map((value) => ({ value, label: t(`bases.${value}`) }))}
                value={values.basis}
                onChange={(basis) => setValues({ ...values, basis })}
                disabled={pending}
              />
              <FieldDescription>{t("basisDescription")}</FieldDescription>
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
