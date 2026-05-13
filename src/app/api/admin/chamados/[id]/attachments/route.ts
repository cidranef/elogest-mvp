import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { Status } from "@prisma/client";
import {
  canUploadAttachment,
  isAdministradora,
  isSuperAdmin,
} from "@/lib/access-control";
import {
  buildActorLabel,
  buildActorRole,
  getActiveUserAccessFromCookies,
  type ActiveUserAccess,
} from "@/lib/user-access";



/* =========================================================
   RUNTIME NODE

   Necessário porque esta rota usa fs/promises para salvar
   arquivos localmente dentro de /public/uploads.
   ========================================================= */

export const runtime = "nodejs";



/* =========================================================
   TIPAGEM DA ROTA DINÂMICA
   ========================================================= */

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};



/* =========================================================
   CONFIGURAÇÕES DO UPLOAD
   ========================================================= */

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

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



/* =========================================================
   FUNÇÃO AUXILIAR - EXTENSÃO SEGURA
   ========================================================= */

function getSafeExtension(filename: string) {
  const ext = path.extname(filename || "").toLowerCase();

  if (!ext) return "";

  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

  if (!allowedExtensions.includes(ext)) {
    return "";
  }

  return ext;
}



/* =========================================================
   ACCESS ID SEGURO PARA BANCO

   UserAccess real pode ser salvo como FK.
   Contexto fallback/sintético não existe na tabela UserAccess,
   então deve gravar null em TicketLog.accessId.
   ========================================================= */

function getDatabaseAccessId(access: ActiveUserAccess | null) {
  if (!access) {
    return null;
  }

  return access.source === "USER_ACCESS" ? access.accessId : null;
}



/* =========================================================
   ETAPA 35.5 - USUÁRIO COM CONTEXTO ATIVO

   A sessão base identifica quem está logado.
   O contexto ativo define com qual papel/carteira ele está
   operando naquele momento.

   Decisão de segurança:
   - Rotas /api/admin/... são exclusivas para:
     SUPER_ADMIN
     ADMINISTRADORA

   Portanto:
   - SÍNDICO deve usar rotas do portal.
   - MORADOR / PROPRIETÁRIO também devem usar rotas do portal.

   ETAPA 40.3 — AUDITORIA DOS CHAMADOS PONTA A PONTA

   Ajustes desta revisão:
   - Perfis administrativos passam a ser validados por helpers
     da matriz central.
   - Upload passa a validar canUploadAttachment().
   - accessId só é salvo quando for UserAccess real.
   - ID da rota é normalizado.
   - Mantidas as validações de tipo, tamanho e extensão.
   ========================================================= */

