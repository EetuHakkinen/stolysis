import "server-only";
import { createPublicKey, verify } from "node:crypto";

export const SIGNATURE_HEADER = "x-twilio-email-event-webhook-signature";
export const TIMESTAMP_HEADER = "x-twilio-email-event-webhook-timestamp";

// Verifies the ECDSA signature SendGrid attaches to webhook requests when a security policy
// with signing is enabled. The signed message is the timestamp header followed by the raw body.
// publicKey is the base64 `public_key` returned when the security policy was created.
export function verifySendgridSignature({
  publicKey,
  signature,
  timestamp,
  rawBody,
}: {
  publicKey: string;
  signature: string;
  timestamp: string;
  rawBody: Buffer;
}): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(publicKey, "base64"), format: "der", type: "spki" });
    const message = Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]);
    return verify("sha256", message, key, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

// Extracts the bare address from a From header such as `"Name" <news@example.com>`.
export function emailAddress(from: string): string {
  const match = from.match(/<([^>]+)>\s*$/);
  return (match ? match[1] : from).trim().toLowerCase();
}

// Parses a comma-separated list of email addresses (e.g. an env var) into normalized addresses.
export function parseAddressList(list: string): string[] {
  return list
    .split(",")
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
}
