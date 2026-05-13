import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { Role, Status } from "@prisma/client";
import {
  buildActorLabel,
  buildActorRole,
  getActiveUserAccessFromCookies,
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
   FILTRO DE ACESSO AO CHAMADO

   SUPER_ADMIN:
   - pode acessar qualquer chamado apenas quando estiver
     em contexto SUPER_ADMIN.

   ADMINISTRADORA:
   - acessa chamados da administradora vinculada ao contexto ativo.

   SÍNDICO:
   - não acessa esta rota administrativa.
   - deve usar a rota do portal.

   MORADOR / PROPRIETÁRIO:
   - não acessam esta rota administrativa.
   - usam as rotas do portal.
   ========================================================= */

function getAttachmentTicketWhere({
  access,
  ticketId,
}: {
  access: ActiveUserAccess;
  ticketId: string;
}) {
  if (access.role === Role.SUPER_ADMIN) {
    return {
      id: ticketId,
    };
  }

  if (access.role === Role.ADMINISTRADORA) {
    return {
      id: ticketId,
      condominium: {
        administratorId: access.administratorId || undefined,
      },
    };
  }

  return {
    id: "__blocked__",
  };
}



/* =========================================================
   VALIDA ACESSO ADMINISTRATIVO

   Permitidos nesta rota:
   - SUPER_ADMIN
   - ADMINISTRADORA

   Bloqueados:
   - SINDICO
   - MORADOR
   - PROPRIETARIO
   - CONSELHEIRO

   Observação importante:
   Isso valida acesso ao chamado. A exclusão do anexo tem uma
   segunda regra mais restrita: somente quem enviou pode excluir.
   ========================================================= */

function canUseAdminAttachmentRoute(access: ActiveUserAccess | null) {
  if (!access) return false;

  return access.role === Role.SUPER_ADMIN || access.role === Role.ADMINISTRADORA;
}



/* =========================================================
   VALIDA CONTEXTO ATIVO

   ADMINISTRADORA:
   - precisa ter administratorId no contexto ativo.

   SUPER_ADMIN:
   - pode seguir sem administratorId.

   SÍNDICO / MORADOR / PROPRIETÁRIO:
   - devem usar as rotas do portal.

   Essa validação evita que um contexto incompleto gere filtro
   fraco com undefined.
   ========================================================= */

function validateAdminAttachmentContext(access: ActiveUserAccess | null) {
  if (!access) {
    return {
      ok: false,
      status: 403,
      message: "Não foi possível identificar o contexto de acesso.",
    };
  }

  if (!canUseAdminAttachmentRoute(access)) {
    return {
      ok: false,
      status: 403,
      message:
        "Este contexto não possui acesso à rota administrativa de remoção de anexos. Use o portal.",
    };
  }

  if (access.role === Role.ADMINISTRADORA && !access.administratorId) {
    return {
      ok: false,
      status: 403,
      message: "Contexto de administradora sem vínculo com administradora.",
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
   - Super Admin também não remove anexo de outro usuário por esta rota.
   - Chamados resolvidos/cancelados não permitem remoção.
   - Condomínio/administradora inativos não permitem nova remoção operacional.

   Motivo:
   Preservar evidências e evitar apagamento indevido de documentos,
   fotos ou comunicações anexadas ao chamado.
   ========================================================= */

export async function DELETE(req: Request, context: RouteContext) {
  try {
    const user: any = await getAuthUser();
    const { id, attachmentId } = await context.params;



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



    /* =========================================================
       BUSCA DO CHAMADO COM VALIDAÇÃO DE ACESSO

       SUPER_ADMIN:
       - acessa qualquer chamado.

       ADMINISTRADORA:
       - acessa apenas chamados da carteira ativa.
       ========================================================= */

    const chamado = await db.ticket.findFirst({
      where: getAttachmentTicketWhere({
        access: activeAccess!,
        ticketId: id,
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
        id: attachmentId,
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
       ========================================================= */

    await db.ticketLog.create({
      data: {
        ticketId: chamado.id,
        userId: user.id,
        accessId: activeAccess!.accessId,
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
  } catch (error: any) {
    console.error("ERRO AO REMOVER ANEXO:", error);

    if (error.message === "UNAUTHORIZED") {
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