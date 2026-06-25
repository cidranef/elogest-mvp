import {
  AdministratorPlanStatus,
  Prisma,
  SubscriptionBillingInterval,
  SubscriptionEventType,
  SubscriptionOrigin,
} from "@prisma/client";

import { db } from "@/lib/db";

import {
  ActiveSubscriptionAlreadyExistsError,
  InvalidSubscriptionOperationError,
  SubscriptionNotFoundError,
} from "./subscription-errors";
import type {
  ChangeSubscriptionPlanInput,
  CreateAdministratorSubscriptionInput,
} from "./subscription-types";

const OPEN_SUBSCRIPTION_STATUSES: AdministratorPlanStatus[] = [
  AdministratorPlanStatus.TRIALING,
  AdministratorPlanStatus.ACTIVE,
  AdministratorPlanStatus.PAST_DUE,
  AdministratorPlanStatus.SUSPENDED,
];

function ensureNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidSubscriptionOperationError(
      `${field} deve ser um valor inteiro não negativo em centavos.`,
    );
  }
}

function resolvePlanPrice(
  interval: SubscriptionBillingInterval,
  monthlyPriceCents: number | null,
  annualPriceCents: number | null,
  requestedPriceCents?: number | null,
): number {
  if (requestedPriceCents !== undefined && requestedPriceCents !== null) {
    ensureNonNegativeInteger(requestedPriceCents, "basePriceCents");
    return requestedPriceCents;
  }

  const planPrice =
    interval === SubscriptionBillingInterval.ANNUAL
      ? annualPriceCents
      : monthlyPriceCents;

  if (planPrice === null) {
    throw new InvalidSubscriptionOperationError(
      "O plano não possui preço para a periodicidade selecionada. Informe um preço personalizado ou marque a assinatura como cortesia.",
    );
  }

  return planPrice;
}

