import type { Prisma, ResultFieldType, YearlyValue } from "@/app/generated/prisma/client";

type DefaultResultField = { name: string; type?: ResultFieldType; yearlyValue?: YearlyValue };

// Result fields every company has, by group, in display order.
const DEFAULT_RESULT_FIELDS: Record<string, (string | DefaultResultField)[]> = {
  Tuloslaskelma: [
    "Liikevaihto",
    "Liiketoiminnan muut tuotot",
    "Materiaalit ja palvelut",
    "Henkilöstökulut",
    "Liiketoiminnan muut kulut",
    "Poistot",
    "Liikevoitto",
    "Rahoitustuotot",
    "Rahoituskulut",
    "Tuloverot",
    "Kauden voitto",
  ],
  Tase: [{ name: "Nettovelka", type: "net_debt", yearlyValue: "last_period" }],
  Osake: [{ name: "Osakemäärä", type: "share_count", yearlyValue: "last_period" }],
};

// Default result field groups with their fields,
// ready to be passed to a nested `resultFieldGroups: { create }` on a company.
export function defaultResultFieldGroups(): Prisma.ResultFieldGroupCreateWithoutCompanyInput[] {
  return Object.entries(DEFAULT_RESULT_FIELDS).map(([group, fields], groupIndex) => ({
    name: group,
    order: groupIndex,
    resultFields: {
      create: fields.map((field, fieldIndex) => ({
        ...(typeof field === "string" ? { name: field } : field),
        order: fieldIndex,
      })),
    },
  }));
}
