import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { Status } from "@prisma/client";
import {
  canUploadAttachment,
  isMorador,
  isProprietario,
  isSindico,
} from "@/lib/access-control";
import {
  buildActorLabel,
  buildActorRole,
  getActiveUserAccessFromCookies,
  isPortalAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";



/* =========================================================
   PORTAL - UPLOAD DE ANEXOS DO CHAMADO

   ETAPA 35.6 — REVISÃO DO PORTAL DE CHAMADOS

   Regras:
   - ADMINISTRADORA / SUPER_ADMIN não usam esta rota do portal.
   - MORADOR / PROPRIETÁRIO só anexam em chamados da própria unidade
     do contexto ativo.
   - SÍNDICO só anexa em chamados do condomínio do contexto ativo.
   - Chamado resolvido/cancelado não aceita novo anexo.
   - Usuário inativo não pode anexar.
   - Condomínio/administradora inativos bloqueiam novo anexo.
   - Unidade inativa bloqueia novo anexo para MORADOR / PROPRIETÁRIO.
   - Morador inativo bloqueia novo anexo quando houver residentId
     no contexto ativo.
   - Contextos sintéticos não são gravados em TicketLog.accessId.
   - actorRole e actorLabel sempre preservam o contexto ativo.

   CORREÇÃO TYPESCRIPT:
   - Validação direta de user null antes de usar user.id.
   - Evita erro TS18047: 'user' is possibly 'null'.

   ETAPA 40.3 — AUDITORIA DOS CHAMADOS PONTA A PONTA

   Ajustes desta revisão:
   - Upload passa a validar canUploadAttachment().
   - Identificação de perfil passa a usar helpers da matriz central.
   - ID da rota é normalizado.
   - Mantida proteção para accessId sintético não ser salvo como FK.
   - Mantidos bloqueios por chamado finalizado e registros inativos.
   ========================================================= */

export const runtime = "nodejs";



type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};



const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];



/* =========================================================
   HELPERS
   ========================================================= */

function cleanText(value: unknown) {
  return String(value || "").trim();
}



function isResidentialPortalAccess(access?: ActiveUserAccess | null) {
  return isMorador(access) || isProprietario(access);
}



