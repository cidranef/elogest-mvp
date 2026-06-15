import { NextResponse } from "next/server";
import { AccessRole, Status } from "@prisma/client";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { hasModuleAccess } from "@/lib/plan-limits";
import { readPrivateDocument } from "@/lib/storage/document-storage";
import {
  getActiveUserAccessFromCookies,
  isPortalAccess,
} from "@/lib/user-access";

/* =========================================================
   ELOGEST — ETAPA 53.6
   API PORTAL — DOWNLOAD PROTEGIDO DE COMPROVANTE FINANCEIRO

   Arquivo:
   src/app/api/portal/financeiro/comprovantes/[id]/route.ts

   Segurança:
   - Exige perfil ativo do portal.
   - Exige módulo Financeiro liberado.
   - O comprovante deve pertencer a lançamento financeiro da unidade
     vinculada ao perfil ativo.
   ========================================================= */

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isAllowedPortalRole(role?: string | null) {
  return (
    role === AccessRole.SINDICO ||
    role === AccessRole.CONSELHEIRO ||
    role === AccessRole.MORADOR ||
    role === AccessRole.PROPRIETARIO
  );
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const authUser = (await getAuthUser()) as { id?: string } | null;

    if (!authUser?.id) {
      return jsonError("Sessão expirada. Faça login novamente.", 401);
    }

    const activeAccess = await getActiveUserAccessFromCookies({
      userId: authUser.id,
    });

    if (!activeAccess || !isPortalAccess(activeAccess) || !isAllowedPortalRole(activeAccess.role)) {
      return jsonError("Selecione um perfil do portal para acessar comprovantes.", 403);
    }

    if (!activeAccess.condominiumId || !activeAccess.unitId) {
      return jsonError("Perfil ativo sem unidade vinculada.", 403);
    }

    const { id } = await context.params;
    const attachmentId = cleanText(id);

    if (!attachmentId) {
      return jsonError("Comprovante não informado.", 400);
    }

    const attachment = await db.financialAttachment.findFirst({
      where: {
        id: attachmentId,
        financialEntry: {
          condominiumId: activeAccess.condominiumId,
          unitId: activeAccess.unitId,
        },
      },
      include: {
        administrator: {
          select: {
            id: true,
            status: true,
          },
        },
        financialEntry: {
          select: {
            id: true,
            administratorId: true,
            condominiumId: true,
            unitId: true,
            condominium: {
              select: {
                id: true,
                status: true,
                administratorId: true,
              },
            },
          },
        },
      },
    });

    if (!attachment || !attachment.financialEntry) {
      return jsonError("Comprovante não encontrado para a unidade ativa.", 404);
    }

    if (
      attachment.administrator.status !== Status.ACTIVE ||
      attachment.financialEntry.condominium.status !== Status.ACTIVE
    ) {
      return jsonError("Condomínio ou administradora inativa.", 403);
    }

    const moduleAccess = await hasModuleAccess({
      administratorId: attachment.financialEntry.administratorId,
      moduleSlug: "financeiro",
    });

    if (!moduleAccess.allowed) {
      return NextResponse.json(
        {
          error: moduleAccess.message,
          code: "MODULE_ACCESS_DENIED",
          details: moduleAccess,
        },
        {
          status: 403,
        },
      );
    }

    const bytes = await readPrivateDocument({
      key: attachment.storageKey,
    });

    const safeName = attachment.originalName.replace(/[\r\n"]/g, "_");

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Erro ao baixar comprovante financeiro no portal:", error);

    return NextResponse.json(
      {
        error: "Erro ao baixar comprovante financeiro.",
      },
      {
        status: 500,
      },
    );
  }
}
