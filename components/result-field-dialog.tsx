"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ResultFieldErrors, ResultFieldInput } from "@/actions/result-fields";
import { EstimateType, ResultFieldType, YearlyValue } from "@/app/generated/prisma/enums";
import { FormulaEditor, type FormulaFieldGroup } from "@/components/formula-editor";
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
import { checkFormula, type Formula } from "@/lib/formulas";

// Special type option for an ordinary field.
const NO_TYPE = "none" as const;
const TYPE_OPTIONS = [NO_TYPE, ...Object.values(ResultFieldType)];

type DefinitionKey = "actualDefinition" | "estimateDefinition";
const DEFINITION_KEYS: DefinitionKey[] = ["actualDefinition", "estimateDefinition"];

// Formulas being edited. They are kept while the field is switched to entered values and back.
const draftsOf = (values: ResultFieldInput): Record<DefinitionKey, Formula> => ({
  actualDefinition: values.actualDefinition ?? [],
  estimateDefinition: values.estimateDefinition ?? [],
});

// Dialog for a result field's name, group, yearly value, formulas, estimate type and special type,
// for both creating and editing a field. The dialog closes once save succeeds; otherwise its errors
// are shown under the fields.
export function ResultFieldDialog({
  trigger,
  title,
  groups,
  fieldId,
  initialValues,
  save,
}: {
  trigger: React.ReactElement;
  title: string;
  // The company's groups with their fields, which formulas can use.
  groups: FormulaFieldGroup[];
  // The edited field; undefined when creating one.
  fieldId?: number;
  initialValues: ResultFieldInput;
  save: (values: ResultFieldInput) => Promise<ResultFieldErrors | undefined>;
}) {
  const t = useTranslations("ResultFields");
  const tDialogs = useTranslations("Dialogs");
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initialValues);
  const [drafts, setDrafts] = useState(() => draftsOf(initialValues));
  const [errors, setErrors] = useState<ResultFieldErrors>();
  const [pending, startTransition] = useTransition();

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setValues(initialValues);
      setDrafts(draftsOf(initialValues));
      setErrors(undefined);
    }
  }

  function set<K extends keyof ResultFieldInput>(key: K, value: ResultFieldInput[K]) {
    setValues((values) => ({ ...values, [key]: value }));
  }

  function setCalculated(key: DefinitionKey, calculated: boolean) {
    set(key, calculated ? drafts[key] : null);
  }

  function changeFormula(key: DefinitionKey, formula: Formula) {
    setDrafts((drafts) => ({ ...drafts, [key]: formula }));
    set(key, formula);
  }

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const invalid: ResultFieldErrors = {};
    if (values.name.trim() === "") invalid.name = "required";
    for (const key of DEFINITION_KEYS) {
      const formula = values[key];
      const error = formula && checkFormula(formula)?.error;
      if (error) invalid[key] = error;
    }
    if (Object.keys(invalid).length > 0) return setErrors(invalid);

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
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
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
            <DefinitionField
              id="result-field-actual"
              label={t("actualValues")}
              definitionKey="actualDefinition"
              values={values}
              drafts={drafts}
              errors={errors}
              groups={groups}
              fieldId={fieldId}
              disabled={pending}
              onCalculatedChange={setCalculated}
              onFormulaChange={changeFormula}
            />
            <DefinitionField
              id="result-field-estimate"
              label={t("estimateValues")}
              definitionKey="estimateDefinition"
              values={values}
              drafts={drafts}
              errors={errors}
              groups={groups}
              fieldId={fieldId}
              disabled={pending}
              onCalculatedChange={setCalculated}
              onFormulaChange={changeFormula}
            />
            {values.estimateDefinition == null && (
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
            )}
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

// Whether the field's actual or estimated values are entered or calculated, and the formula of a
// calculated field.
function DefinitionField({
  id,
  label,
  definitionKey,
  values,
  drafts,
  errors,
  groups,
  fieldId,
  disabled,
  onCalculatedChange,
  onFormulaChange,
}: {
  id: string;
  label: string;
  definitionKey: DefinitionKey;
  values: ResultFieldInput;
  drafts: Record<DefinitionKey, Formula>;
  errors: ResultFieldErrors | undefined;
  groups: FormulaFieldGroup[];
  fieldId?: number;
  disabled: boolean;
  onCalculatedChange: (key: DefinitionKey, calculated: boolean) => void;
  onFormulaChange: (key: DefinitionKey, formula: Formula) => void;
}) {
  const t = useTranslations("ResultFields");
  const calculated = values[definitionKey] != null;
  const error = errors?.[definitionKey];
  const modes = definitionKey === "actualDefinition" ? "actualModes" : "estimateModes";

  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={`${id}-mode`}>{label}</FieldLabel>
      <OptionSelect
        id={`${id}-mode`}
        options={(["entered", "calculated"] as const).map((mode) => ({ value: mode, label: t(`${modes}.${mode}`) }))}
        value={calculated ? "calculated" : "entered"}
        onChange={(mode) => onCalculatedChange(definitionKey, mode === "calculated")}
        disabled={disabled}
      />
      {calculated && (
        <>
          <FieldDescription>
            {t(definitionKey === "actualDefinition" ? "actualCalculatedDescription" : "estimateCalculatedDescription")}
          </FieldDescription>
          <FormulaEditor
            id={`${id}-formula`}
            defaultValue={drafts[definitionKey]}
            onChange={(formula) => onFormulaChange(definitionKey, formula)}
            groups={groups}
            fieldId={fieldId}
            invalid={!!error}
            disabled={disabled}
          />
          <FieldError errors={error ? [{ message: t(`errors.${error}`) }] : undefined} />
        </>
      )}
    </Field>
  );
}
