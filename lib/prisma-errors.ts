import { Prisma } from "@/app/generated/prisma/client";

// True when a write failed because it violated a unique constraint (P2002).
export function isUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
