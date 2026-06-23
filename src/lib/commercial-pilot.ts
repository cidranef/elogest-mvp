import crypto from "node:crypto";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { CommercialPilotDecision, CommercialPilotItemStatus, CommercialPilotStatus } from "@prisma/client";

export const PILOT_STATUSES: Array<{ value: CommercialPilotStatus; label: string }> = [
  { value: "DRAFT", label: "Rascunho" }, { value: "PLANNED", label: "Planejado" },
  { value: "ACTIVE", label: "Em Andamento" }, { value: "PAUSED", label: "Pausado" },
  { value: "COMPLETED", label: "Concluído" }, { value: "CANCELLED", label: "Cancelado" },
];
export const PILOT_DECISIONS: Array<{ value: CommercialPilotDecision; label: string }> = [
  { value: "PENDING", label: "Pendente" }, { value: "APPROVED_FOR_CONTRACT", label: "Aprovado Para Contratação" },
  { value: "EXTEND_PILOT", label: "Prorrogar Piloto" }, { value: "NEEDS_ADJUSTMENTS", label: "Ajustes Necessários" },
  { value: "NOT_CONVERTED", label: "Não Convertido" },
];
export const ITEM_STATUSES: Array<{ value: CommercialPilotItemStatus; label: string }> = [
  { value: "PENDING", label: "Pendente" }, { value: "IN_PROGRESS", label: "Em Andamento" },
  { value: "BLOCKED", label: "Bloqueado" }, { value: "COMPLETED", label: "Concluído" },
  { value: "NOT_APPLICABLE", label: "Não Aplicável" },
];
export const DEFAULT_PILOT_ITEMS = [
  "Diagnóstico Concluído", "Escopo Definido", "Dados Recebidos", "Ambiente Configurado",
  "Acessos Criados", "Treinamento Realizado", "Testes Executados", "Operação Acompanhada",
  "Avaliação Final", "Decisão Comercial",
];
export function progress(items: Array<{ status: CommercialPilotItemStatus }>) {
  const applicable = items.filter((i) => i.status !== "NOT_APPLICABLE");
  if (!applicable.length) return 0;
  return Math.round((applicable.filter((i) => i.status === "COMPLETED").length / applicable.length) * 100);
}
function env(...names: string[]) { for (const name of names) { const value = process.env[name]?.trim(); if (value) return value; } }
function config() {
  const accountId = env("R2_ACCOUNT_ID", "CLOUDFLARE_R2_ACCOUNT_ID");
  const endpoint = env("R2_ENDPOINT") || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  const accessKeyId = env("R2_ACCESS_KEY_ID", "CLOUDFLARE_R2_ACCESS_KEY_ID");
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY", "CLOUDFLARE_R2_SECRET_ACCESS_KEY");
  const bucket = env("R2_BUCKET_NAME", "CLOUDFLARE_R2_BUCKET_NAME");
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) throw new Error("Configuração do Cloudflare R2 incompleta.");
  return { endpoint, accessKeyId, secretAccessKey, bucket };
}
function client() { const c = config(); return { bucket: c.bucket, s3: new S3Client({ region: "auto", endpoint: c.endpoint, credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } }) }; }
export function sha256(buffer: Buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
export async function uploadPilotEvidence(key: string, body: Buffer, contentType: string, fileName: string) { const { s3, bucket } = client(); await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, ContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` })); }
export async function readPilotEvidence(key: string) { const { s3, bucket } = client(); return s3.send(new GetObjectCommand({ Bucket: bucket, Key: key })); }
export async function deletePilotEvidence(key: string) { const { s3, bucket } = client(); await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); }
