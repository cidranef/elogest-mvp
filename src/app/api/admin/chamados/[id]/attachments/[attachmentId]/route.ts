import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import { readFile, unlink } from "fs/promises";
import path from "path";
import { Status } from "@prisma/client";
import { canDeleteAttachment } from "@/lib/access-control";
import {
  deletePrivateDocument,
  readPrivateDocument,
} from "@/lib/storage/document-storage";
import {
  buildActorLabel,
  buildActorRole,
  getActiveUserAccessFromCookies,
  isAdministradoraAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";



/* =========================================================
   RUNTIME NODE

   Necessário porque esta rota usa fs/promises para remover
   o arquivo físico salvo em /public/uploads.
   ========================================================= */

export const runtime = "nodejs";



/* =========================================================
   TIPAGEM DA ROTA DINÂMICA

   Em versões recentes do Next.js, params pode vir como Promise.
   Por isso usamos:
   const { id, attachmentId } = await context.params;
   ========================================================= */

type RouteContext = {
  params: Promise<{
    id: string;
    attachmentId: string;
  }>;
};



/* =========================================================
   HELPERS
   ========================================================= */

function cleanText(value: unknown) {
  return String(value || "").trim();
}



function getDatabaseAccessId(access: ActiveUserAccess | null) {
  if (!access) {
    return null;
  }

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
   FILTRO DE ACESSO AO CHAMADO

   ETAPA 43:
   /admin é área operacional da ADMINISTRADORA.

   Portanto:
   - ADMINISTRADORA acessa apenas chamados da sua carteira ativa;
   - SUPER_ADMIN não opera por esta rota;
   - SÍNDICO / MORADOR / PROPRIETÁRIO / CONSELHEIRO usam portal
     ou rotas próprias de suas áreas.
   ========================================================= */

function getAttachmentTicketWhere({
  access,
  ticketId,
}: {
  access: ActiveUserAccess;
  ticketId: string;
}) {
  if (isAdministradoraAccess(access) && access.administratorId) {
    return {
      id: ticketId,
      condominium: {
        administratorId: access.administratorId,
      },
    };
  }

  return {
    id: "__NO_ACCESS__",
  };
}



/* =========================================================
   VALIDA ACESSO ADMINISTRATIVO

   Permitido nesta rota:
   - ADMINISTRADORA com administratorId no perfil ativo.

   Bloqueados:
   - SUPER_ADMIN por /admin;
   - SINDICO;
   - MORADOR;
   - PROPRIETARIO;
   - CONSELHEIRO.

   Observação importante:
   Isso valida acesso ao chamado. A exclusão do anexo mantém uma
   segunda regra mais restrita: somente quem enviou pode excluir.
   ========================================================= */

function validateAdminAttachmentContext(access: ActiveUserAccess | null) {
  if (!access) {
    return {
      ok: false,
      status: 403,
      message: "Não foi possível identificar o contexto de acesso.",
    };
  }

  if (!isAdministradoraAccess(access)) {
    return {
      ok: false,
      status: 403,
      message:
        "Este contexto não possui acesso à rota administrativa de remoção de anexos. Use o portal ou a área EloGest.",
    };
  }

  if (!access.administratorId) {
    return {
      ok: false,
      status: 403,
      message: "Contexto de administradora sem vínculo com administradora.",
    };
  }

  if (!canDeleteAttachment(access)) {
    return {
      ok: false,
      status: 403,
      message: "Usuário sem permissão para remover anexos.",
    };
  }

  return {
    ok: true,
    status: 200,
    message: "",
  };
}




/* =========================================================
   GET - DOWNLOAD PROTEGIDO DO ANEXO ADMINISTRATIVO
   ========================================================= */

export async function GET(_req: Request, context: RouteContext) {
  try {
    const user = await getAuthUser();
    const { id, attachmentId } = await context.params;
    const ticketId = cleanText(id);
    const safeAttachmentId = cleanText(attachmentId);

    if (!user?.id) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    if (!ticketId || !safeAttachmentId) {
      return NextResponse.json(
        { error: "Chamado ou anexo não informado." },
        { status: 400 },
      );
    }

    const activeAccess = await getActiveUserAccessFromCookies({
      userId: user.id,
    });

    const contextValidation = validateAdminAttachmentContext(activeAccess);

    if (!contextValidation.ok || !activeAccess) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status },
      );
    }

    const chamado = await db.ticket.findFirst({
      where: getAttachmentTicketWhere({
        access: activeAccess,
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
    console.error("ERRO AO BAIXAR ANEXO ADMINISTRATIVO:", error);
    return NextResponse.json(
      { error: "Erro ao baixar anexo." },
      { status: 500 },
    );
  }
}

/* =========================================================
   DELETE - REMOVER ANEXO DO CHAMADO

   REGRA FINAL DE SEGURANÇA / AUDITORIA:

   - Somente quem enviou o anexo pode excluir.
   - Administradora não remove anexo enviado pelo síndico/morador.
   - Chamados resolvidos/cancelados não permitem remoção.
   - Condomínio/administradora inativos não permitem nova remoção operacional.
   - Log grava accessId apenas quando o perfil ativo for UserAccess real.

   Motivo:
   Preservar evidências e evitar apagamento indevido de documentos,
   fotos ou comunicações anexadas ao chamado.
   ========================================================= */

export async function DELETE(req: Request, context: RouteContext) {
  try {
    const user = await getAuthUser();
    const { id, attachmentId } = await context.params;

    const ticketId = cleanText(id);
    const safeAttachmentId = cleanText(attachmentId);



    /* =========================================================
       VALIDAÇÃO DE AUTENTICAÇÃO
       ========================================================= */

    if (!user?.id) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }



    /* =========================================================
       VALIDAÇÃO DOS PARAMS
       ========================================================= */

    if (!ticketId) {
      return NextResponse.json(
        { error: "ID do chamado não informado." },
        { status: 400 }
      );
    }

    if (!safeAttachmentId) {
      return NextResponse.json(
        { error: "ID do anexo não informado." },
        { status: 400 }
      );
    }



    /* =========================================================
       CONTEXTO ATIVO DO USUÁRIO

       Usado para:
       - validar escopo administrativo;
       - gravar accessId, actorRole e actorLabel no log;
       - respeitar o contexto escolhido pelo usuário.
       ========================================================= */

    const activeAccess = await getActiveUserAccessFromCookies({
      userId: user.id,
    });

    const contextValidation = validateAdminAttachmentContext(activeAccess);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }

    if (!activeAccess) {
      return NextResponse.json(
        { error: "Não foi possível identificar o contexto de acesso." },
        { status: 403 }
      );
    }



    /* =========================================================
       BUSCA DO CHAMADO COM VALIDAÇÃO DE ACESSO

       ADMINISTRADORA:
       - acessa apenas chamados da carteira ativa.
       ========================================================= */

    const chamado = await db.ticket.findFirst({
      where: getAttachmentTicketWhere({
        access: activeAccess,
        ticketId,
      }),
      select: {
        id: true,
        status: true,
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
       REGRA DE NEGÓCIO

       Chamados finalizados/cancelados não permitem remoção
       de anexos, para preservar o histórico.
       ========================================================= */

    if (chamado.status === "RESOLVED" || chamado.status === "CANCELED") {
      return NextResponse.json(
        {
          error:
            "Este chamado está finalizado. Reabra o chamado antes de remover anexos.",
        },
        { status: 400 }
      );
    }



    /* =========================================================
       BLOQUEIO OPERACIONAL POR REGISTRO INATIVO

       Histórico permanece visível via GET/listagens, mas nova
       remoção operacional é bloqueada se condomínio ou
       administradora estiver inativo.
       ========================================================= */

    if (
      chamado.condominium?.status !== Status.ACTIVE ||
      chamado.condominium?.administrator?.status !== Status.ACTIVE
    ) {
      return NextResponse.json(
        {
          error:
            "O condomínio ou a administradora deste chamado está inativo. Não é possível remover anexos.",
        },
        { status: 400 }
      );
    }



    /* =========================================================
       BUSCA DO ANEXO

       O anexo precisa pertencer ao chamado informado.

       Importante:
       uploadedByUserId será usado para garantir que somente
       quem enviou o anexo possa removê-lo.
       ========================================================= */

    const attachment = await db.ticketAttachment.findFirst({
      where: {
        id: safeAttachmentId,
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
       REGRA FINAL DE EXCLUSÃO

       Quem anexou pode excluir.
       Quem não anexou apenas visualiza.

       Isso protege:
       - anexo do morador contra exclusão pelo admin;
       - anexo do síndico contra exclusão pela administradora;
       - anexo da administradora contra exclusão por outro usuário;
       - evidências do histórico do chamado.
       ========================================================= */

    if (attachment.uploadedByUserId !== user.id) {
      return NextResponse.json(
        {
          error:
            "Você só pode remover anexos enviados por você. Anexos de outros usuários ficam preservados no histórico.",
        },
        { status: 403 }
      );
    }



    /* =========================================================
       REMOVE REGISTRO DO BANCO

       Mantemos a ordem original:
       1. remove banco;
       2. tenta remover arquivo físico.

       Se o arquivo físico já não existir, não derruba a operação.
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
       REGISTRA LOG NA LINHA DO TEMPO

       Grava o contexto ativo de quem removeu.

       accessId:
       - só salva quando for UserAccess real;
       - fallback/legado/sintético grava null para não quebrar FK.
       ========================================================= */

    await db.ticketLog.create({
      data: {
        ticketId: chamado.id,
        userId: user.id,
        accessId: getDatabaseAccessId(activeAccess),
        actorRole: buildActorRole(activeAccess),
        actorLabel: buildActorLabel(activeAccess),
        action: "ATTACHMENT_REMOVED",
        comment: `Anexo removido: ${attachment.originalName}`,
      },
    });



    return NextResponse.json({
      success: true,
      removedAttachmentId: attachment.id,
    });
  } catch (error: unknown) {
    console.error("ERRO AO REMOVER ANEXO:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
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
