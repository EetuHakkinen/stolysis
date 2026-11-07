import "server-only";
import { auth } from "@clerk/nextjs/server";

// Every server action must call this before touching data. Signed-out callers
// are redirected to sign-in (page renders) or get a 404 (other requests).
export async function requireUserId(): Promise<string> {
  const { userId } = await auth.protect();
  return userId;
}
