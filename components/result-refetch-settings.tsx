"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ResultFieldGroupSettingsData } from "@/actions/result-field-groups";
import { getResultRefetch, startResultRefetch } from "@/actions/result-refetch";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import type { ResultRefetchState, StartResultRefetchResult } from "@/lib/result-refetch";

const POLL_INTERVAL_MS = 3000;

// Company settings section for extracting the values of chosen result fields again from all of the
// company's report news, e.g. for fields added after the news were received. Fields calculated
// from actual values have no values to extract, so they aren't listed. The latest refetch's
// progress is polled while it runs.
export function ResultRefetchSettings({
  companyId,
  groups,
  refetch: initialRefetch,
}: {
  companyId: number;
  groups: ResultFieldGroupSettingsData[];
  refetch: ResultRefetchState | null;
}) {
  const t = useTranslations("ResultRefetch");
  const format = useFormatter();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [refetch, setRefetch] = useState(initialRefetch);
  const [error, setError] = useState<Extract<StartResultRefetchResult, { started: false }>["reason"]>();

  const running = refetch?.status === "running";
  const fieldGroups = groups
    .map((group) => ({ ...group, fields: group.fields.filter((field) => !field.actualDefinition) }))
    .filter((group) => group.fields.length > 0);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(async () => {
      const latest = await getResultRefetch(companyId);
      setRefetch(latest);
      // The refetched values show in the settings, e.g. which fields have results.
      if (latest?.status !== "running") router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [companyId, running, router]);

  function toggle(fieldId: number, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(fieldId);
    else next.delete(fieldId);
    setSelected(next);
  }

  async function start() {
    const result = await startResultRefetch({ companyId, fieldIds: [...selected] });
    setError(result.started ? undefined : result.reason);
    setRefetch(await getResultRefetch(companyId));
    if (result.started) setSelected(new Set());
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <ConfirmDialog
          title={t("confirmTitle")}
          description={t("confirmDescription", { count: selected.size })}
          confirmLabel={t("start")}
          pendingLabel={t("starting")}
          confirm={start}
          trigger={
            <Button variant="outline" size="sm" disabled={selected.size === 0 || running}>
              <RefreshCwIcon />
              {t("start")}
            </Button>
          }
        />
      </div>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      {fieldGroups.length === 0 ? (
        <p className="text-muted-foreground">{t("noFields")}</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {fieldGroups.map((group) => (
            <FieldSet key={group.id} className="gap-3">
              <FieldLegend variant="label">{group.name}</FieldLegend>
              {group.fields.map((field) => (
                <Field key={field.id} orientation="horizontal">
                  <Checkbox
                    id={`refetch-field-${field.id}`}
                    checked={selected.has(field.id)}
                    onCheckedChange={(checked) => toggle(field.id, checked)}
                    disabled={running}
                  />
                  <FieldLabel htmlFor={`refetch-field-${field.id}`} className="font-normal">
                    {field.name}
                  </FieldLabel>
                </Field>
              ))}
            </FieldSet>
          ))}
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {t(`errors.${error}`)}
        </p>
      )}
      {refetch && (
        <p className="text-sm" role="status">
          {t(`status.${refetch.status}`, {
            startedAt: format.dateTime(refetch.createdAt, { dateStyle: "short", timeStyle: "short" }),
            processed: refetch.processedCount,
            total: refetch.newsCount,
            rows: refetch.rowCount,
          })}
          {refetch.failedCount > 0 && ` ${t("failedNews", { count: refetch.failedCount })}`}
        </p>
      )}
    </section>
  );
}
