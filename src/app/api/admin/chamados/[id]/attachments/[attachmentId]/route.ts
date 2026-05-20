import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { Status } from "@prisma/client";
import { canDeleteAttachment } from "@/lib/access-control";
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
       REMOVE ARQUIVO FÍSICO

       O arquivo está salvo em:
       /public/uploads/chamados/[ticketId]/[storedName]

       Se a remoção física falhar, não derrubamos a operação,
       pois o registro do banco já foi removido.
       ========================================================= */

    try {
      const filePath = path.join(
        process.cwd(),
        "public",
        "uploads",
        "chamados",
        chamado.id,
        attachment.storedName
      );

      await unlink(filePath);
    } catch (fileError) {
      console.warn("Arquivo físico não removido ou já inexistente:", fileError);
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
