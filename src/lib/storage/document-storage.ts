import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/* =========================================================
   ELOGEST — ETAPA 52.8.1
   CAMADA CENTRAL DE ARMAZENAMENTO PRIVADO

   Arquivo:
   src/lib/storage/document-storage.ts

   Objetivo:
   - Centralizar a gravação e a leitura de documentos privados.
   - Manter desenvolvimento local simples.
   - Permitir armazenamento persistente no Cloudflare R2.
   - Evitar URLs públicas permanentes para documentos sensíveis.
   - Preservar a proteção das APIs do EloGest.

   Drivers:
   - LOCAL: salva dentro de /storage no ambiente local.
   - R2: salva no bucket privado configurado no Cloudflare R2.

   Variáveis:
   - DOCUMENT_STORAGE_DRIVER=local | r2
   - R2_ACCOUNT_ID
   - R2_ACCESS_KEY_ID
   - R2_SECRET_ACCESS_KEY
   - R2_BUCKET_NAME
   ========================================================= */

export type DocumentStorageDriver = "LOCAL" | "R2";

export type WritePrivateDocumentInput = {
  key: string;
  bytes: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
};

export type ReadPrivateDocumentInput = {
  key: string;
  fallbackKeys?: string[];
};

export type DeletePrivateDocumentInput = {
  key: string;
  ignoreMissing?: boolean;
};

export type DocumentStorageConfiguration = {
  driver: DocumentStorageDriver;
  bucketName: string | null;
  configured: boolean;
};

const LOCAL_STORAGE_ROOT = path.join(process.cwd(), "storage");

let cachedR2Client: S3Client | null = null;

function normalizeNullableString(value: string | undefined) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeDriver(value: string | undefined): DocumentStorageDriver {
  return String(value || "local").trim().toLowerCase() === "r2"
    ? "R2"
    : "LOCAL";
}

function sanitizePathSegment(value: string) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error("Segmento inválido na chave do documento.");
  }

  return normalized;
}

function normalizeStorageKey(value: string) {
  const normalized = String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map(sanitizePathSegment)
    .join("/");

  if (!normalized) {
    throw new Error("Chave do documento não informada.");
  }

  return normalized;
}

function getR2Environment() {
  const accountId = normalizeNullableString(process.env.R2_ACCOUNT_ID);
  const accessKeyId = normalizeNullableString(process.env.R2_ACCESS_KEY_ID);
  const secretAccessKey = normalizeNullableString(
    process.env.R2_SECRET_ACCESS_KEY,
  );
  const bucketName = normalizeNullableString(process.env.R2_BUCKET_NAME);

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
  };
}

function getR2Client() {
  if (cachedR2Client) return cachedR2Client;

  const env = getR2Environment();

  if (
    !env.accountId ||
    !env.accessKeyId ||
    !env.secretAccessKey ||
    !env.bucketName
  ) {
    throw new Error(
      "Cloudflare R2 não configurado. Confira as variáveis R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET_NAME.",
    );
  }

  cachedR2Client = new S3Client({
    region: "auto",
    endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });

  return cachedR2Client;
}

function getLocalAbsolutePath(key: string) {
  const normalizedKey = normalizeStorageKey(key);
  const absolutePath = path.join(LOCAL_STORAGE_ROOT, normalizedKey);
  const relativePath = path.relative(LOCAL_STORAGE_ROOT, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Chave de documento inválida.");
  }

  return absolutePath;
}

async function readLocalFileWithFallback(
  key: string,
  fallbackKeys: string[] = [],
) {
  const candidates = [key, ...fallbackKeys];

  for (const candidate of candidates) {
    try {
      return await readFile(getLocalAbsolutePath(candidate));
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code || "")
          : "";

      if (code !== "ENOENT") throw error;
    }
  }

  throw new Error("Documento privado não localizado no armazenamento local.");
}

async function streamBodyToBuffer(body: unknown) {
  if (!body) {
    throw new Error("Documento privado não retornado pelo armazenamento R2.");
  }

  const candidate = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
    [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array>;
  };

  if (typeof candidate.transformToByteArray === "function") {
    return Buffer.from(await candidate.transformToByteArray());
  }

  if (typeof candidate[Symbol.asyncIterator] === "function") {
    const chunks: Buffer[] = [];

    for await (const chunk of candidate as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  throw new Error("Formato de resposta do armazenamento R2 não suportado.");
}

export function getDocumentStorageConfiguration(): DocumentStorageConfiguration {
  const driver = normalizeDriver(process.env.DOCUMENT_STORAGE_DRIVER);
  const bucketName = normalizeNullableString(process.env.R2_BUCKET_NAME);

  if (driver === "LOCAL") {
    return {
      driver,
      bucketName: null,
      configured: true,
    };
  }

  const env = getR2Environment();

  return {
    driver,
    bucketName,
    configured: Boolean(
      env.accountId &&
        env.accessKeyId &&
        env.secretAccessKey &&
        env.bucketName,
    ),
  };
}

export function buildDocumentStorageKey(...segments: string[]) {
  return segments.map(sanitizePathSegment).join("/");
}

export async function writePrivateDocument(
  input: WritePrivateDocumentInput,
) {
  const key = normalizeStorageKey(input.key);
  const config = getDocumentStorageConfiguration();

  if (config.driver === "LOCAL") {
    const absolutePath = getLocalAbsolutePath(key);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.bytes);

    return {
      driver: config.driver,
      key,
      bucketName: null,
    };
  }

  const env = getR2Environment();
  const client = getR2Client();

  await client.send(
    new PutObjectCommand({
      Bucket: env.bucketName!,
      Key: key,
      Body: input.bytes,
      ContentType: input.contentType,
      Metadata: input.metadata,
    }),
  );

  return {
    driver: config.driver,
    key,
    bucketName: env.bucketName,
  };
}

export async function readPrivateDocument(input: ReadPrivateDocumentInput) {
  const key = normalizeStorageKey(input.key);
  const fallbackKeys = (input.fallbackKeys || []).map(normalizeStorageKey);
  const config = getDocumentStorageConfiguration();

  if (config.driver === "LOCAL") {
    return readLocalFileWithFallback(key, fallbackKeys);
  }

  const env = getR2Environment();
  const client = getR2Client();

  const result = await client.send(
    new GetObjectCommand({
      Bucket: env.bucketName!,
      Key: key,
    }),
  );

  return streamBodyToBuffer(result.Body);
}


/* =========================================================
   ETAPA 52.9.2 — REMOÇÃO DE DOCUMENTOS PRIVADOS

   - LOCAL: remove o arquivo físico dentro de /storage.
   - R2: remove o objeto privado do bucket.
   - ignoreMissing=true mantém exclusões idempotentes.
   ========================================================= */

export async function deletePrivateDocument(
  input: DeletePrivateDocumentInput,
) {
  const key = normalizeStorageKey(input.key);
  const config = getDocumentStorageConfiguration();

  if (config.driver === "LOCAL") {
    try {
      await unlink(getLocalAbsolutePath(key));
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code || "")
          : "";

      if (!(input.ignoreMissing && code === "ENOENT")) {
        throw error;
      }
    }

    return {
      driver: config.driver,
      key,
      bucketName: null,
    };
  }

  const env = getR2Environment();
  const client = getR2Client();

  await client.send(
    new DeleteObjectCommand({
      Bucket: env.bucketName!,
      Key: key,
    }),
  );

  return {
    driver: config.driver,
    key,
    bucketName: env.bucketName,
  };
}
