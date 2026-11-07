"use server";

import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getCompanies() {
  await requireUserId();
  return prisma.company.findMany({ orderBy: { name: "asc" } });
}
