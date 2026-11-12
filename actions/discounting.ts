"use server";

import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import {
  DISCOUNT_VARIABLES,
  fromStoredDiscountValue,
  toStoredDiscountValue,
  type DiscountValues,
} from "@/lib/discounting";
import { prisma } from "@/lib/prisma";
import type { DiscountVariable } from "@/app/generated/prisma/client";

// A company's discount variables; variables without a row are missing.
export async function getDiscountVariables(companyId: number): Promise<DiscountValues> {
  await requireUserId();

  const rows = await prisma.companyDiscountVariable.findMany({
    where: { companyId },
    select: { variable: true, value: true },
  });
  return Object.fromEntries(
    rows.map((row) => [row.variable, row.value == null ? null : fromStoredDiscountValue(row.value)]),
  );
}

const saveSchema = z.object({
  companyId: z.number().int().positive(),
  variable: z.enum(DISCOUNT_VARIABLES as [DiscountVariable, ...DiscountVariable[]]),
  // Keeps the stored hundredths well within int.
  value: z.number().min(-1e6).max(1e6).nullable(),
});

// Saves a company's discount variable, rounded to hundredths; null clears it.
export async function saveDiscountVariable(input: {
  companyId: number;
  variable: DiscountVariable;
  value: number | null;
}): Promise<{ saved: boolean }> {
  await requireUserId();

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { saved: false };
  const { companyId, variable, value } = parsed.data;

  const companies = await prisma.company.count({ where: { id: companyId } });
  if (companies === 0) return { saved: false };

  const stored = value == null ? null : toStoredDiscountValue(value);
  await prisma.companyDiscountVariable.upsert({
    where: { companyId_variable: { companyId, variable } },
    create: { companyId, variable, value: stored },
    update: { value: stored },
  });
  return { saved: true };
}
