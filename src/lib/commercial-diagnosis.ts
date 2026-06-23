import crypto from "node:crypto";

export const DIAGNOSIS_DEFAULT_VALID_DAYS = 7;

export function createDiagnosisToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashDiagnosisToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function tokenHint(token: string) {
  return token.slice(-8);
}

export function diagnosisPublicUrl(token: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/comercial/diagnostico/${token}`;
}

export function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

export function safeText(value: unknown, max = 2000) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

export function safeInteger(value: unknown) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
}

export function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
}
