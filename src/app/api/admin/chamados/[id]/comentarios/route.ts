import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import {
  notifyTicketInternalTargets,
  notifyTicketPublicTargets,
} from "@/lib/notifications";
import {
  canCommentInternal,
  canCommentPublic,
  isAdministradora,
  isSuperAdmin,
} from "@/lib/access-control";
import {
  buildActorLabel,
  buildActorRole,
  getActiveUserAccessFromCookies,
  type ActiveUserAccess,
} from "@/lib/user-access";
import { Status } from "@prisma/client";



/* =========================================================
   ETAPA 18.1 - API DE COMENTÁRIOS DO CHAMADO

   Esta rota cria registros na timeline do chamado.

   Ela separa dois tipos de comunicação:

   COMMENT_INTERNAL:
   - Comentário interno da administradora/equipe.
   - Não deve aparecer no portal do morador.

   COMMENT_PUBLIC:
   - Resposta pública ao morador.
   - Deve aparecer no portal do morador.

   Rota:
   POST /api/admin/chamados/[id]/comentarios

   ETAPA 35.5:
   - Rota administrativa exclusiva para SUPER_ADMIN / ADMINISTRADORA.
   - SÍNDICO, MORADOR e PROPRIETÁRIO comentam pelo portal.
   - Comentários são bloqueados em chamados finalizados.
   - ADMINISTRADORA só comenta em chamados da própria carteira.
   - Comentário público atualiza firstResponseAt quando aplicável.
   - Comentário interno nunca notifica morador.
   - Uso de enums Prisma Role / Status para evitar erro de tipagem.

   ETAPA 40.3 — AUDITORIA DOS CHAMADOS PONTA A PONTA

   Ajustes desta revisão:
   - Comparações de perfil passam a usar helpers da matriz central.
   - COMMENT_INTERNAL agora valida canCommentInternal().
   - COMMENT_PUBLIC mantém validação canCommentPublic().
   - accessId só é gravado quando for UserAccess real.
   - Contexto legado/fallback não é bloqueado apenas por accessId nulo.
   - Mantido COMMENT_INTERNAL fora do portal.
   - Mantida notificação pública apenas para morador/criador.
   - Mantida notificação interna apenas para operação/admin/responsável.
   ========================================================= */