export async function createAdministratorSubscription(
  input: CreateAdministratorSubscriptionInput,
) {
  return db.$transaction(async (tx) => {
    const administrator = await tx.administrator.findUnique({
      where: { id: input.administratorId },
      select: {
        id: true,
        isDemo: true,
      },
    });

    if (!administrator) {
      throw new InvalidSubscriptionOperationError(
        "Administradora não encontrada.",
      );
    }

    const plan = await tx.plan.findUnique({
      where: { id: input.planId },
      select: {
        id: true,
        monthlyPriceCents: true,
        annualPriceCents: true,
      },
    });

    if (!plan) {
      throw new InvalidSubscriptionOperationError("Plano não encontrado.");
    }

    const existing = await tx.administratorSubscription.findFirst({
      where: {
        administratorId: input.administratorId,
        status: { in: OPEN_SUBSCRIPTION_STATUSES },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ActiveSubscriptionAlreadyExistsError(input.administratorId);
    }

    const billingInterval =
      input.billingInterval ?? SubscriptionBillingInterval.MONTHLY;
    const isComplimentary = administrator.isDemo || Boolean(input.isComplimentary);
    const manualBillingOnly = administrator.isDemo || input.manualBillingOnly !== false;
    const discountCents = input.discountCents ?? 0;
    const implementationFeeCents = input.implementationFeeCents ?? 0;

    ensureNonNegativeInteger(discountCents, "discountCents");
    ensureNonNegativeInteger(
      implementationFeeCents,
      "implementationFeeCents",
    );

    const basePriceCents = isComplimentary
      ? 0
      : resolvePlanPrice(
          billingInterval,
          plan.monthlyPriceCents,
          plan.annualPriceCents,
          input.basePriceCents,
        );

    if (discountCents > basePriceCents) {
      throw new InvalidSubscriptionOperationError(
        "O desconto não pode ser maior que o preço-base.",
      );
    }

    const finalPriceCents = isComplimentary
      ? 0
      : basePriceCents - discountCents;
    const startedAt = input.startedAt ?? new Date();
    const status =
      input.status ??
      (input.trialEndsAt
        ? AdministratorPlanStatus.TRIALING
        : AdministratorPlanStatus.ACTIVE);

    const subscription = await tx.administratorSubscription.create({
      data: {
        administratorId: input.administratorId,
        planId: input.planId,
        commercialProposalId: input.commercialProposalId ?? null,
        status,
        billingInterval,
        origin: input.origin ?? SubscriptionOrigin.MANUAL,
        currency: input.currency ?? "BRL",
        basePriceCents,
        discountCents,
        finalPriceCents,
        implementationFeeCents,
        isComplimentary,
        manualBillingOnly,
        startedAt,
        trialEndsAt: input.trialEndsAt ?? null,
        currentPeriodStart: input.currentPeriodStart ?? startedAt,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
        nextBillingAt: isComplimentary ? null : input.nextBillingAt ?? null,
        notes: input.notes ?? null,
        createdByUserId: input.createdByUserId ?? null,
        updatedByUserId: input.createdByUserId ?? null,
        metadata: input.metadata
          ? (input.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    await tx.administrator.update({
      where: { id: input.administratorId },
      data: {
        planId: input.planId,
        planStatus: status,
        planStartedAt: startedAt,
        planExpiresAt: input.trialEndsAt ?? input.currentPeriodEnd ?? null,
      },
    });

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        type:
          status === AdministratorPlanStatus.TRIALING
            ? SubscriptionEventType.TRIAL_STARTED
            : SubscriptionEventType.CREATED,
        description:
          status === AdministratorPlanStatus.TRIALING
            ? "Assinatura em período de trial criada."
            : "Assinatura comercial criada.",
        createdByUserId: input.createdByUserId ?? null,
        metadata: {
          planId: input.planId,
          origin: input.origin ?? SubscriptionOrigin.MANUAL,
          isComplimentary,
          manualBillingOnly,
        },
      },
    });

    return subscription;
  });
}

export async function createSubscriptionFromAcceptedProposal(params: {
  commercialProposalId: string;
  administratorId?: string;
  trialEndsAt?: Date | null;
  nextBillingAt?: Date | null;
  createdByUserId?: string | null;
}) {
  const proposal = await db.commercialProposal.findUnique({
    where: { id: params.commercialProposalId },
    select: {
      id: true,
      status: true,
      planId: true,
      monthlyPriceCents: true,
      implementationFeeCents: true,
      discountCents: true,
      convertedAdministratorId: true,
    },
  });

  if (!proposal) {
    throw new InvalidSubscriptionOperationError("Proposta não encontrada.");
  }

  if (proposal.status !== "ACCEPTED") {
    throw new InvalidSubscriptionOperationError(
      "Somente propostas aceitas podem originar uma assinatura.",
    );
  }

  const administratorId =
    params.administratorId ?? proposal.convertedAdministratorId;

  if (!administratorId) {
    throw new InvalidSubscriptionOperationError(
      "A proposta ainda não está vinculada a uma administradora convertida.",
    );
  }

  if (!proposal.planId) {
    throw new InvalidSubscriptionOperationError(
      "A proposta aceita não possui plano definido.",
    );
  }

  return createAdministratorSubscription({
    administratorId,
    planId: proposal.planId,
    commercialProposalId: proposal.id,
    status: params.trialEndsAt
      ? AdministratorPlanStatus.TRIALING
      : AdministratorPlanStatus.ACTIVE,
    billingInterval: SubscriptionBillingInterval.MONTHLY,
    origin: SubscriptionOrigin.COMMERCIAL_PROPOSAL,
    basePriceCents: proposal.monthlyPriceCents,
    discountCents: proposal.discountCents,
    implementationFeeCents: proposal.implementationFeeCents ?? 0,
    trialEndsAt: params.trialEndsAt ?? null,
    nextBillingAt: params.nextBillingAt ?? null,
    createdByUserId: params.createdByUserId ?? null,
  });
}

export async function changeSubscriptionPlan(
  input: ChangeSubscriptionPlanInput,
) {
  return db.$transaction(async (tx) => {
    const subscription = await tx.administratorSubscription.findUnique({
      where: { id: input.subscriptionId },
      select: {
        id: true,
        administratorId: true,
        planId: true,
        billingInterval: true,
        discountCents: true,
        status: true,
        isComplimentary: true,
      },
    });

    if (!subscription) {
      throw new SubscriptionNotFoundError(input.subscriptionId);
    }

    if (!OPEN_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
      throw new InvalidSubscriptionOperationError(
        "Não é possível alterar o plano de uma assinatura encerrada.",
      );
    }

    const newPlan = await tx.plan.findUnique({
      where: { id: input.newPlanId },
      select: {
        id: true,
        monthlyPriceCents: true,
        annualPriceCents: true,
      },
    });

    if (!newPlan) {
      throw new InvalidSubscriptionOperationError("Novo plano não encontrado.");
    }

    const billingInterval =
      input.billingInterval ?? subscription.billingInterval;
    const discountCents = input.discountCents ?? subscription.discountCents;
    const basePriceCents = subscription.isComplimentary
      ? 0
      : resolvePlanPrice(
          billingInterval,
          newPlan.monthlyPriceCents,
          newPlan.annualPriceCents,
          input.basePriceCents,
        );

    ensureNonNegativeInteger(discountCents, "discountCents");

    if (discountCents > basePriceCents) {
      throw new InvalidSubscriptionOperationError(
        "O desconto não pode ser maior que o preço-base.",
      );
    }

    const updated = await tx.administratorSubscription.update({
      where: { id: subscription.id },
      data: {
        planId: input.newPlanId,
        billingInterval,
        basePriceCents,
        discountCents,
        finalPriceCents: subscription.isComplimentary
          ? 0
          : basePriceCents - discountCents,
        nextBillingAt: input.nextBillingAt,
        updatedByUserId: input.updatedByUserId ?? null,
      },
    });

    await tx.administrator.update({
      where: { id: subscription.administratorId },
      data: { planId: input.newPlanId },
    });

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        type: SubscriptionEventType.PLAN_CHANGED,
        description: input.reason ?? "Plano da assinatura alterado.",
        createdByUserId: input.updatedByUserId ?? null,
        metadata: {
          previousPlanId: subscription.planId,
          newPlanId: input.newPlanId,
          billingInterval,
          basePriceCents,
          discountCents,
        },
      },
    });

    return updated;
  });
}

