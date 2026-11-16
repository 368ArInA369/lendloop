/**
 * HMAC-SHA256 request signing shared by the outbound webhook action (Convex -> n8n)
 * and the inbound HTTP endpoints (n8n -> Convex).
 *
 * Header format (same in both directions):
 *   X-LendLoop-Timestamp: <unix seconds>
 *   X-LendLoop-Signature: v1=<hex hmac over "<timestamp>.<body>">
 *
 * Binding the timestamp into the signed string lets the receiver reject replays
 * outside a short window. Uses Web Crypto so it runs in the Convex default runtime.
 */

export const SIGNATURE_HEADER = "X-LendLoop-Signature";
export const TIMESTAMP_HEADER = "X-LendLoop-Timestamp";
const TOLERANCE_SECONDS = 5 * 60;

const encoder = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeSignature(
  secret: string,
  timestamp: string,
  body: string,
): Promise<string> {
  const key = await importKey(secret);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`));
  return `v1=${toHex(mac)}`;
}

/** Constant-time string comparison; avoids leaking where the mismatch happens. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export async function verifySignature(params: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowSeconds?: number;
}): Promise<VerifyResult> {
  const { secret, timestamp, signature, body } = params;
  if (!timestamp || !signature) return { ok: false, reason: "missing signature headers" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad timestamp" };
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TOLERANCE_SECONDS) return { ok: false, reason: "timestamp outside window" };

  const expected = await computeSignature(secret, timestamp, body);
  if (!safeEqual(expected, signature)) return { ok: false, reason: "signature mismatch" };
  return { ok: true };
}

export function nowTimestamp(): string {
  return String(Math.floor(Date.now() / 1000));
}

export function requireSecret(): string {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("N8N_WEBHOOK_SECRET is not configured on the Convex deployment");
  }
  return secret;
}
