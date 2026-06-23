import crypto from "node:crypto";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type {
  CommercialMaterialCategory,
  CommercialMaterialFileType,
  CommercialMaterialStatus,
} from "@prisma/client";

export const COMMERCIAL_MATERIAL_CATEGORIES: Array<{ value: CommercialMaterialCategory; label: string }> = [
  { value: "INSTITUTIONAL", label: "Institucional" },
  { value: "PRESENTATION", label: "Apresentação" },
  { value: "SCRIPT", label: "Roteiro" },
  { value: "PLAN_COMPARISON", label: "Comparativo De Planos" },
  { value: "QUALIFICATION", label: "Qualificação" },
  { value: "PILOT", label: "Piloto" },
  { value: "PROPOSAL", label: "Proposta" },
  { value: "FOLLOW_UP", label: "Acompanhamento" },
  { value: "FAQ", label: "Perguntas Frequentes" },
  { value: "OTHER", label: "Outro" },
];

export const COMMERCIAL_MATERIAL_STATUSES: Array<{ value: CommercialMaterialStatus; label: string }> = [
  { value: "DRAFT", label: "Rascunho" },
  { value: "APPROVED", label: "Aprovado" },
  { value: "ARCHIVED", label: "Arquivado" },
];

export function categoryLabel(value: CommercialMaterialCategory) {
  return COMMERCIAL_MATERIAL_CATEGORIES.find((item) => item.value === value)?.label ?? value;
}

export function statusLabel(value: CommercialMaterialStatus) {
  return COMMERCIAL_MATERIAL_STATUSES.find((item) => item.value === value)?.label ?? value;
}

export function slugifyMaterial(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export function detectFileType(fileName: string): CommercialMaterialFileType {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "PDF";
  if (extension === "docx") return "DOCX";
  if (extension === "pptx") return "PPTX";
  if (extension === "xlsx") return "XLSX";
  return "OTHER";
}

export function sha256(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function env(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function storageConfig() {
  const accountId = env("R2_ACCOUNT_ID", "CLOUDFLARE_R2_ACCOUNT_ID");
  const endpoint = env("R2_ENDPOINT") || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  const accessKeyId = env("R2_ACCESS_KEY_ID", "CLOUDFLARE_R2_ACCESS_KEY_ID");
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY", "CLOUDFLARE_R2_SECRET_ACCESS_KEY");
  const bucket = env("R2_BUCKET_NAME", "CLOUDFLARE_R2_BUCKET_NAME");
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Configuração do Cloudflare R2 incompleta.");
  }
  return { endpoint, accessKeyId, secretAccessKey, bucket };
}

function client() {
  const config = storageConfig();
  return {
    bucket: config.bucket,
    s3: new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
  };
}

export async function uploadCommercialMaterial(input: {
  key: string;
  body: Buffer;
  contentType: string;
  fileName: string;
}) {
  const { s3, bucket } = client();
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    Body: input.body,
    ContentType: input.contentType,
    ContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(input.fileName)}`,
  }));
}

export async function readCommercialMaterial(key: string) {
  const { s3, bucket } = client();
  return s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
}
