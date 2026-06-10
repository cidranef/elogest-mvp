import { AssemblyMinuteLogAction, AssemblyMinuteStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";
import { generateAssemblyMinutePdf } from "@/lib/assembly-minute-pdf";
import {
  buildDocumentStorageKey,
  getDocumentStorageConfiguration,
  readPrivateDocument,
  writePrivateDocument,
} from "@/lib/storage/document-storage";

/* =========================================================
   ELOGEST — ETAPA 52.7.1
   API ADMIN - PDF OFICIAL DA ATA

   Arquivo:
   src/app/api/admin/assembleias/[id]/ata/pdf/route.ts

   GET:
   - Entrega o PDF oficial para download administrativo protegido.

   POST:
   - Gera o PDF somente após a publicação formal da ata.
   - Preserva o conteúdo publicado.
   - Inclui identidade visual EloGest.
   - Inclui dados disponíveis da administradora responsável.
   - Calcula hash SHA-256 do arquivo final.
   - Registra metadados e auditoria no banco.

   Armazenamento:
   - Usa camada central com driver LOCAL ou Cloudflare R2.
   - Mantém bucket privado e download exclusivamente pela API protegida.
   - Reconhece arquivos locais antigos para compatibilidade em desenvolvimento.
   ========================================================= */

export const runtime = "nodejs";

const ASSEMBLIES_MODULE_SLUG = "assembleias";
const ASSEMBLIES_MODULE_LABEL = "Assembleias";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

function sanitizeDownloadName(value: string) {
  return String(value || "ata-oficial.pdf")
    .replace(/[\r\n"]/g, "")
    .trim() || "ata-oficial.pdf";
}

async function findAssemblyMinuteForAdmin(params: {
  assemblyId: string;
  administratorId: string;
}) {
  return db.assembly.findFirst({
    where: {
      id: params.assemblyId,
      administratorId: params.administratorId,
    },
    select: {
      id: true,
      title: true,
      administratorId: true,
      administrator: {
        select: {
          name: true,
          cnpj: true,
          email: true,
          phone: true,
        },
      },
      condominium: {
        select: {
          id: true,
          name: true,
        },
      },
      minute: {
        select: {
          id: true,
          title: true,
          content: true,
          status: true,
          currentVersion: true,
          publishedAt: true,
          officialPdfUrl: true,
          officialPdfName: true,
          officialPdfMimeType: true,
          officialPdfSizeBytes: true,
          officialPdfHash: true,
          officialPdfGeneratedAt: true,
          publishedByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;

    const assembly = await findAssemblyMinuteForAdmin({
      assemblyId: id,
      administratorId: auth.administratorId,
    });

    if (!assembly) {
      return notFound(
        "Assembleia não encontrada na carteira ativa da administradora.",
      );
    }

    const minute = assembly.minute;

    if (!minute?.officialPdfName) {
      return notFound("O PDF oficial da ata ainda não foi gerado.");
    }

    const storageKey = buildDocumentStorageKey(
      "assembleias",
      "atas",
      assembly.administratorId,
      assembly.condominium.id,
      assembly.id,
      minute.officialPdfName,
    );

    const legacyLocalStorageKey = buildDocumentStorageKey(
      "assembleias",
      "atas",
      assembly.id,
      minute.officialPdfName,
    );

    const bytes = await readPrivateDocument({
      key: storageKey,
      fallbackKeys: [legacyLocalStorageKey],
    });

    const fileName = sanitizeDownloadName(minute.officialPdfName);

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": minute.officialPdfMimeType || "application/pdf",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(
          fileName,
        )}`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Erro ao baixar PDF oficial da ata:", error);

    return NextResponse.json(
      {
        error:
          "Não foi possível localizar o PDF oficial no armazenamento configurado.",
      },
      { status: 500 },
    );
  }
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;

    const assembly = await findAssemblyMinuteForAdmin({
      assemblyId: id,
      administratorId: auth.administratorId,
    });

    if (!assembly) {
      return notFound(
        "Assembleia não encontrada na carteira ativa da administradora.",
      );
    }

    const minute = assembly.minute;

    if (!minute) {
      return notFound("A ata da assembleia ainda não foi gerada.");
    }

    if (
      minute.status !== AssemblyMinuteStatus.PUBLISHED ||
      !minute.publishedAt
    ) {
      return forbidden(
        "Publique oficialmente a ata antes de gerar o documento em PDF.",
      );
    }

    if (minute.officialPdfUrl || minute.officialPdfName) {
      return conflict(
        "O PDF oficial já foi gerado. Utilize o download existente para preservar a integridade documental.",
      );
    }

    const publishedByLabel =
      minute.publishedByUser?.name ||
      minute.publishedByUser?.email ||
      "Responsável identificado no histórico da ata";

    const pdf = await generateAssemblyMinutePdf({
      assemblyId: assembly.id,
      minuteId: minute.id,
      condominiumName: assembly.condominium.name,
      assemblyTitle: assembly.title,
      minuteTitle: minute.title,
      minuteContent: minute.content,
      minuteVersion: minute.currentVersion,
      publishedAt: minute.publishedAt,
      publishedByLabel,
      administrator: assembly.administrator,
    });

    const storageKey = buildDocumentStorageKey(
      "assembleias",
      "atas",
      assembly.administratorId,
      assembly.condominium.id,
      assembly.id,
      pdf.fileName,
    );

    const storage = await writePrivateDocument({
      key: storageKey,
      bytes: pdf.bytes,
      contentType: "application/pdf",
      metadata: {
        assemblyid: assembly.id,
        minuteid: minute.id,
        administratorid: assembly.administratorId,
        condominiumid: assembly.condominium.id,
        documentcode: pdf.documentCode,
        filehashsha256: pdf.fileHash,
      },
    });

    const officialPdfUrl = `/api/admin/assembleias/${assembly.id}/ata/pdf`;
    const now = new Date();

    await db.$transaction(async (tx) => {
      await tx.assemblyMinute.update({
        where: {
          id: minute.id,
        },
        data: {
          officialPdfUrl,
          officialPdfName: pdf.fileName,
          officialPdfMimeType: "application/pdf",
          officialPdfSizeBytes: pdf.bytes.length,
          officialPdfHash: pdf.fileHash,
          officialPdfGeneratedAt: now,
        },
      });

      await tx.assemblyMinuteLog.create({
        data: {
          minuteId: minute.id,
          userId: auth.authUser.id,
          action: AssemblyMinuteLogAction.PDF_GENERATED,
          message: "PDF oficial da ata gerado e registrado com hash de integridade.",
          metadata: {
            documentCode: pdf.documentCode,
            fileName: pdf.fileName,
            fileHashSha256: pdf.fileHash,
            contentHashSha256: pdf.contentHash,
            sizeBytes: pdf.bytes.length,
            logoEmbedded: pdf.logoEmbedded,
            officializationApplied: pdf.officializationApplied,
            administratorName: assembly.administrator.name,
            storageDriver: storage.driver,
            storageKey: storage.key,
            storageBucketName: storage.bucketName,
            storageConfigured: getDocumentStorageConfiguration().configured,
          },
        },
      });
    });

    return NextResponse.json({
      message: "PDF oficial da ata gerado com sucesso.",
      pdf: {
        url: officialPdfUrl,
        name: pdf.fileName,
        mimeType: "application/pdf",
        sizeBytes: pdf.bytes.length,
        hashSha256: pdf.fileHash,
        contentHashSha256: pdf.contentHash,
        generatedAt: now.toISOString(),
        documentCode: pdf.documentCode,
        logoEmbedded: pdf.logoEmbedded,
        officializationApplied: pdf.officializationApplied,
        storageDriver: storage.driver,
      },
    });
  } catch (error) {
    console.error("Erro ao gerar PDF oficial da ata:", error);

    return NextResponse.json(
      { error: "Não foi possível gerar o PDF oficial da ata." },
      { status: 500 },
    );
  }
}