type Params = {
  params: Promise<{
    id: string;
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
   NORMALIZA O TIPO DE COMENTÁRIO RECEBIDO DO FRONT

   O front poderá enviar:

   type: "internal"
   ou
   type: "public"

   A API converte para os valores oficiais salvos em TicketLog.action.
   ========================================================= */

function resolveCommentAction(type: unknown) {
  if (type === "public") {
    return "COMMENT_PUBLIC";
  }

  return "COMMENT_INTERNAL";
}



/* =========================================================
   USUÁRIO COM CONTEXTO ATIVO

   A sessão base identifica quem está logado.
   O contexto ativo define com qual papel/carteira ele está
   operando naquele momento.
   ========================================================= */

async function getCommentContextUser() {
  const sessionUser: any = await getAuthUser();

  if (!sessionUser?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const activeAccess: ActiveUserAccess | null =
    await getActiveUserAccessFromCookies({
      userId: sessionUser.id,
    });

  if (!activeAccess) {
    return {
      ...sessionUser,
      activeAccess: null,
    };
  }

  return {
    ...sessionUser,

    role: activeAccess.role || sessionUser.role,

    administratorId:
      activeAccess.administratorId !== undefined
        ? activeAccess.administratorId
        : sessionUser.administratorId,

    condominiumId:
      activeAccess.condominiumId !== undefined
        ? activeAccess.condominiumId
        : sessionUser.condominiumId,

    unitId:
      activeAccess.unitId !== undefined
        ? activeAccess.unitId
        : sessionUser.unitId,

    residentId:
      activeAccess.residentId !== undefined
        ? activeAccess.residentId
        : sessionUser.residentId,

    activeAccess,
  };
}



/* =========================================================
   VALIDA CONTEXTO DA ROTA ADMINISTRATIVA

   Permitidos:
   - SUPER_ADMIN
   - ADMINISTRADORA

   Bloqueados:
   - SINDICO
   - MORADOR
   - PROPRIETARIO
   - CONSELHEIRO

   Observação:
   Síndico, morador e proprietário comentam pela rota do portal.
   ========================================================= */

function validateCommentContext(user: any) {
  if (!user?.activeAccess) {
    return {
      ok: false,
      status: 403,
      message: "Não foi possível identificar o contexto de acesso.",
    };
  }

  if (!isSuperAdmin(user) && !isAdministradora(user)) {
    return {
      ok: false,
      status: 403,
      message:
        "Este contexto não possui acesso à rota administrativa de comentários. Use o portal.",
    };
  }

  if (isAdministradora(user) && !user.administratorId) {
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
   FILTRO DO CHAMADO PELO CONTEXTO ATIVO

   SUPER_ADMIN:
   - acessa todos.

   ADMINISTRADORA:
   - acessa chamados da administradora ativa.

   Demais perfis:
   - bloqueados antes deste filtro.
   ========================================================= */

function getTicketWhereByContext(user: any, ticketId: string) {
  if (isSuperAdmin(user)) {
    return {
      id: ticketId,
    };
  }

  if (isAdministradora(user) && user.administratorId) {
    return {
      id: ticketId,
      condominium: {
        administratorId: user.administratorId,
      },
    };
  }

  return {
    id: "__NO_ACCESS__",
  };
}



/* =========================================================
   POST - CRIAR COMENTÁRIO NO CHAMADO
   ========================================================= */

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const authUser: any = await getCommentContextUser();
    const { id } = await params;

    const ticketId = cleanText(id);

    if (!ticketId) {
      return NextResponse.json(
        { error: "ID do chamado não informado." },
        { status: 400 }
      );
    }



    /* =========================================================
       VALIDAR CONTEXTO ADMINISTRATIVO
       ========================================================= */

    const contextValidation = validateCommentContext(authUser);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }



    const activeAccess = authUser.activeAccess as ActiveUserAccess | null;

    if (!activeAccess) {
      return NextResponse.json(
        { error: "Contexto ativo inválido para registrar comentário." },
        { status: 403 }
      );
    }



    /* =========================================================
       VALIDAR CONTEÚDO DO COMENTÁRIO
       ========================================================= */

    const body = await request.json();

    const comment = cleanText(body?.comment);
    const type = body?.type;

    if (!comment) {
      return NextResponse.json(
        { error: "Informe o comentário." },
        { status: 400 }
      );
    }

    const action = resolveCommentAction(type);



    /* =========================================================
       PERMISSÕES DE COMENTÁRIO

       COMMENT_PUBLIC:
       - exige COMMENT_PUBLIC.

       COMMENT_INTERNAL:
       - exige COMMENT_INTERNAL.
       - nunca aparece no portal.
       ========================================================= */

    if (action === "COMMENT_PUBLIC" && !canCommentPublic(authUser)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para responder publicamente." },
        { status: 403 }
      );
    }

    if (action === "COMMENT_INTERNAL" && !canCommentInternal(authUser)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para registrar comentário interno." },
        { status: 403 }
      );
    }



    /* =========================================================
       BUSCA O CHAMADO

       A busca respeita o contexto ativo administrativo:

       - SUPER_ADMIN: qualquer chamado;
       - ADMINISTRADORA: apenas carteira ativa.
       ========================================================= */

    const ticket = await db.ticket.findFirst({
      where: getTicketWhereByContext(authUser, ticketId),
      include: {
        condominium: {
          select: {
            id: true,
            name: true,
            administratorId: true,
            status: true,
            administrator: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
        },

        unit: true,

        resident: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
              },
            },
          },
        },

        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
          },
        },

        assignedToUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: "Chamado não encontrado ou sem permissão de acesso." },
        { status: 404 }
      );
    }



    /* =========================================================
       BLOQUEIOS OPERACIONAIS

       Histórico continua preservado, mas novas comunicações são
       bloqueadas quando:
       - chamado está finalizado;
       - condomínio/administradora estão inativos.
       ========================================================= */

    if (ticket.status === "RESOLVED" || ticket.status === "CANCELED") {
      return NextResponse.json(
        {
          error:
            "Este chamado está finalizado. Reabra o chamado antes de adicionar comunicação.",
        },
        { status: 400 }
      );
    }

    if (
      ticket.condominium?.status !== Status.ACTIVE ||
      ticket.condominium?.administrator?.status !== Status.ACTIVE
    ) {
      return NextResponse.json(
        {
          error:
            "O condomínio ou a administradora deste chamado está inativo. Não é possível adicionar nova comunicação.",
        },
        { status: 400 }
      );
    }



    /* =========================================================
       CRIA O LOG DO COMENTÁRIO

       action:
       - COMMENT_INTERNAL
       - COMMENT_PUBLIC

       accessId:
       - salvo apenas quando for UserAccess real;
       - fallback/legado grava null para não quebrar FK.

       actorRole / actorLabel:
       - sempre gravados para manter auditoria.
       ========================================================= */

    const dbAccessId = getDatabaseAccessId(activeAccess);

    const log = await db.ticketLog.create({
      data: {
        ticketId: ticket.id,
        userId: authUser.id,
        accessId: dbAccessId,
        actorRole: buildActorRole(activeAccess),
        actorLabel: buildActorLabel(activeAccess),
        action,
        comment,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        access: true,
      },
    });



    /* =========================================================
       PRIMEIRA RESPOSTA

       Se for uma resposta pública ao morador e o chamado ainda
       não tiver firstResponseAt, gravamos este momento como
       primeira resposta.
       ========================================================= */

    if (action === "COMMENT_PUBLIC" && !ticket.firstResponseAt) {
      await db.ticket.update({
        where: {
          id: ticket.id,
        },
        data: {
          firstResponseAt: new Date(),
        },
      });
    }



    /* =========================================================
       METADADOS PADRÃO DA NOTIFICAÇÃO

       Inclui contexto ativo do usuário que criou o comentário.
       ========================================================= */

    const notificationMetadata = {
      commentPreview: comment.substring(0, 180),
      action,

      /*
        Metadata pode receber o accessId sintético.
        O que não pode é salvar accessId sintético em FK.
      */
      accessId: activeAccess.accessId,
      accessSource: activeAccess.source,

      actorRole: buildActorRole(activeAccess),
      actorLabel: buildActorLabel(activeAccess),
      createdByUserId: authUser.id,
      createdByUserName: authUser.name,
      createdByUserRole: activeAccess.role,
    };



    /* =========================================================
       NOTIFICAÇÃO DE RESPOSTA PÚBLICA

       COMMENT_PUBLIC:
       - notifica morador/criador;
       - evita duplicidade;
       - evita notificar quem executou a ação.
       ========================================================= */

    if (action === "COMMENT_PUBLIC") {
      await notifyTicketPublicTargets({
        ticket,
        actorUser: {
          id: authUser.id,
          name: authUser.name,
          email: authUser.email,
          role: activeAccess.role,
        },
        type: "TICKET_PUBLIC_COMMENT",
        title: "Nova resposta no chamado",
        message: `O chamado "${ticket.title}" recebeu uma nova resposta.`,
        metadata: notificationMetadata,
      });
    }



    /* =========================================================
       NOTIFICAÇÃO DE COMENTÁRIO INTERNO

       COMMENT_INTERNAL:
       - notifica usuários da administradora da carteira;
       - notifica responsável atribuído, se não for morador;
       - nunca notifica morador;
       - evita duplicidades;
       - evita notificar quem executou a ação.
       ========================================================= */

    if (action === "COMMENT_INTERNAL") {
      await notifyTicketInternalTargets({
        ticket,
        actorUser: {
          id: authUser.id,
          name: authUser.name,
          email: authUser.email,
          role: activeAccess.role,
        },
        type: "TICKET_INTERNAL_COMMENT",
        title: "Novo comentário interno",
        message: `O chamado "${ticket.title}" recebeu um comentário interno.`,
        metadata: notificationMetadata,
      });
    }



    return NextResponse.json({
      success: true,
      message:
        action === "COMMENT_PUBLIC"
          ? "Resposta ao morador registrada com sucesso."
          : "Comentário interno registrado com sucesso.",
      log,
    });
  } catch (error: any) {
    console.error("Erro ao criar comentário no chamado:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro interno ao criar comentário no chamado." },
      { status: 500 }
    );
  }
}