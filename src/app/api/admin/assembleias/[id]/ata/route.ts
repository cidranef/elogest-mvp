import { NextRequest, NextResponse } from "next/server";
import {
  AssemblyMinuteGenerationMode,
  AssemblyMinuteLogAction,
  AssemblyMinuteStatus,
  AssemblyMinuteVersionSource,
  AssemblyStatus,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";
import {
  AssemblyMinuteBuilderError,
  buildStructuredAssemblyMinute,
} from "@/lib/assembly-minute-builder";
import {
  getAssemblyMinuteAiConfiguration,
  improveAssemblyMinuteWithAi,
} from "@/lib/ai/assembly-minute-ai";

/* =========================================================
   API ADMIN - ATA DA ASSEMBLEIA

   Arquivo:
   src/app/api/admin/assembleias/[id]/ata/route.ts

   ELOGEST — ETAPA 52.4

   Métodos:
   - GET: consulta ata, versões, histórico e permissões operacionais.
   - PATCH: salva uma revisão manual como nova versão auditável.
   - POST: gera/regenera minuta estruturada e controla o ciclo
     formal de revisão, aprovação, publicação e arquivamento.

   Segurança:
   - Exige perfil ativo ADMINISTRADORA.
   - Bloqueia administradora INACTIVE pelo admin-api-guard.
   - Exige módulo comercial Assembleias liberado.
   - Isola assembleia e ata por administratorId do perfil ativo.
   - SUPER_ADMIN não opera esta API.
   - Não recalcula votos, quórum ou resultados.
   - Exige resultados oficialmente publicados antes da geração.
   - Preserva snapshots e versões integrais.
   - Impede alteração silenciosa após publicação ou arquivamento.
   ========================================================= */

const ASSEMBLIES_MODULE_SLUG = "assembleias";
const ASSEMBLIES_MODULE_LABEL = "Assembleias";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type MinuteAction =
  | "GENERATE_STRUCTURED"
  | "REGENERATE_STRUCTURED"
  | "GENERATE_AI_ASSISTED"
  | "SUBMIT_FOR_REVIEW"
  | "MARK_REVIEWED"
  | "APPROVE"
  | "PUBLISH"
  | "ARCHIVE";

type MinuteActionBody = {
  action?: unknown;
};

type UpdateMinuteBody = {
  title?: unknown;
  executiveSummary?: unknown;
  content?: unknown;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredString(value: unknown) {
  return normalizeNullableString(value) ?? "";
}

function parseAction(value: unknown): MinuteAction | null {
  const normalized = normalizeNullableString(value)?.toUpperCase();

  if (
    normalized === "GENERATE_STRUCTURED" ||
    normalized === "REGENERATE_STRUCTURED" ||
    normalized === "GENERATE_AI_ASSISTED" ||
    normalized === "SUBMIT_FOR_REVIEW" ||
    normalized === "MARK_REVIEWED" ||
    normalized === "APPROVE" ||
    normalized === "PUBLISH" ||
    normalized === "ARCHIVE"
  ) {
    return normalized;
  }

  return null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function canGenerateStructuredMinute(assembly: {
  status: AssemblyStatus;
  resultsPublishedAt: Date | null;
}) {
  return (
    assembly.status === AssemblyStatus.RESULTS_PUBLISHED &&
    Boolean(assembly.resultsPublishedAt)
  );
}

function canEditMinute(minute: { status: AssemblyMinuteStatus }) {
  return (
    minute.status !== AssemblyMinuteStatus.PUBLISHED &&
    minute.status !== AssemblyMinuteStatus.ARCHIVED
  );
}

function canRegenerateMinute(minute: { status: AssemblyMinuteStatus }) {
  return canEditMinute(minute);
}

function canSubmitForReview(minute: { status: AssemblyMinuteStatus }) {
  return (
    minute.status === AssemblyMinuteStatus.DRAFT ||
    minute.status === AssemblyMinuteStatus.GENERATED ||
    minute.status === AssemblyMinuteStatus.UNDER_REVIEW
  );
}

function canMarkReviewed(minute: { status: AssemblyMinuteStatus }) {
  return minute.status === AssemblyMinuteStatus.UNDER_REVIEW;
}

function canApproveMinute(minute: {
  status: AssemblyMinuteStatus;
  reviewedAt: Date | null;
}) {
  return (
    minute.status === AssemblyMinuteStatus.UNDER_REVIEW &&
    Boolean(minute.reviewedAt)
  );
}

function canPublishMinute(minute: {
  status: AssemblyMinuteStatus;
  approvedAt: Date | null;
}) {
  return (
    minute.status === AssemblyMinuteStatus.APPROVED &&
    Boolean(minute.approvedAt)
  );
}

function canArchiveMinute(minute: { status: AssemblyMinuteStatus }) {
  return minute.status === AssemblyMinuteStatus.PUBLISHED;
}

async function findAssemblyForAdmin(params: {
  assemblyId: string;
  administratorId: string;
}) {
  return db.assembly.findFirst({
    where: {
      id: params.assemblyId,
      administratorId: params.administratorId,
    },
    select: {
      id: true,
      administratorId: true,
      condominiumId: true,
      title: true,
      status: true,
      resultsPublishedAt: true,
      condominium: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

async function findMinuteForAdmin(params: {
  assemblyId: string;
  administratorId: string;
}) {
  return db.assemblyMinute.findFirst({
    where: {
      assemblyId: params.assemblyId,
      administratorId: params.administratorId,
    },
    include: {
      generatedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      reviewedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      approvedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      publishedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      archivedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      versions: {
        orderBy: {
          version: "desc",
        },
        take: 30,
        include: {
          createdByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      logs: {
        orderBy: {
          createdAt: "desc",
        },
        take: 120,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });
}

async function findMinuteWithLatestVersionForAdmin(params: {
  assemblyId: string;
  administratorId: string;
}) {
  return db.assemblyMinute.findFirst({
    where: {
      assemblyId: params.assemblyId,
      administratorId: params.administratorId,
    },
    include: {
      versions: {
        orderBy: {
          version: "desc",
        },
        take: 1,
      },
    },
  });
}

function getLatestVersionOrThrow(
  minute: NonNullable<
    Awaited<ReturnType<typeof findMinuteWithLatestVersionForAdmin>>
  >,
) {
  const latestVersion = minute.versions[0];

  if (!latestVersion) {
    throw new Error("Ata localizada sem versão registrada.");
  }

  return latestVersion;
}

function handleBuilderError(error: unknown) {
  if (error instanceof AssemblyMinuteBuilderError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }

  return null;
}

function buildPermissions(params: {
  assembly: {
    status: AssemblyStatus;
    resultsPublishedAt: Date | null;
  };
  minute: Awaited<ReturnType<typeof findMinuteForAdmin>>;
}) {
  const { assembly, minute } = params;

  return {
    canGenerateStructuredMinute:
      canGenerateStructuredMinute(assembly) && !minute,
    canRegenerateStructuredMinute:
      canGenerateStructuredMinute(assembly) &&
      Boolean(minute && canRegenerateMinute(minute)),
    canGenerateAiAssistedMinute: Boolean(
      minute &&
      canEditMinute(minute) &&
      getAssemblyMinuteAiConfiguration().configured
    ),
    canEditMinute: Boolean(minute && canEditMinute(minute)),
    canSubmitForReview: Boolean(minute && canSubmitForReview(minute)),
    canMarkReviewed: Boolean(minute && canMarkReviewed(minute)),
    canApproveMinute: Boolean(minute && canApproveMinute(minute)),
    canPublishMinute: Boolean(minute && canPublishMinute(minute)),
    canArchiveMinute: Boolean(minute && canArchiveMinute(minute)),
  };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;

    const assembly = await findAssemblyForAdmin({
      assemblyId: id,
      administratorId: auth.administratorId,
    });

    if (!assembly) {
      return notFound(
        "Assembleia não encontrada na carteira ativa da administradora.",
      );
    }

    const minute = await findMinuteForAdmin({
      assemblyId: assembly.id,
      administratorId: auth.administratorId,
    });

    return NextResponse.json({
      assembly,
      minute,
      permissions: buildPermissions({ assembly, minute }),
      aiConfiguration: getAssemblyMinuteAiConfiguration(),
    });
  } catch (error) {
    console.error("Erro ao consultar ata da assembleia:", error);

    return NextResponse.json(
      { error: "Não foi possível consultar a ata da assembleia." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as UpdateMinuteBody;

    const assembly = await findAssemblyForAdmin({
      assemblyId: id,
      administratorId: auth.administratorId,
    });

    if (!assembly) {
      return notFound(
        "Assembleia não encontrada na carteira ativa da administradora.",
      );
    }


    const minute = await findMinuteWithLatestVersionForAdmin({
      assemblyId: assembly.id,
      administratorId: auth.administratorId,
    });

    if (!minute) {
      return notFound("Gere a minuta estruturada antes de iniciar a revisão manual.");
    }

    if (!canEditMinute(minute)) {
      return forbidden(
        "A ata publicada ou arquivada não pode ser alterada. O histórico oficial deve ser preservado.",
      );
    }

    const title = normalizeRequiredString(body.title);
    const executiveSummary = normalizeNullableString(body.executiveSummary);
    const content = normalizeRequiredString(body.content);

    if (!title) {
      return badRequest("Informe o título da ata.");
    }

    if (!content) {
      return badRequest("Informe o conteúdo da ata.");
    }

    const latestVersion = getLatestVersionOrThrow(minute);
    const now = new Date();
    const version = minute.currentVersion + 1;

    await db.$transaction(async (tx) => {
      await tx.assemblyMinute.update({
        where: {
          id: minute.id,
        },
        data: {
          title,
          executiveSummary,
          content,
          status: AssemblyMinuteStatus.UNDER_REVIEW,
          generationMode: AssemblyMinuteGenerationMode.MANUAL,
          currentVersion: version,
          reviewedAt: now,
          reviewedByUserId: auth.authUser.id,
          approvedAt: null,
          approvedByUserId: null,
          versions: {
            create: {
              version,
              source: AssemblyMinuteVersionSource.MANUAL_REVISION,
              title,
              executiveSummary,
              content,
              sourceSnapshot: toJson(latestVersion.sourceSnapshot),
              warnings: minute.warnings
                ? toJson(minute.warnings)
                : undefined,
              metadata: toJson({
                previousVersion: minute.currentVersion,
                revisionType: "MANUAL",
              }),
              createdByUserId: auth.authUser.id,
            },
          },
          logs: {
            create: [
              {
                userId: auth.authUser.id,
                action: AssemblyMinuteLogAction.UPDATED,
                message: "Conteúdo da ata revisado manualmente.",
                metadata: toJson({
                  version,
                  previousVersion: minute.currentVersion,
                }),
              },
              {
                userId: auth.authUser.id,
                action: AssemblyMinuteLogAction.VERSION_CREATED,
                message: `Versão ${version} da ata registrada após revisão manual.`,
                metadata: toJson({
                  version,
                  source: "MANUAL_REVISION",
                }),
              },
            ],
          },
        },
      });
    });

    const updatedMinute = await findMinuteForAdmin({
      assemblyId: assembly.id,
      administratorId: auth.administratorId,
    });

    return NextResponse.json({
      message: "Revisão manual salva como nova versão da ata.",
      minute: updatedMinute,
    });
  } catch (error) {
    console.error("Erro ao salvar revisão manual da ata:", error);

    return NextResponse.json(
      { error: "Não foi possível salvar a revisão manual da ata." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as MinuteActionBody;
    const action = parseAction(body.action);

    if (!action) {
      return badRequest("Informe uma ação válida para a ata da assembleia.");
    }

    const assembly = await findAssemblyForAdmin({
      assemblyId: id,
      administratorId: auth.administratorId,
    });

    if (!assembly) {
      return notFound(
        "Assembleia não encontrada na carteira ativa da administradora.",
      );
    }

    if (
      action === "GENERATE_STRUCTURED" ||
      action === "REGENERATE_STRUCTURED"
    ) {
      if (!canGenerateStructuredMinute(assembly)) {
        return forbidden(
          "Publique os resultados da assembleia antes de gerar a minuta da ata.",
        );
      }

      const currentMinute = await db.assemblyMinute.findFirst({
        where: {
          assemblyId: assembly.id,
          administratorId: auth.administratorId,
        },
        select: {
          id: true,
          status: true,
          currentVersion: true,
        },
      });

      if (action === "GENERATE_STRUCTURED" && currentMinute) {
        return conflict(
          "A minuta já foi gerada. Utilize a opção de regenerar para criar uma nova versão auditável.",
        );
      }

      if (action === "REGENERATE_STRUCTURED" && !currentMinute) {
        return conflict(
          "Ainda não existe uma minuta. Utilize a opção de gerar a primeira versão.",
        );
      }

      if (currentMinute && !canRegenerateMinute(currentMinute)) {
        return forbidden(
          "A ata publicada ou arquivada não pode ser regenerada. O histórico oficial deve ser preservado.",
        );
      }

      const draft = await buildStructuredAssemblyMinute({
        assemblyId: assembly.id,
        administratorId: auth.administratorId,
      });

      const now = new Date();
      const version = (currentMinute?.currentVersion ?? 0) + 1;
      const jsonWarnings = toJson(draft.warnings);
      const jsonMetadata = toJson(draft.metadata);
      const jsonSourceSnapshot = toJson(draft.sourceSnapshot);

      const minuteId = await db.$transaction(async (tx) => {
        if (!currentMinute) {
          const createdMinute = await tx.assemblyMinute.create({
            data: {
              assemblyId: assembly.id,
              administratorId: assembly.administratorId,
              condominiumId: assembly.condominiumId,
              status: AssemblyMinuteStatus.GENERATED,
              generationMode: AssemblyMinuteGenerationMode.STRUCTURED,
              title: draft.title,
              executiveSummary: draft.executiveSummary,
              content: draft.content,
              warnings: jsonWarnings,
              metadata: jsonMetadata,
              currentVersion: version,
              generatedAt: now,
              generatedByUserId: auth.authUser.id,
              versions: {
                create: {
                  version,
                  source: AssemblyMinuteVersionSource.STRUCTURED_GENERATION,
                  title: draft.title,
                  executiveSummary: draft.executiveSummary,
                  content: draft.content,
                  sourceSnapshot: jsonSourceSnapshot,
                  warnings: jsonWarnings,
                  metadata: jsonMetadata,
                  createdByUserId: auth.authUser.id,
                },
              },
              logs: {
                create: [
                  {
                    userId: auth.authUser.id,
                    action: AssemblyMinuteLogAction.CREATED,
                    message: "Ata criada para a assembleia.",
                    metadata: toJson({
                      version,
                      generationMode: "STRUCTURED",
                    }),
                  },
                  {
                    userId: auth.authUser.id,
                    action: AssemblyMinuteLogAction.STRUCTURED_GENERATED,
                    message:
                      "Primeira minuta estruturada gerada com base nos registros oficiais da assembleia.",
                    metadata: toJson({
                      version,
                      warningsCount: draft.warnings.length,
                    }),
                  },
                  {
                    userId: auth.authUser.id,
                    action: AssemblyMinuteLogAction.VERSION_CREATED,
                    message: `Versão ${version} da minuta registrada.`,
                    metadata: toJson({
                      version,
                      source: "STRUCTURED_GENERATION",
                    }),
                  },
                ],
              },
            },
            select: {
              id: true,
            },
          });

          return createdMinute.id;
        }

        const updatedMinute = await tx.assemblyMinute.update({
          where: {
            id: currentMinute.id,
          },
          data: {
            status: AssemblyMinuteStatus.GENERATED,
            generationMode: AssemblyMinuteGenerationMode.STRUCTURED,
            title: draft.title,
            executiveSummary: draft.executiveSummary,
            content: draft.content,
            warnings: jsonWarnings,
            metadata: jsonMetadata,
            currentVersion: version,
            generatedAt: now,
            generatedByUserId: auth.authUser.id,
            reviewedAt: null,
            reviewedByUserId: null,
            approvedAt: null,
            approvedByUserId: null,
            versions: {
              create: {
                version,
                source: AssemblyMinuteVersionSource.STRUCTURED_GENERATION,
                title: draft.title,
                executiveSummary: draft.executiveSummary,
                content: draft.content,
                sourceSnapshot: jsonSourceSnapshot,
                warnings: jsonWarnings,
                metadata: jsonMetadata,
                createdByUserId: auth.authUser.id,
              },
            },
            logs: {
              create: [
                {
                  userId: auth.authUser.id,
                  action: AssemblyMinuteLogAction.REGENERATED,
                  message:
                    "Minuta estruturada regenerada sem sobrescrever o histórico anterior.",
                  metadata: toJson({
                    version,
                    warningsCount: draft.warnings.length,
                  }),
                },
                {
                  userId: auth.authUser.id,
                  action: AssemblyMinuteLogAction.VERSION_CREATED,
                  message: `Versão ${version} da minuta registrada.`,
                  metadata: toJson({
                    version,
                    source: "STRUCTURED_GENERATION",
                  }),
                },
              ],
            },
          },
          select: {
            id: true,
          },
        });

        return updatedMinute.id;
      });

      const minute = await findMinuteForAdmin({
        assemblyId: assembly.id,
        administratorId: auth.administratorId,
      });

      if (!minute || minute.id !== minuteId) {
        throw new Error("Ata gerada, mas não localizada para retorno da API.");
      }

      return NextResponse.json(
        {
          message:
            action === "GENERATE_STRUCTURED"
              ? "Minuta estruturada gerada com sucesso."
              : "Nova versão da minuta estruturada gerada com sucesso.",
          minute,
        },
        { status: action === "GENERATE_STRUCTURED" ? 201 : 200 },
      );
    }

    if (action === "GENERATE_AI_ASSISTED") {
      const currentMinute = await findMinuteWithLatestVersionForAdmin({
        assemblyId: assembly.id,
        administratorId: auth.administratorId,
      });

      if (!currentMinute) {
        return notFound(
          "Gere a minuta estruturada antes de solicitar o aprimoramento com IA.",
        );
      }

      if (!canEditMinute(currentMinute)) {
        return forbidden(
          "A ata publicada ou arquivada não pode ser alterada. O histórico oficial deve ser preservado.",
        );
      }

      const latestVersion = getLatestVersionOrThrow(currentMinute);
      const aiResult = await improveAssemblyMinuteWithAi({
        title: currentMinute.title,
        executiveSummary: currentMinute.executiveSummary,
        content: currentMinute.content,
        sourceSnapshot: latestVersion.sourceSnapshot,
      });

      if (aiResult.usedFallback) {
        await db.assemblyMinuteLog.create({
          data: {
            minuteId: currentMinute.id,
            userId: auth.authUser.id,
            action: AssemblyMinuteLogAction.AI_FALLBACK_USED,
            message:
              aiResult.noRelevantChange
                ? "A IA não identificou melhoria textual relevante. A minuta atual foi preservada sem criar nova versão."
                : "Aprimoramento com IA indisponível. A minuta segura atual foi preservada sem criar nova versão.",
            metadata: toJson(aiResult.metadata),
          },
        });

        const preservedMinute = await findMinuteForAdmin({
          assemblyId: assembly.id,
          administratorId: auth.administratorId,
        });

        const rejectedByLocalValidation =
          aiResult.fallbackReason?.startsWith(
            "A validação de segurança identificou",
          ) || false;

        return NextResponse.json({
          message: aiResult.noRelevantChange
            ? "A IA não identificou melhorias relevantes para esta minuta. A versão atual foi preservada."
            : rejectedByLocalValidation
              ? "A versão narrativa retornada pela IA não passou pela validação de segurança. A minuta atual foi preservada integralmente."
              : "A IA não ficou disponível. A minuta segura atual foi preservada integralmente.",
          minute: preservedMinute,
          aiFallback: true,
          aiNoRelevantChange: aiResult.noRelevantChange,
          aiRejectedByLocalValidation: rejectedByLocalValidation,
          aiConfiguration: getAssemblyMinuteAiConfiguration(),
        });
      }

      const now = new Date();
      const version = currentMinute.currentVersion + 1;
      const jsonMetadata = toJson({
        ...aiResult.metadata,
        previousVersion: currentMinute.currentVersion,
        source: "AI_ASSISTED_GENERATION",
        warnings: aiResult.warnings,
      });

      await db.assemblyMinute.update({
        where: {
          id: currentMinute.id,
        },
        data: {
          status: AssemblyMinuteStatus.GENERATED,
          generationMode: AssemblyMinuteGenerationMode.AI_ASSISTED,
          title: aiResult.title,
          executiveSummary: aiResult.executiveSummary,
          content: aiResult.content,
          currentVersion: version,
          generatedAt: now,
          generatedByUserId: auth.authUser.id,
          reviewedAt: null,
          reviewedByUserId: null,
          approvedAt: null,
          approvedByUserId: null,
          versions: {
            create: {
              version,
              source: AssemblyMinuteVersionSource.AI_ASSISTED_GENERATION,
              title: aiResult.title,
              executiveSummary: aiResult.executiveSummary,
              content: aiResult.content,
              sourceSnapshot: toJson(latestVersion.sourceSnapshot),
              warnings: currentMinute.warnings
                ? toJson(currentMinute.warnings)
                : undefined,
              metadata: jsonMetadata,
              createdByUserId: auth.authUser.id,
            },
          },
          logs: {
            create: [
              {
                userId: auth.authUser.id,
                action: AssemblyMinuteLogAction.AI_GENERATED,
                message:
                  "Texto da minuta aprimorado com IA sem sobrescrever o histórico anterior.",
                metadata: toJson({
                  version,
                  ...aiResult.metadata,
                  warningsCount: aiResult.warnings.length,
                }),
              },
              {
                userId: auth.authUser.id,
                action: AssemblyMinuteLogAction.VERSION_CREATED,
                message: `Versão ${version} da minuta registrada após aprimoramento com IA.`,
                metadata: toJson({
                  version,
                  source: "AI_ASSISTED_GENERATION",
                }),
              },
            ],
          },
        },
      });

      const updatedMinute = await findMinuteForAdmin({
        assemblyId: assembly.id,
        administratorId: auth.administratorId,
      });

      return NextResponse.json({
        message:
          "Texto aprimorado com IA e salvo como nova versão auditável. Revise o conteúdo antes da aprovação.",
        minute: updatedMinute,
        aiFallback: false,
        aiConfiguration: getAssemblyMinuteAiConfiguration(),
      });
    }

    const minute = await findMinuteWithLatestVersionForAdmin({
      assemblyId: assembly.id,
      administratorId: auth.administratorId,
    });

    if (!minute) {
      return notFound("Gere a minuta estruturada antes de continuar.");
    }

    const latestVersion = getLatestVersionOrThrow(minute);
    const now = new Date();

    if (action === "SUBMIT_FOR_REVIEW") {
      if (!canSubmitForReview(minute)) {
        return forbidden("A ata não pode ser enviada para revisão neste momento.");
      }

      await db.assemblyMinute.update({
        where: {
          id: minute.id,
        },
        data: {
          status: AssemblyMinuteStatus.UNDER_REVIEW,
          logs: {
            create: {
              userId: auth.authUser.id,
              action: AssemblyMinuteLogAction.SUBMITTED_FOR_REVIEW,
              message: "Ata enviada para revisão humana obrigatória.",
              metadata: toJson({
                version: minute.currentVersion,
              }),
            },
          },
        },
      });
    }

    if (action === "MARK_REVIEWED") {
      if (!canMarkReviewed(minute)) {
        return forbidden("A ata deve estar em revisão antes da confirmação.");
      }

      await db.assemblyMinute.update({
        where: {
          id: minute.id,
        },
        data: {
          reviewedAt: now,
          reviewedByUserId: auth.authUser.id,
          logs: {
            create: {
              userId: auth.authUser.id,
              action: AssemblyMinuteLogAction.UPDATED,
              message: "Revisão humana da ata confirmada.",
              metadata: toJson({
                version: minute.currentVersion,
                reviewConfirmed: true,
              }),
            },
          },
        },
      });
    }

    if (action === "APPROVE") {
      if (!canApproveMinute(minute)) {
        return forbidden(
          "Confirme a revisão humana antes de aprovar a ata.",
        );
      }

      const version = minute.currentVersion + 1;

      await db.assemblyMinute.update({
        where: {
          id: minute.id,
        },
        data: {
          status: AssemblyMinuteStatus.APPROVED,
          approvedAt: now,
          approvedByUserId: auth.authUser.id,
          currentVersion: version,
          versions: {
            create: {
              version,
              source: AssemblyMinuteVersionSource.APPROVAL_SNAPSHOT,
              title: minute.title,
              executiveSummary: minute.executiveSummary,
              content: minute.content,
              sourceSnapshot: toJson(latestVersion.sourceSnapshot),
              warnings: minute.warnings
                ? toJson(minute.warnings)
                : undefined,
              metadata: toJson({
                previousVersion: minute.currentVersion,
                approvalSnapshot: true,
              }),
              createdByUserId: auth.authUser.id,
            },
          },
          logs: {
            create: [
              {
                userId: auth.authUser.id,
                action: AssemblyMinuteLogAction.APPROVED,
                message: "Ata aprovada após revisão humana.",
                metadata: toJson({
                  version,
                }),
              },
              {
                userId: auth.authUser.id,
                action: AssemblyMinuteLogAction.VERSION_CREATED,
                message: `Versão ${version} registrada como fotografia da aprovação.`,
                metadata: toJson({
                  version,
                  source: "APPROVAL_SNAPSHOT",
                }),
              },
            ],
          },
        },
      });
    }

    if (action === "PUBLISH") {
      if (!canPublishMinute(minute)) {
        return forbidden("Aprove a ata antes de realizar a publicação oficial.");
      }

      const version = minute.currentVersion + 1;

      await db.assemblyMinute.update({
        where: {
          id: minute.id,
        },
        data: {
          status: AssemblyMinuteStatus.PUBLISHED,
          publishedAt: now,
          publishedByUserId: auth.authUser.id,
          currentVersion: version,
          versions: {
            create: {
              version,
              source: AssemblyMinuteVersionSource.PUBLICATION_SNAPSHOT,
              title: minute.title,
              executiveSummary: minute.executiveSummary,
              content: minute.content,
              sourceSnapshot: toJson(latestVersion.sourceSnapshot),
              warnings: minute.warnings
                ? toJson(minute.warnings)
                : undefined,
              metadata: toJson({
                previousVersion: minute.currentVersion,
                officialPublication: true,
              }),
              createdByUserId: auth.authUser.id,
            },
          },
          logs: {
            create: [
              {
                userId: auth.authUser.id,
                action: AssemblyMinuteLogAction.PUBLISHED,
                message: "Ata publicada oficialmente e congelada para edição.",
                metadata: toJson({
                  version,
                }),
              },
              {
                userId: auth.authUser.id,
                action: AssemblyMinuteLogAction.VERSION_CREATED,
                message: `Versão ${version} registrada como publicação oficial.`,
                metadata: toJson({
                  version,
                  source: "PUBLICATION_SNAPSHOT",
                }),
              },
            ],
          },
        },
      });
    }

    if (action === "ARCHIVE") {
      if (!canArchiveMinute(minute)) {
        return forbidden("Somente atas oficialmente publicadas podem ser arquivadas.");
      }

      await db.assemblyMinute.update({
        where: {
          id: minute.id,
        },
        data: {
          status: AssemblyMinuteStatus.ARCHIVED,
          archivedAt: now,
          archivedByUserId: auth.authUser.id,
          logs: {
            create: {
              userId: auth.authUser.id,
              action: AssemblyMinuteLogAction.ARCHIVED,
              message: "Ata oficial arquivada sem exclusão do histórico.",
              metadata: toJson({
                version: minute.currentVersion,
              }),
            },
          },
        },
      });
    }

    const updatedMinute = await findMinuteForAdmin({
      assemblyId: assembly.id,
      administratorId: auth.administratorId,
    });

    const actionMessages: Record<Exclude<MinuteAction, "GENERATE_STRUCTURED" | "REGENERATE_STRUCTURED" | "GENERATE_AI_ASSISTED">, string> = {
      SUBMIT_FOR_REVIEW: "Ata enviada para revisão.",
      MARK_REVIEWED: "Revisão humana confirmada.",
      APPROVE: "Ata aprovada com sucesso.",
      PUBLISH: "Ata publicada oficialmente.",
      ARCHIVE: "Ata arquivada com sucesso.",
    };

    return NextResponse.json({
      message: actionMessages[action],
      minute: updatedMinute,
    });
  } catch (error) {
    const builderResponse = handleBuilderError(error);
    if (builderResponse) return builderResponse;

    console.error("Erro ao processar ata da assembleia:", error);

    return NextResponse.json(
      { error: "Não foi possível processar a ata da assembleia." },
      { status: 500 },
    );
  }
}