function isSindicoPortalAccess(access?: ActiveUserAccess | null) {
  return isSindico(access);
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



/* =========================================================
   BUSCAR USUÁRIO DO PORTAL

   Mantido para:
   - nome;
   - e-mail;
   - compatibilidade com dados antigos;
   - uploadedByUserId.
   ========================================================= */

async function getPortalUser(authUserId: string) {
  return db.user.findUnique({
    where: {
      id: authUserId,
    },
    include: {
      resident: {
        include: {
          unit: true,
          condominium: {
            include: {
              administrator: true,
            },
          },
        },
      },
      condominium: {
        include: {
          administrator: true,
        },
      },
    },
  });
}



/* =========================================================
   FILTRO DE ACESSO DO CHAMADO

   Usa o contexto ativo em vez dos campos legados do usuário.
   ========================================================= */

function getPortalTicketWhere({
  user,
  access,
  ticketId,
}: {
  user: any;
  access: ActiveUserAccess;
  ticketId: string;
}) {
  if (isResidentialPortalAccess(access)) {
    if (!access.condominiumId || !access.unitId) {
      return {
        id: "__NO_ACCESS__",
      };
    }

    const ownershipConditions: any[] = [
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

  if (isSindicoPortalAccess(access)) {
    if (!access.condominiumId) {
      return {
        id: "__NO_ACCESS__",
      };
    }

    return {
      id: ticketId,
      condominiumId: access.condominiumId,
    };
  }

  return {
    id: "__NO_ACCESS__",
  };
}



/* =========================================================
   VALIDAR REGISTROS ATIVOS PARA NOVO ANEXO

   Histórico continua visível nas telas, mas novo upload é
   ação operacional. Portanto bloqueamos quando registros
   essenciais estão inativos.
   ========================================================= */

async function validatePortalAttachmentOperation({
  access,
  chamado,
}: {
  access: ActiveUserAccess;
  chamado: any;
}) {
  if (
    chamado.condominium?.status !== Status.ACTIVE ||
    chamado.condominium?.administrator?.status !== Status.ACTIVE
  ) {
    return {
      ok: false,
      status: 400,
      message:
        "O condomínio ou a administradora deste chamado está inativo. Não é possível anexar novos arquivos.",
    };
  }

  if (isResidentialPortalAccess(access)) {
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
          "Unidade não encontrada ou inativa. Não é possível anexar arquivos.",
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

  if (isSindicoPortalAccess(access)) {
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
   HELPERS DO ARQUIVO
   ========================================================= */

function getSafeExtension(fileName: string, mimeType: string) {
  const extFromName = path.extname(fileName || "").toLowerCase();

  if ([".jpg", ".jpeg", ".png", ".webp", ".pdf"].includes(extFromName)) {
    return extFromName;
  }

  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "application/pdf") return ".pdf";

  return "";
}



function sanitizeOriginalName(name: string) {
  return (name || "arquivo")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}



/* =========================================================
   POST - ENVIAR ANEXO PELO PORTAL
   ========================================================= */

export async function POST(req: Request, context: RouteContext) {
  try {
    const authUser: any = await getAuthUser();
    const { id } = await context.params;

    const ticketId = cleanText(id);

    if (!authUser?.id) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (!ticketId) {
      return NextResponse.json(
        { error: "ID do chamado não informado." },
        { status: 400 }
      );
    }

    const [user, activeAccess] = await Promise.all([
      getPortalUser(authUser.id),
      getActiveUserAccessFromCookies({
        userId: authUser.id,
      }),
    ]);



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



    if (!activeAccess || !isPortalAccess(activeAccess)) {
      return NextResponse.json(
        {
          error:
            "Este portal é destinado a síndicos, proprietários e moradores.",
        },
        { status: 403 }
      );
    }

    if (!canUploadAttachment(activeAccess)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para anexar arquivos." },
        { status: 403 }
      );
    }



    /* =========================================================
       BUSCA DO CHAMADO COM VALIDAÇÃO DE CONTEXTO

       MORADOR / PROPRIETÁRIO:
       - somente chamados da unidade do contexto ativo.

       SÍNDICO:
       - somente chamados do condomínio do contexto ativo.

       Incluímos condomínio/administradora para validar registros ativos.
       ========================================================= */

    const chamado = await db.ticket.findFirst({
      where: getPortalTicketWhere({
        user,
        access: activeAccess,
        ticketId,
      }),
      include: {
        condominium: {
          include: {
            administrator: true,
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

    if (chamado.status === "RESOLVED" || chamado.status === "CANCELED") {
      return NextResponse.json(
        {
          error:
            "Este chamado está finalizado. Reabra o chamado antes de anexar arquivos.",
        },
        { status: 400 }
      );
    }



    /* =========================================================
       BLOQUEIO OPERACIONAL POR REGISTROS INATIVOS
       ========================================================= */

    const operationValidation = await validatePortalAttachmentOperation({
      access: activeAccess,
      chamado,
    });

    if (!operationValidation.ok) {
      return NextResponse.json(
        { error: operationValidation.message },
        { status: operationValidation.status }
      );
    }



    /* =========================================================
       LEITURA DO FORM DATA
       ========================================================= */

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Arquivo não enviado." },
        { status: 400 }
      );
    }



    /* =========================================================
       VALIDAÇÕES DO ARQUIVO
       ========================================================= */

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error:
            "Tipo de arquivo não permitido. Envie JPG, PNG, WEBP ou PDF.",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Arquivo acima do limite de 10 MB." },
        { status: 400 }
      );
    }

    const extension = getSafeExtension(file.name, file.type);

    if (!extension) {
      return NextResponse.json(
        { error: "Extensão de arquivo inválida." },
        { status: 400 }
      );
    }



    /* =========================================================
       SALVAMENTO FÍSICO
       ========================================================= */

    const originalName = sanitizeOriginalName(file.name);
    const storedName = `${Date.now()}-${crypto.randomUUID()}${extension}`;

    const uploadDir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "chamados",
      chamado.id
    );

    await mkdir(uploadDir, {
      recursive: true,
    });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const filePath = path.join(uploadDir, storedName);

    await writeFile(filePath, buffer);

    const url = `/uploads/chamados/${chamado.id}/${storedName}`;



    /* =========================================================
       REGISTRO DO ANEXO
       ========================================================= */

    const attachment = await db.ticketAttachment.create({
      data: {
        ticketId: chamado.id,
        uploadedByUserId: user.id,
        originalName,
        storedName,
        mimeType: file.type,
        sizeBytes: file.size,
        url,
      },
      include: {
        uploadedByUser: true,
      },
    });



    /* =========================================================
       LOG NA LINHA DO TEMPO

       accessId:
       - só salva quando for UserAccess real;
       - contexto sintético grava null para não quebrar FK.
       ========================================================= */

    const dbAccessId = getDatabaseAccessId(activeAccess);

    await db.ticketLog.create({
      data: {
        ticketId: chamado.id,
        userId: user.id,
        accessId: dbAccessId,
        actorRole: buildActorRole(activeAccess),
        actorLabel: buildActorLabel(activeAccess),
        action: "ATTACHMENT_ADDED",
        comment: `Anexo enviado pelo portal: ${originalName}`,
      },
    });

    return NextResponse.json(attachment);
  } catch (error: any) {
    console.error("ERRO AO ENVIAR ANEXO PELO PORTAL:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao enviar anexo." },
      { status: 500 }
    );
  }
}