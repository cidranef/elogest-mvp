import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import { getAuthUser } from "@/lib/auth-guard";
import {
  getActiveUserAccessFromCookies,
  isAdministradoraAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";
import { canManageCondominiums } from "@/lib/access-control";



/* =========================================================
   UPLOAD DE FACHADA DO CONDOMÍNIO

   ETAPA 45.2 — IMAGEM DA FACHADA

   Objetivo:
   - Receber imagem já redimensionada pelo front-end.
   - Salvar em /public/uploads/condominios/fachadas.
   - Retornar o caminho público para gravar em facadeImagePath.

   Segurança:
   - Exige administradora ativa.
   - Exige perfil ativo de ADMINISTRADORA.
   - Exige permissão MANAGE_CONDOMINIUMS.
   - Não aceita SUPER_ADMIN nesta rota /admin.

   Observação:
   - Para MVP/local funciona bem.
   - Em produção definitiva, principalmente em Railway, o ideal
     é migrar uploads para Cloudflare R2, S3 ou storage equivalente.
   ========================================================= */

export const runtime = "nodejs";



/* =========================================================
   TYPES
   ========================================================= */

type AuthSessionUser = {
  id: string;
  role?: string | null;
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
};



type AdminContextUser = AuthSessionUser & {
  activeAccess: ActiveUserAccess | null;
};



type ContextValidationResult =
  | {
      ok: true;
      status: 200;
      message: "";
    }
  | {
      ok: false;
      status: 403;
      message: string;
    };



/* =========================================================
   HELPERS
   ========================================================= */

async function getAdminContextUser(): Promise<AdminContextUser> {
  const sessionUser = (await getAuthUser()) as AuthSessionUser | null;

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



function validateAdminContext(user: AdminContextUser): ContextValidationResult {
  const activeAccess = user.activeAccess;

  if (!activeAccess) {
    return {
      ok: false,
      status: 403,
      message: "Não foi possível identificar o contexto de acesso.",
    };
  }

  if (!isAdministradoraAccess(activeAccess)) {
    return {
      ok: false,
      status: 403,
      message:
        "Este contexto não possui acesso ao upload de fachada de condomínios.",
    };
  }

  if (!activeAccess.administratorId) {
    return {
      ok: false,
      status: 403,
      message: "Contexto de administradora sem vínculo com administradora.",
    };
  }

  if (!canManageCondominiums(activeAccess)) {
    return {
      ok: false,
      status: 403,
      message: "Usuário sem permissão para gerenciar condomínios.",
    };
  }

  return {
    ok: true,
    status: 200,
    message: "",
  };
}



function getFileExtension(file: File) {
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";

  return "";
}



/* =========================================================
   POST - UPLOAD DA FACHADA
   ========================================================= */

export async function POST(req: Request) {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const user = await getAdminContextUser();
    const contextValidation = validateAdminContext(user);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }

    const formData = await req.formData();
    const uploadedFile = formData.get("file");

    if (!(uploadedFile instanceof File)) {
      return NextResponse.json(
        { error: "Arquivo de imagem não enviado." },
        { status: 400 }
      );
    }

    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedMimeTypes.includes(uploadedFile.type)) {
      return NextResponse.json(
        {
          error: "Formato inválido. Envie uma imagem JPG, PNG ou WEBP.",
        },
        { status: 400 }
      );
    }

    const maxSizeInBytes = 2 * 1024 * 1024;

    if (uploadedFile.size > maxSizeInBytes) {
      return NextResponse.json(
        {
          error:
            "Imagem muito grande. O arquivo final deve ter no máximo 2MB.",
        },
        { status: 400 }
      );
    }

    const extension = getFileExtension(uploadedFile);

    if (!extension) {
      return NextResponse.json(
        { error: "Não foi possível identificar o formato da imagem." },
        { status: 400 }
      );
    }

    const uploadDir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "condominios",
      "fachadas"
    );

    await mkdir(uploadDir, {
      recursive: true,
    });

    const fileName = `${Date.now()}-${randomUUID()}.${extension}`;
    const diskPath = path.join(uploadDir, fileName);
    const publicPath = `/uploads/condominios/fachadas/${fileName}`;

    const bytes = await uploadedFile.arrayBuffer();
    const buffer = Buffer.from(bytes);

    await writeFile(diskPath, buffer);

    return NextResponse.json({
      facadeImagePath: publicPath,
    });
  } catch (error: unknown) {
    console.error("ERRO AO FAZER UPLOAD DA FACHADA:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao fazer upload da fachada." },
      { status: 500 }
    );
  }
}