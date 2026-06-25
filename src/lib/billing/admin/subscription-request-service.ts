import {
  AdministratorPlanStatus,
  Prisma,
  Role,
  Status,
  SubscriptionEventType,
  SubscriptionRequestStatus,
  SubscriptionRequestType,
} from "@prisma/client";

import { db } from "@/lib/db";
import {
  changeSubscriptionPlanWithValidation,
  scheduleSubscriptionCancellation,
} from "@/lib/billing/subscriptions";


const REQUEST_TYPE_LABELS: Record<SubscriptionRequestType, string> = {
  [SubscriptionRequestType.UPGRADE]: "Upgrade",
  [SubscriptionRequestType.DOWNGRADE]: "Downgrade",
  [SubscriptionRequestType.CANCELLATION]: "Cancelamento",
  [SubscriptionRequestType.CYCLE_REVIEW]: "Revisão Do Ciclo",
};

async function createNotificationOnce(input: {
  userId: string;
  type: string;
  title: string;
  message: string;
  href: string;
  metadata: Prisma.InputJsonObject;
}) {
  const existing = await db.notification.findFirst({
    where: {
      userId: input.userId,
      type: input.type,
      href: input.href,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    return existing;
  }

  return db.notification.create({
    data: {
      userId: input.userId,
      channel: "SYSTEM",
      status: "UNREAD",
      type: input.type,
      title: input.title,
      message: input.message,
      href: input.href,
      metadata: input.metadata,
    },
  });
}

async function notifySuperAdmins(input: {
  requestId: string;
  administratorId: string;
  requestType: SubscriptionRequestType;
  event: "CREATED" | "WITHDRAWN";
}) {
  try {
    const [administrator, recipients] = await Promise.all([
      db.administrator.findUnique({
        where: {
          id: input.administratorId,
        },
        select: {
          name: true,
        },
      }),
      db.user.findMany({
        where: {
          role: Role.SUPER_ADMIN,
          isActive: true,
        },
        select: {
          id: true,
        },
      }),
    ]);

    const administratorName =
      administrator?.name ?? "Uma administradora";
    const requestLabel =
      REQUEST_TYPE_LABELS[input.requestType] ?? input.requestType;
    const created = input.event === "CREATED";

    await Promise.all(
      recipients.map((recipient) =>
        createNotificationOnce({
          userId: recipient.id,
          type: created
            ? "SUBSCRIPTION_REQUEST_CREATED"
            : "SUBSCRIPTION_REQUEST_WITHDRAWN",
          title: created
            ? "Nova Solicitação Comercial"
            : "Solicitação Comercial Retirada",
          message: created
            ? `${administratorName} enviou uma solicitação de ${requestLabel}.`
            : `${administratorName} retirou uma solicitação de ${requestLabel}.`,
          href: `/elogest/assinaturas/solicitacoes?request=${input.requestId}`,
          metadata: {
            notificationScope: "ELOGEST_SUPER_ADMIN",
            notificationAudience: "SUPER_ADMIN",
            notificationGroup: "SUBSCRIPTION_COMMERCIAL_REQUEST",
            requestId: input.requestId,
            administratorId: input.administratorId,
            requestType: input.requestType,
            requestEvent: input.event,
          },
        }),
      ),
    );
  } catch (error) {
    console.error(
      "Erro ao notificar Super Admin sobre solicitação comercial:",
      error,
    );
  }
}

async function notifyAdministratorUsers(input: {
  requestId: string;
  administratorId: string;
  requestType: SubscriptionRequestType;
  decision: "APPROVED" | "REJECTED";
  reviewNotes: string;
}) {
  try {
    const recipients = await db.user.findMany({
      where: {
        administratorId: input.administratorId,
        role: Role.ADMINISTRADORA,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    const approved = input.decision === "APPROVED";
    const requestLabel =
      REQUEST_TYPE_LABELS[input.requestType] ?? input.requestType;

    await Promise.all(
      recipients.map((recipient) =>
        createNotificationOnce({
          userId: recipient.id,
          type: approved
            ? "SUBSCRIPTION_REQUEST_APPROVED"
            : "SUBSCRIPTION_REQUEST_REJECTED",
          title: approved
            ? "Solicitação Comercial Aprovada"
            : "Solicitação Comercial Recusada",
          message: approved
            ? `A solicitação de ${requestLabel} foi aprovada pelo EloGest.`
            : `A solicitação de ${requestLabel} foi recusada. Consulte o retorno em Minha Assinatura.`,
          href: `/admin/assinatura?request=${input.requestId}`,
          metadata: {
            notificationScope: "ADMINISTRATOR_SUBSCRIPTION",
            notificationAudience: "ADMINISTRADORA",
            notificationGroup: "SUBSCRIPTION_COMMERCIAL_REQUEST",
            requestId: input.requestId,
            administratorId: input.administratorId,
            requestType: input.requestType,
            decision: input.decision,
            reviewNotes: input.reviewNotes,
          },
        }),
      ),
    );
  } catch (error) {
    console.error(
      "Erro ao notificar administradora sobre solicitação comercial:",
      error,
    );
  }
}

const OPEN_SUBSCRIPTION_STATUSES: AdministratorPlanStatus[] = [
  AdministratorPlanStatus.TRIALING,
  AdministratorPlanStatus.ACTIVE,
  AdministratorPlanStatus.PAST_DUE,
  AdministratorPlanStatus.SUSPENDED,
];

const COMMERCIAL_PLAN_RANK: Record<string, number> = {
  free: 0,
  essencial: 1,
  profissional: 2,
  premium: 3,
  enterprise: 4,
};

function normalizePlanSlug(value: string) {
  return value.trim().toLowerCase();
}

function requiredReason(value: string | null | undefined) {
  const reason = value?.trim();

  if (!reason || reason.length < 8) {
    throw new Error("Informe uma justificativa com pelo menos 8 caracteres.");
  }

  return reason;
}

async function getOpenSubscription(administratorId: string) {
  return db.administratorSubscription.findFirst({
    where: {
      administratorId,
      status: {
        in: OPEN_SUBSCRIPTION_STATUSES,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      plan: {
        select: {
          id: true,
          name: true,
          slug: true,
          sortOrder: true,
          monthlyPriceCents: true,
        },
      },
    },
  });
}

export async function listAdministratorSubscriptionRequests(
  administratorId: string,
) {
  return db.subscriptionRequest.findMany({
    where: {
      administratorId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 30,
    include: {
      targetPlan: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });
}

export async function listAvailableRequestPlans() {
  return db.plan.findMany({
    where: {
      status: Status.ACTIVE,
      isPublic: true,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      monthlyPriceCents: true,
      annualPriceCents: true,
      maxCondominiums: true,
      maxUsers: true,
      maxProviders: true,
    },
  });
}

export async function createPlanChangeRequest(input: {
  administratorId: string;
  targetPlanId: string;
  reason?: string | null;
  requestedByUserId?: string | null;
}) {
  const reason = requiredReason(input.reason);
  const subscription = await getOpenSubscription(input.administratorId);

  if (!subscription) {
    throw new Error("Nenhuma assinatura aberta foi encontrada.");
  }

  if (subscription.planId === input.targetPlanId) {
    throw new Error("Selecione um plano diferente do plano atual.");
  }

  const targetPlan = await db.plan.findFirst({
    where: {
      id: input.targetPlanId,
      status: Status.ACTIVE,
      isPublic: true,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      sortOrder: true,
      monthlyPriceCents: true,
    },
  });

  if (!targetPlan) {
    throw new Error("O plano de destino não está disponível.");
  }

  const currentRank =
    COMMERCIAL_PLAN_RANK[normalizePlanSlug(subscription.plan.slug)];
  const targetRank =
    COMMERCIAL_PLAN_RANK[normalizePlanSlug(targetPlan.slug)];

  const isDowngrade =
    currentRank !== undefined && targetRank !== undefined
      ? targetRank < currentRank
      : targetPlan.sortOrder < subscription.plan.sortOrder ||
        ((targetPlan.monthlyPriceCents ?? 0) <
          (subscription.plan.monthlyPriceCents ?? 0));

  const type = isDowngrade
    ? SubscriptionRequestType.DOWNGRADE
    : SubscriptionRequestType.UPGRADE;

  const duplicate = await db.subscriptionRequest.findFirst({
    where: {
      administratorId: input.administratorId,
      subscriptionId: subscription.id,
      status: SubscriptionRequestStatus.PENDING,
      type: {
        in: [
          SubscriptionRequestType.UPGRADE,
          SubscriptionRequestType.DOWNGRADE,
        ],
      },
    },
    select: {
      id: true,
    },
  });

  if (duplicate) {
    throw new Error(
      "Já existe uma solicitação de alteração de plano aguardando análise.",
    );
  }

  const created = await db.subscriptionRequest.create({
    data: {
      administratorId: input.administratorId,
      subscriptionId: subscription.id,
      targetPlanId: targetPlan.id,
      type,
      reason,
      requestedByUserId: input.requestedByUserId ?? null,
      metadata: {
        currentPlanId: subscription.planId,
        currentPlanName: subscription.plan.name,
        targetPlanName: targetPlan.name,
      },
    },
    include: {
      targetPlan: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  await notifySuperAdmins({
    requestId: created.id,
    administratorId: created.administratorId,
    requestType: created.type,
    event: "CREATED",
  });

  return created;
}

export async function createCancellationRequest(input: {
  administratorId: string;
  reason?: string | null;
  requestedByUserId?: string | null;
}) {
  const reason = requiredReason(input.reason);
  const subscription = await getOpenSubscription(input.administratorId);

  if (!subscription) {
    throw new Error("Nenhuma assinatura aberta foi encontrada.");
  }

  if (subscription.cancelAtPeriodEnd) {
    throw new Error("A assinatura já possui cancelamento agendado.");
  }

  const duplicate = await db.subscriptionRequest.findFirst({
    where: {
      administratorId: input.administratorId,
      subscriptionId: subscription.id,
      type: SubscriptionRequestType.CANCELLATION,
      status: SubscriptionRequestStatus.PENDING,
    },
    select: {
      id: true,
    },
  });

  if (duplicate) {
    throw new Error(
      "Já existe uma solicitação de cancelamento aguardando análise.",
    );
  }

  const created = await db.subscriptionRequest.create({
    data: {
      administratorId: input.administratorId,
      subscriptionId: subscription.id,
      type: SubscriptionRequestType.CANCELLATION,
      reason,
      requestedByUserId: input.requestedByUserId ?? null,
    },
  });

  await notifySuperAdmins({
    requestId: created.id,
    administratorId: created.administratorId,
    requestType: created.type,
    event: "CREATED",
  });

  return created;
}

export async function createCycleReviewRequest(input: {
  administratorId: string;
  reason?: string | null;
  requestedByUserId?: string | null;
}) {
  const reason = requiredReason(input.reason);
  const subscription = await getOpenSubscription(input.administratorId);

  if (!subscription) {
    throw new Error("Nenhuma assinatura aberta foi encontrada.");
  }

  const duplicate = await db.subscriptionRequest.findFirst({
    where: {
      administratorId: input.administratorId,
      subscriptionId: subscription.id,
      type: SubscriptionRequestType.CYCLE_REVIEW,
      status: SubscriptionRequestStatus.PENDING,
    },
    select: {
      id: true,
    },
  });

  if (duplicate) {
    throw new Error(
      "Já existe uma solicitação de revisão de ciclo aguardando análise.",
    );
  }

  const created = await db.subscriptionRequest.create({
    data: {
      administratorId: input.administratorId,
      subscriptionId: subscription.id,
      type: SubscriptionRequestType.CYCLE_REVIEW,
      reason,
      requestedByUserId: input.requestedByUserId ?? null,
      metadata: {
        currentPeriodStart:
          subscription.currentPeriodStart?.toISOString() ?? null,
        currentPeriodEnd:
          subscription.currentPeriodEnd?.toISOString() ?? null,
        nextBillingAt:
          subscription.nextBillingAt?.toISOString() ?? null,
      },
    },
  });

  await notifySuperAdmins({
    requestId: created.id,
    administratorId: created.administratorId,
    requestType: created.type,
    event: "CREATED",
  });

  return created;
}

export async function withdrawSubscriptionRequest(input: {
  administratorId: string;
  requestId: string;
  requestedByUserId?: string | null;
}) {
  const request = await db.subscriptionRequest.findFirst({
    where: {
      id: input.requestId,
      administratorId: input.administratorId,
    },
  });

  if (!request) {
    throw new Error("Solicitação não encontrada.");
  }

  if (request.status !== SubscriptionRequestStatus.PENDING) {
    throw new Error("Somente solicitações pendentes podem ser retiradas.");
  }

  const withdrawn = await db.subscriptionRequest.update({
    where: {
      id: request.id,
    },
    data: {
      status: SubscriptionRequestStatus.WITHDRAWN,
      withdrawnAt: new Date(),
      metadata: {
        ...(request.metadata &&
        typeof request.metadata === "object" &&
        !Array.isArray(request.metadata)
          ? request.metadata
          : {}),
        withdrawnByUserId: input.requestedByUserId ?? null,
      },
    },
  });

  await notifySuperAdmins({
    requestId: withdrawn.id,
    administratorId: withdrawn.administratorId,
    requestType: withdrawn.type,
    event: "WITHDRAWN",
  });

  return withdrawn;
}

function addPeriod(date: Date, interval: string) {
  const result = new Date(date);

  if (interval === "ANNUAL") {
    result.setFullYear(result.getFullYear() + 1);
  } else {
    result.setMonth(result.getMonth() + 1);
  }

  return result;
}

async function regularizeCycle(input: {
  subscriptionId: string;
  reviewedByUserId?: string | null;
  reviewNotes: string;
}) {
  return db.$transaction(async (tx) => {
    const subscription = await tx.administratorSubscription.findUnique({
      where: {
        id: input.subscriptionId,
      },
    });

    if (!subscription) {
      throw new Error("Assinatura não encontrada.");
    }

    const now = new Date();
    let start =
      subscription.currentPeriodStart ??
      subscription.startedAt ??
      now;
    let end =
      subscription.currentPeriodEnd ??
      addPeriod(start, subscription.billingInterval);

    while (end <= now) {
      start = end;
      end = addPeriod(end, subscription.billingInterval);
    }

    const nextBillingAt = subscription.isComplimentary ? null : end;

    const updated = await tx.administratorSubscription.update({
      where: {
        id: subscription.id,
      },
      data: {
        currentPeriodStart: start,
        currentPeriodEnd: end,
        nextBillingAt,
        updatedByUserId: input.reviewedByUserId ?? null,
      },
    });

    await tx.administrator.update({
      where: {
        id: subscription.administratorId,
      },
      data: {
        planExpiresAt: end,
      },
    });

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        type: SubscriptionEventType.BILLING_DATE_CHANGED,
        description: input.reviewNotes,
        createdByUserId: input.reviewedByUserId ?? null,
        metadata: {
          action: "CYCLE_REGULARIZED_FROM_REQUEST",
          currentPeriodStart: start.toISOString(),
          currentPeriodEnd: end.toISOString(),
          nextBillingAt: nextBillingAt?.toISOString() ?? null,
        },
      },
    });

    return updated;
  });
}

export async function listPendingSubscriptionRequests() {
  return db.subscriptionRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      administrator: {
        select: {
          id: true,
          name: true,
          isDemo: true,
        },
      },
      subscription: {
        select: {
          id: true,
          status: true,
          billingInterval: true,
          currentPeriodEnd: true,
          nextBillingAt: true,
          plan: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
      targetPlan: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });
}

export async function reviewSubscriptionRequest(input: {
  requestId: string;
  decision: "APPROVE" | "REJECT";
  reviewNotes?: string | null;
  reviewedByUserId?: string | null;
}) {
  const reviewNotes = requiredReason(input.reviewNotes);

  const request = await db.subscriptionRequest.findUnique({
    where: {
      id: input.requestId,
    },
    include: {
      subscription: true,
    },
  });

  if (!request) {
    throw new Error("Solicitação não encontrada.");
  }

  if (request.status !== SubscriptionRequestStatus.PENDING) {
    throw new Error("A solicitação já foi analisada.");
  }

  if (input.decision === "REJECT") {
    const rejected = await db.subscriptionRequest.update({
      where: {
        id: request.id,
      },
      data: {
        status: SubscriptionRequestStatus.REJECTED,
        reviewNotes,
        reviewedByUserId: input.reviewedByUserId ?? null,
        reviewedAt: new Date(),
      },
    });

    await notifyAdministratorUsers({
      requestId: rejected.id,
      administratorId: rejected.administratorId,
      requestType: rejected.type,
      decision: "REJECTED",
      reviewNotes,
    });

    return rejected;
  }

  if (
    request.type === SubscriptionRequestType.UPGRADE ||
    request.type === SubscriptionRequestType.DOWNGRADE
  ) {
    if (!request.targetPlanId) {
      throw new Error("A solicitação não possui plano de destino.");
    }

    await changeSubscriptionPlanWithValidation({
      subscriptionId: request.subscriptionId,
      newPlanId: request.targetPlanId,
      reason: reviewNotes,
      updatedByUserId: input.reviewedByUserId ?? undefined,
    });
  } else if (request.type === SubscriptionRequestType.CANCELLATION) {
    await scheduleSubscriptionCancellation({
      subscriptionId: request.subscriptionId,
      reason: reviewNotes,
      updatedByUserId: input.reviewedByUserId ?? undefined,
    });
  } else if (request.type === SubscriptionRequestType.CYCLE_REVIEW) {
    await regularizeCycle({
      subscriptionId: request.subscriptionId,
      reviewedByUserId: input.reviewedByUserId,
      reviewNotes,
    });
  }

  const approved = await db.subscriptionRequest.update({
    where: {
      id: request.id,
    },
    data: {
      status: SubscriptionRequestStatus.APPROVED,
      reviewNotes,
      reviewedByUserId: input.reviewedByUserId ?? null,
      reviewedAt: new Date(),
    },
  });

  await notifyAdministratorUsers({
    requestId: approved.id,
    administratorId: approved.administratorId,
    requestType: approved.type,
    decision: "APPROVED",
    reviewNotes,
  });

  return approved;
}