export async function setSubscriptionStatus(params: {
  subscriptionId: string;
  status: AdministratorPlanStatus;
  description?: string | null;
  updatedByUserId?: string | null;
}) {
  return db.$transaction(async (tx) => {
    const subscription = await tx.administratorSubscription.findUnique({
      where: { id: params.subscriptionId },
      select: { id: true, administratorId: true, status: true },
    });

    if (!subscription) {
      throw new SubscriptionNotFoundError(params.subscriptionId);
    }

    const now = new Date();
    const isEnded =
      params.status === AdministratorPlanStatus.CANCELED ||
      params.status === AdministratorPlanStatus.EXPIRED;

    const updated = await tx.administratorSubscription.update({
      where: { id: subscription.id },
      data: {
        status: params.status,
        endedAt: isEnded ? now : null,
        canceledAt:
          params.status === AdministratorPlanStatus.CANCELED ? now : undefined,
        updatedByUserId: params.updatedByUserId ?? null,
      },
    });

    await tx.administrator.update({
      where: { id: subscription.administratorId },
      data: {
        planStatus: params.status,
        planExpiresAt: isEnded ? now : undefined,
      },
    });

    const eventTypeByStatus: Partial<
      Record<AdministratorPlanStatus, SubscriptionEventType>
    > = {
      ACTIVE:
        subscription.status === AdministratorPlanStatus.SUSPENDED
          ? SubscriptionEventType.REACTIVATED
          : SubscriptionEventType.ACTIVATED,
      PAST_DUE: SubscriptionEventType.PAST_DUE,
      SUSPENDED: SubscriptionEventType.SUSPENDED,
      CANCELED: SubscriptionEventType.CANCELED,
      EXPIRED: SubscriptionEventType.EXPIRED,
      TRIALING: SubscriptionEventType.TRIAL_STARTED,
    };

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        type: eventTypeByStatus[params.status] ?? SubscriptionEventType.NOTES_UPDATED,
        description:
          params.description ??
          `Status alterado de ${subscription.status} para ${params.status}.`,
        createdByUserId: params.updatedByUserId ?? null,
        metadata: {
          previousStatus: subscription.status,
          newStatus: params.status,
        },
      },
    });

    return updated;
  });
}