async function getAdminAttachmentContextUser() {
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
   VALIDA ACESSO ADMINISTRATIVO

   Permitidos nesta rota:
   - SUPER_ADMIN
   - ADMINISTRADORA

   Bloqueados:
   - SINDICO
   - MORADOR
   - PROPRIETARIO
   - CONSELHEIRO
   ========================================================= */

function canUseAdminAttachmentRoute(user: any) {
  return isSuperAdmin(user) || isAdministradora(user);
}



/* =========================================================
   VALIDAÇÃO DO CONTEXTO

   ADMINISTRADORA:
   precisa ter administratorId ativo.

   SUPER_ADMIN:
   pode seguir sem administratorId.

   SÍNDICO / MORADOR / PROPRIETÁRIO:
   bloqueados nesta rota administrativa.
   ========================================================= */

function validateAdminAttachmentContext(user: any) {
  if (!user?.activeAccess) {
    return {
      ok: false,
      status: 403,
      message: "Não foi possível identificar o contexto de acesso.",
    };
  }

  if (!canUseAdminAttachmentRoute(user)) {
    return {
      ok: false,
      status: 403,
      message:
        "Este contexto não possui acesso à rota administrativa de anexos. Use o portal.",
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
   FILTRO DE ACESSO AO CHAMADO

   SUPER_ADMIN:
   - pode acessar qualquer chamado.

   ADMINISTRADORA:
   - acessa chamados da administradora ativa.

   Demais perfis:
   - bloqueados antes deste filtro.
   ========================================================= */

function getAttachmentTicketWhere({
  user,
  ticketId,
}: {
  user: any;
  ticketId: string;
}) {
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
   GARANTE UM ACTIVE ACCESS PARA LOGS

   A rota precisa gravar:
   - accessId quando for UserAccess real;
   - actorRole;
   - actorLabel.

   Se não houver contexto ativo, bloqueia para evitar log sem
   rastreabilidade.
   ========================================================= */

function getRequiredActiveAccess(user: any): ActiveUserAccess | null {
  return user?.activeAccess || null;
}



/* =========================================================
   GET - LISTAR ANEXOS DO CHAMADO

   Observação:
   - O GET preserva histórico.
   - Mesmo se o condomínio/chamado estiver inativo/finalizado,
     os anexos antigos podem continuar visíveis para quem tem
     permissão administrativa.
   ========================================================= */

export async function GET(req: Request, context: RouteContext) {
  try {
    const user: any = await getAdminAttachmentContextUser();
    const { id } = await context.params;

    const ticketId = cleanText(id);

    if (!ticketId) {
      return NextResponse.json(
        { error: "ID do chamado não informado." },
        { status: 400 }
      );
    }

    const contextValidation = validateAdminAttachmentContext(user);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }

    const chamado = await db.ticket.findFirst({
      where: getAttachmentTicketWhere({
        user,
        ticketId,
      }),
      select: {
        id: true,
      },
    });

    if (!chamado) {
      return NextResponse.json(
        { error: "Chamado não encontrado ou acesso negado." },
        { status: 404 }
      );
    }

    const attachments = await db.ticketAttachment.findMany({
      where: {
        ticketId: chamado.id,
      },
      include: {
        uploadedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(attachments);
  } catch (error: any) {
    console.error("ERRO AO LISTAR ANEXOS:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao listar anexos." },
      { status: 500 }
    );
  }
}



/* =========================================================
   POST - ENVIAR ANEXO DO CHAMADO

   Regras:
   - exige contexto ativo;
   - restrito a SUPER_ADMIN / ADMINISTRADORA;
   - exige permissão UPLOAD_ATTACHMENT;
   - chamado não pode estar RESOLVED ou CANCELED;
   - condomínio e administradora do chamado precisam estar ativos;
   - arquivo deve respeitar tipo e tamanho;
   - grava log com actorRole e actorLabel.
   ========================================================= */

export async function POST(req: Request, context: RouteContext) {
  try {
    const user: any = await getAdminAttachmentContextUser();
    const { id } = await context.params;

    const ticketId = cleanText(id);

    if (!ticketId) {
      return NextResponse.json(
        { error: "ID do chamado não informado." },
        { status: 400 }
      );
    }

    const contextValidation = validateAdminAttachmentContext(user);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }

    if (!canUploadAttachment(user)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para anexar arquivos." },
        { status: 403 }
      );
    }

    const activeAccess = getRequiredActiveAccess(user);

    if (!activeAccess) {
      return NextResponse.json(
        { error: "Não foi possível identificar o contexto de acesso." },
        { status: 403 }
      );
    }



    /* =========================================================
       BUSCA DO CHAMADO E VALIDAÇÃO DE ACESSO

       SUPER_ADMIN:
       - acessa qualquer chamado.

       ADMINISTRADORA:
       - acessa apenas chamados da carteira ativa.
       ========================================================= */

    const chamado = await db.ticket.findFirst({
      where: getAttachmentTicketWhere({
        user,
        ticketId,
      }),
      select: {
        id: true,
        title: true,
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

       Chamado finalizado/cancelado não recebe novos anexos.
       Os anexos antigos continuam visíveis.
       ========================================================= */

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
       BLOQUEIO OPERACIONAL POR REGISTRO INATIVO

       Histórico permanece visível via GET, mas novo upload é
       bloqueado se condomínio ou administradora estiver inativo.
       ========================================================= */

    if (
      chamado.condominium?.status !== Status.ACTIVE ||
      chamado.condominium?.administrator?.status !== Status.ACTIVE
    ) {
      return NextResponse.json(
        {
          error:
            "O condomínio ou a administradora deste chamado está inativo. Não é possível anexar novos arquivos.",
        },
        { status: 400 }
      );
    }



    /* =========================================================
       LEITURA DO FORM DATA
       ========================================================= */

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado." },
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

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Arquivo muito grande. Limite máximo: 10 MB." },
        { status: 400 }
      );
    }

    const extension = getSafeExtension(file.name);

    if (!extension) {
      return NextResponse.json(
        { error: "Extensão de arquivo inválida." },
        { status: 400 }
      );
    }



    /* =========================================================
       SALVAMENTO FÍSICO DO ARQUIVO

       Caminho final:
       /public/uploads/chamados/[ticketId]/arquivo.ext
       ========================================================= */

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadDir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "chamados",
      chamado.id
    );

    await mkdir(uploadDir, { recursive: true });

    const storedName = `${randomUUID()}${extension}`;
    const fullPath = path.join(uploadDir, storedName);

    await writeFile(fullPath, buffer);

    const publicUrl = `/uploads/chamados/${chamado.id}/${storedName}`;



    /* =========================================================
       REGISTRO NO BANCO
       ========================================================= */

    const attachment = await db.ticketAttachment.create({
      data: {
        ticketId: chamado.id,
        uploadedByUserId: user.id,
        originalName: file.name,
        storedName,
        mimeType: file.type,
        sizeBytes: file.size,
        url: publicUrl,
      },
      include: {
        uploadedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });



    /* =========================================================
       LOG NA LINHA DO TEMPO

       Grava o contexto ativo de quem anexou.

       accessId:
       - só salva quando for UserAccess real;
       - fallback/legado/sintético grava null.
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
        comment: `Anexo enviado: ${file.name}`,
      },
    });

    return NextResponse.json(attachment);
  } catch (error: any) {
    console.error("ERRO AO ENVIAR ANEXO:", error);

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