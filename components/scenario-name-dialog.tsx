"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ScenarioNameError } from "@/actions/estimates";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// Dialog asking a name for an estimate scenario, for both creating and renaming one. The dialog
// closes once save succeeds; otherwise its error is shown under the field.
export function ScenarioNameDialog({
  trigger,
  title,
  initialName = "",
  save,
}: {
  trigger: React.ReactElement;
  title: string;
  initialName?: string;
  save: (name: string) => Promise<ScenarioNameError | undefined>;
}) {
  const t = useTranslations("Estimates");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<ScenarioNameError>();
  const [pending, startTransition] = useTransition();

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setName(initialName);
      setError(undefined);
    }
  }

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (name.trim() === "") return setError("required");

    startTransition(async () => {
      const error = await save(name);
      if (error) setError(error);
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
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="scenario-name">{t("name")}</FieldLabel>
              <Input
                id="scenario-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!error}
                disabled={pending}
                autoFocus
              />
              <FieldError errors={error && [{ message: t(`errors.${error}`) }]} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{t("cancel")}</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
