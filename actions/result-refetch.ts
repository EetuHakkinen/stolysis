"use server";

import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import {
  latestResultRefetch,
  startResultRefetch as start,
  type ResultRefetchState,
  type StartResultRefetchResult,
} from "@/lib/result-refetch";

const idSchema = z.number().int().positive();

// The company's latest refetch of result values from its report news, or null when there is none.
export async function getResultRefetch(companyId: number): Promise<ResultRefetchState | null> {
  await requireUserId();
  return latestResultRefetch(idSchema.parse(companyId));
}

// Starts extracting the values of the result fields again from all of the company's report news.
export async function startResultRefetch({
  companyId,
  fieldIds,
}: {
  companyId: number;
  fieldIds: number[];
}): Promise<StartResultRefetchResult> {
  await requireUserId();

  // Parameters come from the client, so validate them despite the type.
  const input = z.object({ companyId: idSchema, fieldIds: z.array(idSchema).max(1000) }).parse({ companyId, fieldIds });
  return start(input.companyId, input.fieldIds);
}
