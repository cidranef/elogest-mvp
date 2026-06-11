import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import { readFile, unlink } from "fs/promises";
import path from "path";
import { Prisma, Role, Status } from "@prisma/client";
import {
  deletePrivateDocument,
  readPrivateDocument,
} from "@/lib/storage/document-storage";
import {
  buildActorLabel,
  buildActorRole,
  getActiveUserAccessFromCookies,
  isPortalAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";



/* =========================================================
   PORTAL - REMOVER ANEXO DO CHAMADO

   ETAPA 35.6 — REVISÃO DO PORTAL DE CHAMADOS

   REGRA FINAL:

   MORADOR / PROPRIETÁRIO:
   - remove apenas anexos enviados pelo próprio usuário;
   - somente em chamados da unidade do contexto ativo;
   - unidade/morador do contexto precisam estar ativos.

   SÍNDICO:
   - remove apenas anexos enviados pelo próprio usuário;
   - somente em chamados do condomínio do contexto ativo.

   TODOS:
   - usuário precisa estar ativo;
   - chamado não pode estar RESOLVED ou CANCELED;
   - condomínio e administradora precisam estar ativos;
   - administradora e super admin não usam esta rota do portal.

   LOG:
   - registra ATTACHMENT_REMOVED;
   - grava accessId somente quando for UserAccess real;
   - grava actorRole e actorLabel sempre.

   CORREÇÃO TYPESCRIPT:
   - validação direta de user null antes de usar user.id.
   - evita TS18047: 'user' is possibly 'null'.
   ========================================================= */

export const runtime = "nodejs";



type RouteContext = {
  params: Promise<{
    id: string;
    attachmentId: string;
  }>;
};

type PortalTicketUser = {
  id: string;
};

type PortalAttachmentDeleteTicket = {
  condominium?: {
    status?: Status | null;
    administrator?: {
      status?: Status | null;
    } | null;
  } | null;
};

function isUnauthorizedError(error: unknown) {
  return error instanceof Error && error.message === "UNAUTHORIZED";
}



/* =========================================================
   ACCESS ID SEGURO PARA BANCO

   Importante:
   - UserAccess real pode ser salvo como FK.
   - Contexto sintético, como synthetic-resident:<residentId>,
     NÃO existe na tabela UserAccess.
   - Portanto, não pode ser salvo em TicketLog.accessId.

   Mesmo com accessId null:
   - actorRole continua gravado;
   - actorLabel continua gravado.
   ========================================================= */

function getDatabaseAccessId(access: ActiveUserAccess) {
  return access.source === "USER_ACCESS" ? access.accessId : null;
}




function getPrivateStorageKey(url: string) {
  const normalized = String(url || "").trim();
  return normalized.startsWith("private://")
    ? normalized.slice("private://".length)
    : null;
}

function buildContentDisposition(fileName: string) {
  const fallback = String(fileName || "documento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "documento";

  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function getLegacyAbsolutePath(params: {
  ticketId: string;
  storedName: string;
}) {
  if (
    !params.storedName ||
    params.storedName.includes("/") ||
    params.storedName.includes("\\") ||
    params.storedName.includes("..")
  ) {
    return null;
  }

  const folder = path.join(
    process.cwd(),
    "public",
    "uploads",
    "chamados",
    params.ticketId,
  );

  const absolutePath = path.resolve(folder, params.storedName);
  const safeFolder = `${path.resolve(folder)}${path.sep}`;

  return absolutePath.startsWith(safeFolder) ? absolutePath : null;
}

async function readAttachmentBytes(attachment: {
  ticketId: string;
  storedName: string;
  url: string;
}) {
  const storageKey = getPrivateStorageKey(attachment.url);

  if (storageKey) {
    return readPrivateDocument({
      key: storageKey,
    });
  }

  const legacyPath = getLegacyAbsolutePath({
    ticketId: attachment.ticketId,
    storedName: attachment.storedName,
  });

  if (!legacyPath) {
    throw new Error("Documento privado não localizado.");
  }

  return readFile(legacyPath);
}

async function deleteAttachmentBytes(attachment: {
  ticketId: string;
  storedName: string;
  url: string;
}) {
  const storageKey = getPrivateStorageKey(attachment.url);

  if (storageKey) {
    await deletePrivateDocument({
      key: storageKey,
      ignoreMissing: true,
    });

    return;
  }

  const legacyPath = getLegacyAbsolutePath({
    ticketId: attachment.ticketId,
    storedName: attachment.storedName,
  });

  if (!legacyPath) {
    return;
  }

  try {
    await unlink(legacyPath);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code || "")
        : "";

    if (code !== "ENOENT") {
      throw error;
    }
  }
}


/* =========================================================
   FILTRO DE ACESSO DO CHAMADO

   MORADOR / PROPRIETÁRIO:
   - só acessam chamados da unidade do contexto ativo;
   - e somente quando forem criador ou resident vinculado.

   SÍNDICO:
   - acessa chamados do condomínio do contexto ativo.

   ADMINISTRADORA / SUPER_ADMIN:
   - bloqueados, pois não são contexto de portal.
   ========================================================= */

function getPortalTicketWhere({
  user,
  access,
  ticketId,
}: {
  user: PortalTicketUser;
  access: ActiveUserAccess;
  ticketId: string;
}): Prisma.TicketWhereInput {
  if (access.role === Role.MORADOR || access.role === "PROPRIETARIO") {
    if (!access.condominiumId || !access.unitId) {
      return {
        id: "__blocked__",
      };
    }

    const ownershipConditions: Prisma.TicketWhereInput[] = [
      {
        createdByUserId: user.id,
      },
    ];

    if (access.residentId) {
      ownershipConditions.push({
        residentId: access.residentId,
      });
    }

    return {
      id: ticketId,
      condominiumId: access.condominiumId,
      unitId: access.unitId,
      OR: ownershipConditions,
    };
  }

  if (access.role === Role.SINDICO) {
    if (!access.condominiumId) {
      return {
        id: "__blocked__",
      };
    }

    return {
      id: ticketId,
      condominiumId: access.condominiumId,
    };
  }

  return {
    id: "__blocked__",
  };
}



/* =========================================================
   VALIDAR REGISTROS ATIVOS PARA REMOÇÃO

   Histórico continua visível, mas remover anexo é ação
   operacional. Portanto bloqueamos quando registros essenciais
   estiverem inativos.
   ========================================================= */

async function validatePortalAttachmentDeleteOperation({
  access,
  chamado,
}: {
  access: ActiveUserAccess;
  chamado: PortalAttachmentDeleteTicket;
}) {
  if (
    chamado.condominium?.status !== Status.ACTIVE ||
    chamado.condominium?.administrator?.status !== Status.ACTIVE
  ) {
    return {
      ok: false,
      status: 400,
      message:
        "O condomínio ou a administradora deste chamado está inativo. Não é possível remover anexos.",
    };
  }

  if (access.role === Role.MORADOR || access.role === "PROPRIETARIO") {
    if (!access.unitId || !access.condominiumId) {
      return {
        ok: false,
        status: 403,
        message: "Contexto de unidade incompleto.",
      };
    }

    const unidade = await db.unit.findFirst({
      where: {
        id: access.unitId,
        condominiumId: access.condominiumId,
        status: Status.ACTIVE,
      },
      select: {
        id: true,
      },
    });

    if (!unidade) {
      return {
        ok: false,
        status: 403,
        message:
          "Unidade não encontrada ou inativa. Não é possível remover anexos.",
      };
    }

    if (access.residentId) {
      const morador = await db.resident.findFirst({
        where: {
          id: access.residentId,
          condominiumId: access.condominiumId,
          unitId: access.unitId,
          status: Status.ACTIVE,
        },
        select: {
          id: true,
        },
      });

      if (!morador) {
        return {
          ok: false,
          status: 403,
          message:
            "Morador não encontrado, inativo ou fora da unidade do contexto.",
        };
      }
    }
  }

  if (access.role === Role.SINDICO) {
    if (!access.condominiumId) {
      return {
        ok: false,
        status: 403,
        message: "Contexto de síndico sem condomínio vinculado.",
      };
    }
  }

  return {
    ok: true,
    status: 200,
    message: "",
  };
}



/* =========================================================
   REGRA DE EXCLUSÃO DE ANEXO NO PORTAL

   Regra única:
   - somente quem enviou o anexo pode excluir.

   Isso preserva evidências e evita que um usuário remova arquivos
   enviados por outra pessoa.
   ========================================================= */

function canDeletePortalAttachment({
  user,
  attachment,
}: {
  user: PortalTicketUser;
  attachment: {
    uploadedByUserId: string;
  };
}) {
  return attachment.uploadedByUserId === user.id;
}




/* =========================================================
   GET - DOWNLOAD PROTEGIDO DO ANEXO PELO PORTAL
   ========================================================= */

export async function GET(_req: Request, context: RouteContext) {
  try {
    const authUser = await getAuthUser();
    const { id, attachmentId } = await context.params;
    const ticketId = String(id || "").trim();
    const safeAttachmentId = String(attachmentId || "").trim();

    if (!authUser?.id) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    if (!ticketId || !safeAttachmentId) {
      return NextResponse.json(
        { error: "Chamado ou anexo não informado." },
        { status: 400 },
      );
    }

    const access = await getActiveUserAccessFromCookies({
      userId: authUser.id,
    });

    if (!access || !isPortalAccess(access)) {
      return NextResponse.json(
        { error: "Este perfil não possui acesso ao portal." },
        { status: 403 },
      );
    }

    const user = await db.user.findUnique({
      where: {
        id: authUser.id,
      },
      select: {
        id: true,
        isActive: true,
      },
    });

    if (!user || user.isActive === false) {
      return NextResponse.json(
        { error: "Usuário não encontrado ou inativo." },
        { status: 403 },
      );
    }

    const chamado = await db.ticket.findFirst({
      where: getPortalTicketWhere({
        user,
        access,
        ticketId,
      }),
      select: {
        id: true,
      },
    });

    if (!chamado) {
      return NextResponse.json(
        { error: "Chamado não encontrado ou acesso negado." },
        { status: 404 },
      );
    }

    const attachment = await db.ticketAttachment.findFirst({
      where: {
        id: safeAttachmentId,
        ticketId: chamado.id,
      },
      select: {
        ticketId: true,
        originalName: true,
        storedName: true,
        mimeType: true,
        url: true,
      },
    });

    if (!attachment) {
      return NextResponse.json(
        { error: "Anexo não encontrado para este chamado." },
        { status: 404 },
      );
    }

    const bytes = await readAttachmentBytes(attachment);

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "Content-Disposition": buildContentDisposition(attachment.originalName),
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("ERRO AO BAIXAR ANEXO PELO PORTAL:", error);
    return NextResponse.json(
      { error: "Erro ao baixar anexo." },
      { status: 500 },
    );
  }
}

/* =========================================================
   DELETE - REMOVER ANEXO PELO PORTAL
   ========================================================= */

export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const authUser = await getAuthUser();
    const { id, attachmentId } = await context.params;

    if (!authUser?.id) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (!id) {
      return NextResponse.json(
        { error: "ID do chamado não informado." },
        { status: 400 }
      );
    }

    if (!attachmentId) {
      return NextResponse.json(
        { error: "ID do anexo não informado." },
        { status: 400 }
      );
    }



    /* =========================================================
       CONTEXTO ATIVO DO USUÁRIO

       O contexto vem do cookie activeAccessId.
       ========================================================= */

    const access = await getActiveUserAccessFromCookies({
      userId: authUser.id,
    });

    if (!access || !isPortalAccess(access)) {
      return NextResponse.json(
        {
          error:
            "Este portal é destinado a síndicos, proprietários e moradores.",
        },
        { status: 403 }
      );
    }



    /* =========================================================
       USUÁRIO LEGADO

       Mantido para:
       - uploadedByUserId;
       - compatibilidade durante a migração.
       ========================================================= */

    const user = await db.user.findUnique({
      where: {
        id: authUser.id,
      },
      include: {
        resident: {
          include: {
            unit: true,
            condominium: true,
          },
        },
        condominium: true,
      },
    });



    /* =========================================================
       CORREÇÃO TYPESCRIPT

       Validação direta do user.
       Depois deste bloco, o TypeScript entende que user não é null.
       ========================================================= */

    if (!user) {
      return NextResponse.json(
        { error: "Usuário não encontrado." },
        { status: 404 }
      );
    }

    if (user.isActive === false) {
      return NextResponse.json(
        { error: "Usuário inativo. Não é possível acessar o portal." },
        { status: 403 }
      );
    }



    /* =========================================================
       BUSCA CHAMADO COM FILTRO DO CONTEXTO ATIVO

       Inclui condomínio/administradora para validar registros ativos
       antes da remoção.
       ========================================================= */

    const chamado = await db.ticket.findFirst({
      where: getPortalTicketWhere({
        user,
        access,
        ticketId: id,
      }),
      select: {
        id: true,
        status: true,
        scope: true,
        condominiumId: true,
        unitId: true,
        condominium: {
          select: {
            id: true,
            status: true,
            administrator: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!chamado) {
      return NextResponse.json(
        { error: "Chamado não encontrado ou acesso negado." },
        { status: 404 }
      );
    }



    /* =========================================================
       CHAMADO FINALIZADO NÃO PERMITE REMOÇÃO
       ========================================================= */

    if (chamado.status === "RESOLVED" || chamado.status === "CANCELED") {
      return NextResponse.json(
        {
          error:
            "Este chamado está finalizado. Não é possível remover anexos.",
        },
        { status: 400 }
      );
    }



    /* =========================================================
       BLOQUEIO OPERACIONAL POR REGISTROS INATIVOS
       ========================================================= */

    const operationValidation = await validatePortalAttachmentDeleteOperation({
      access,
      chamado,
    });

    if (!operationValidation.ok) {
      return NextResponse.json(
        { error: operationValidation.message },
        { status: operationValidation.status }
      );
    }



    /* =========================================================
       BUSCA DO ANEXO

       O anexo precisa pertencer ao chamado informado.
       ========================================================= */

    const attachment = await db.ticketAttachment.findFirst({
      where: {
        id: attachmentId,
        ticketId: chamado.id,
      },
      select: {
        id: true,
        ticketId: true,
        uploadedByUserId: true,
        originalName: true,
        storedName: true,
        url: true,
      },
    });

    if (!attachment) {
      return NextResponse.json(
        { error: "Anexo não encontrado para este chamado." },
        { status: 404 }
      );
    }



    /* =========================================================
       REGRA DE PERMISSÃO DE EXCLUSÃO

       Apenas quem enviou o anexo pode excluir.
       ========================================================= */

    const allowedToDelete = canDeletePortalAttachment({
      user,
      attachment,
    });

    if (!allowedToDelete) {
      return NextResponse.json(
        {
          error:
            "Você só pode excluir anexos enviados por você. Anexos de outros usuários ficam preservados no histórico.",
        },
        { status: 403 }
      );
    }



    /* =========================================================
       REMOVE REGISTRO DO BANCO
       ========================================================= */

    await db.ticketAttachment.delete({
      where: {
        id: attachment.id,
      },
    });



    /* =========================================================
       REMOVE OBJETO PRIVADO OU ARQUIVO LOCAL LEGADO

       Falha física não derruba a operação, pois o registro do
       banco já foi removido.
       ========================================================= */

    try {
      await deleteAttachmentBytes(attachment);
    } catch (fileError) {
      console.warn("Arquivo privado não removido ou já inexistente:", fileError);
    }



    /* =========================================================
       LOG NA LINHA DO TEMPO

       accessId:
       - só salva quando for UserAccess real;
       - contexto sintético grava null para não quebrar FK.
       ========================================================= */

    const dbAccessId = getDatabaseAccessId(access);

    await db.ticketLog.create({
      data: {
        ticketId: chamado.id,
        userId: user.id,
        accessId: dbAccessId,
        actorRole: buildActorRole(access),
        actorLabel: buildActorLabel(access),
        action: "ATTACHMENT_REMOVED",
        comment: `Anexo removido: ${attachment.originalName}`,
      },
    });

    return NextResponse.json({
      success: true,
      removedAttachmentId: attachment.id,
    });
  } catch (error: unknown) {
    console.error("ERRO AO REMOVER ANEXO PELO PORTAL:", error);

    if (isUnauthorizedError(error)) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao remover anexo." },
      { status: 500 }
    );
  }
}

/* =========================================================
   ETAPA 52.9.2.1 — DOCUMENTOS PRIVADOS DOS CHAMADOS

   Ajustes:
   - GET autenticado para leitura do anexo.
   - DELETE remove objeto no R2 ou arquivo local legado.
   ========================================================= */
