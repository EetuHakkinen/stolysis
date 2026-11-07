import type { Prisma } from "@/app/generated/prisma/client";

// Result fields every company has, by group, in display order.
const DEFAULT_RESULT_FIELDS: Record<string, string[]> = {
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
};

// Default result field groups with their fields,
// ready to be passed to a nested `resultFieldGroups: { create }` on a company.
export function defaultResultFieldGroups(): Prisma.ResultFieldGroupCreateWithoutCompanyInput[] {
  return Object.entries(DEFAULT_RESULT_FIELDS).map(([group, fields], groupIndex) => ({
    name: group,
    order: groupIndex,
    resultFields: {
      create: fields.map((field, fieldIndex) => ({ name: field, order: fieldIndex })),
    },
  }));
}
