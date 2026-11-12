"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Confirmation before an action, which closes the dialog once done.
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel,
  destructive = false,
  confirm,
}: {
  trigger: React.ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  destructive?: boolean;
  confirm: () => Promise<unknown>;
}) {
  const t = useTranslations("Dialogs");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      await confirm();
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>{t("cancel")}</DialogClose>
          <Button variant={destructive ? "destructive" : "default"} onClick={run} disabled={pending}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
