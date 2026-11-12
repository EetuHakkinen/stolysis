import type { Unit } from "@/app/generated/prisma/client";

// Values are stored in whole euros and shown in their financial year's unit.
export const UNIT_DIVISORS: Record<Unit, number> = { million: 1_000_000, thousand: 1_000, one: 1 };
