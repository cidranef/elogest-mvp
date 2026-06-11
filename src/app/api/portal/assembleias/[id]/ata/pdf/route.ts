import {
  AssemblyMinuteStatus,
  AssemblyStatus,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePortalAssemblyAccess } from "@/lib/portal-assembly-access";
import {
  buildDocumentStorageKey,
  readPrivateDocument,
} from "@/lib/storage/document-storage";

/* =========================================================
   API PORTAL - DOWNLOAD PROTEGIDO DO PDF OFICIAL DA ATA

   Arquivo:
   src/app/api/portal/assembleias/[id]/ata/pdf/route.ts

   ELOGEST — ETAPA 52.9.3

   Regra:
   - Exige usuário autenticado com perfil ativo no portal.
   - Exige vínculo ativo com o mesmo condomínio da assembleia.
   - Exige resultados oficialmente publicados.
   - Exige ata publicada e PDF oficial já gerado.
   - Lê o documento diretamente do storage privado LOCAL ou R2.
   - Não expõe URL pública do bucket.
   ========================================================= */

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

function sanitizeDownloadName(value: string) {
  return (
    String(value || "ata-oficial.pdf")
      .replace(/[\r\n"]/g, "")
      .trim() || "ata-oficial.pdf"
  );
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const access = await requirePortalAssemblyAccess();

  if ("error" in access) return access.error;

  try {
    const { id } = await context.params;

    const assembly = await db.assembly.findFirst({
      where: {
        id,
        condominiumId: access.activeAccess.condominiumId!,
        convocationPublishedAt: {
          not: null,
        },
        status: AssemblyStatus.RESULTS_PUBLISHED,
      },
      select: {
        id: true,
        administratorId: true,
        condominiumId: true,
        minute: {
          select: {
            status: true,
            publishedAt: true,
            officialPdfName: true,
            officialPdfMimeType: true,
          },
        },
      },
    });

    if (!assembly) {
      return notFound("Assembleia não encontrada para o perfil ativo.");
    }

    const minute = assembly.minute;

    if (
      minute?.status !== AssemblyMinuteStatus.PUBLISHED ||
      !minute.publishedAt
    ) {
      return notFound("A ata oficial ainda não foi publicada.");
    }

    if (!minute.officialPdfName) {
      return notFound("O PDF oficial da ata ainda não foi gerado.");
    }

    const storageKey = buildDocumentStorageKey(
      "assembleias",
      "atas",
      assembly.administratorId,
      assembly.condominiumId,
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
    console.error("Erro ao baixar PDF oficial da ata no portal:", error);

    return NextResponse.json(
      {
        error:
          "Não foi possível localizar o PDF oficial no armazenamento configurado.",
      },
      { status: 500 },
    );
  }
}
