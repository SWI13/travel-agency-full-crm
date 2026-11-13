import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta signs every webhook body with the app secret:
 *   X-Hub-Signature-256: sha256=<HMAC-SHA256(appSecret, rawBody)>
 * The signature must be checked against the exact bytes received.
 */
export function signPayload(rawBody: string | Buffer, appSecret: string): string {
  return `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
}

export function verifySignature(
  rawBody: string | Buffer,
  header: string | null | undefined,
  appSecret: string,
): boolean {
  if (!header || !appSecret) return false;
  const expected = Buffer.from(signPayload(rawBody, appSecret));
  const given = Buffer.from(header.trim());
  return expected.length === given.length && timingSafeEqual(expected, given);
}
