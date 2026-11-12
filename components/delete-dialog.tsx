"use client";

import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/confirm-dialog";

// Confirmation before deleting something that can't be restored.
export function DeleteDialog({
  trigger,
  title,
  description,
  remove,
}: {
  trigger: React.ReactElement;
  title: string;
  description: string;
  remove: () => Promise<unknown>;
}) {
  const t = useTranslations("Dialogs");

  return (
    <ConfirmDialog
      trigger={trigger}
      title={title}
      description={description}
      confirmLabel={t("delete")}
      pendingLabel={t("deleting")}
      destructive
      confirm={remove}
    />
  );
}
