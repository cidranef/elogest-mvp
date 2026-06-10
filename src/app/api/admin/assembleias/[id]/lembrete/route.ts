import { NextRequest, NextResponse } from "next/server";
import { AssemblyLogAction } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";
import { notifyAssemblyAudience } from "@/lib/notifications";

const ASSEMBLIES_MODULE_SLUG = "assembleias";
const ASSEMBLIES_MODULE_LABEL = "Assembleias";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const assembly = await db.assembly.findFirst({
      where: { id, administratorId: auth.administratorId },
      select: { id: true, title: true, convocationPublishedAt: true },
    });

    if (!assembly) {
      return NextResponse.json({ error: "Assembleia não encontrada na carteira ativa da administradora." }, { status: 404 });
    }

    if (!assembly.convocationPublishedAt) {
      return NextResponse.json({ error: "Publique a convocação antes de enviar lembretes de votação." }, { status: 400 });
    }

    const result = await notifyAssemblyAudience({
      assemblyId: assembly.id,
      mode: "REMINDER",
      actorUser: auth.authUser,
    });

    await db.assemblyLog.create({
      data: {
        assemblyId: assembly.id,
        userId: auth.authUser.id,
        action: AssemblyLogAction.UPDATED,
        message: "Lembrete manual de votação processado para participantes internos com pendências.",
        metadata: {
          notificationsCreated: result.createdNotifications.length,
          externalRepresentativesPendingValidation: result.externalRepresentatives.length,
        },
      },
    });

    return NextResponse.json({
      message: "Lembrete processado com sucesso.",
      notificationsCreated: result.createdNotifications.length,
      externalRepresentativesPendingValidation: result.externalRepresentatives.length,
    });
  } catch (error) {
    console.error("Erro ao enviar lembrete da assembleia:", error);
    return NextResponse.json({ error: "Não foi possível enviar o lembrete da assembleia." }, { status: 500 });
  }
}
