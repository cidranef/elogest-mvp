import {
  AdministratorPlanStatus,
  Prisma,
  SubscriptionChargeStatus,
  SubscriptionEventType,
  SubscriptionPaymentStatus,
} from "@prisma/client";

import { db } from "@/lib/db";

import {
  InvalidSubscriptionOperationError,
  SubscriptionNotFoundError,
} from "./subscription-errors";
import type {
  CreateManualChargeInput,
  RecordManualPaymentInput,
} from "./subscription-types";

function ensurePositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new InvalidSubscriptionOperationError(
      `${field} deve ser um valor inteiro positivo em centavos.`,
    );
  }
}

export async function createManualSubscriptionCharge(
  input: CreateManualChargeInput,
) {
  return db.$transaction(async (tx) => {
    const subscription = await tx.administratorSubscription.findUnique({
      where: { id: input.subscriptionId },
      select: {
        id: true,
        administratorId: true,
        status: true,
        finalPriceCents: true,
        currency: true,
        isComplimentary: true,
      },
    });

    if (!subscription) {
      throw new SubscriptionNotFoundError(input.subscriptionId);
    }

    if (subscription.isComplimentary) {
      throw new InvalidSubscriptionOperationError(
        "Assinaturas cortesia não devem gerar cobranças.",
      );
    }

    if (
      subscription.status === AdministratorPlanStatus.CANCELED ||
      subscription.status === AdministratorPlanStatus.EXPIRED
    ) {
      throw new InvalidSubscriptionOperationError(
        "Não é possível gerar cobrança para uma assinatura encerrada.",
      );
    }

    const administrator = await tx.administrator.findUnique({
      where: { id: subscription.administratorId },
      select: { isDemo: true },
    });

    if (administrator?.isDemo) {
      throw new InvalidSubscriptionOperationError(
        "A administradora Demo não pode receber cobranças comerciais.",
      );
    }

    const amountCents = input.amountCents ?? subscription.finalPriceCents;
    ensurePositiveInteger(amountCents, "amountCents");

    if (
      (input.referenceMonth === null || input.referenceMonth === undefined) !==
      (input.referenceYear === null || input.referenceYear === undefined)
    ) {
      throw new InvalidSubscriptionOperationError(
        "Mês e ano de referência devem ser informados juntos.",
      );
    }

    if (
      input.referenceMonth !== null &&
      input.referenceMonth !== undefined &&
      (input.referenceMonth < 1 || input.referenceMonth > 12)
    ) {
      throw new InvalidSubscriptionOperationError(
        "O mês de referência deve estar entre 1 e 12.",
      );
    }

    const charge = await tx.subscriptionCharge.create({
      data: {
        subscriptionId: subscription.id,
        administratorId: subscription.administratorId,
        status: SubscriptionChargeStatus.PENDING,
        description: input.description.trim(),
        currency: subscription.currency,
        amountCents,
        referenceMonth: input.referenceMonth ?? null,
        referenceYear: input.referenceYear ?? null,
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        dueAt: input.dueAt,
        notes: input.notes ?? null,
        createdByUserId: input.createdByUserId ?? null,
        updatedByUserId: input.createdByUserId ?? null,
        metadata: input.metadata
          ? (input.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        type: SubscriptionEventType.CHARGE_CREATED,
        description: `Cobrança manual criada: ${charge.description}.`,
        createdByUserId: input.createdByUserId ?? null,
        metadata: {
          chargeId: charge.id,
          amountCents,
          dueAt: charge.dueAt.toISOString(),
        },
      },
    });

    return charge;
  });
}

export async function recordManualSubscriptionPayment(
  input: RecordManualPaymentInput,
) {
  return db.$transaction(async (tx) => {
    const charge = await tx.subscriptionCharge.findUnique({
      where: { id: input.chargeId },
      select: {
        id: true,
        subscriptionId: true,
        administratorId: true,
        status: true,
        amountCents: true,
        paidAmountCents: true,
        currency: true,
      },
    });

    if (!charge) {
      throw new InvalidSubscriptionOperationError("Cobrança não encontrada.");
    }

    if (
      charge.status === SubscriptionChargeStatus.CANCELED ||
      charge.status === SubscriptionChargeStatus.WAIVED ||
      charge.status === SubscriptionChargeStatus.REFUNDED
    ) {
      throw new InvalidSubscriptionOperationError(
        "Esta cobrança não aceita novos pagamentos.",
      );
    }

    ensurePositiveInteger(input.amountCents, "amountCents");

    const remainingCents = charge.amountCents - charge.paidAmountCents;
    if (input.amountCents > remainingCents) {
      throw new InvalidSubscriptionOperationError(
        "O pagamento não pode ser maior que o saldo pendente da cobrança.",
      );
    }

    const confirmImmediately = Boolean(input.confirmImmediately);
    const payment = await tx.subscriptionPayment.create({
      data: {
        chargeId: charge.id,
        administratorId: charge.administratorId,
        status: confirmImmediately
          ? SubscriptionPaymentStatus.CONFIRMED
          : SubscriptionPaymentStatus.PENDING_CONFIRMATION,
        method: input.method,
        currency: charge.currency,
        amountCents: input.amountCents,
        paidAt: input.paidAt,
        confirmedAt: confirmImmediately ? new Date() : null,
        referenceCode: input.referenceCode ?? null,
        payerName: input.payerName ?? null,
        payerDocument: input.payerDocument ?? null,
        notes: input.notes ?? null,
        recordedByUserId: input.recordedByUserId ?? null,
        confirmedByUserId: confirmImmediately
          ? input.confirmedByUserId ?? input.recordedByUserId ?? null
          : null,
        metadata: input.metadata
          ? (input.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: charge.subscriptionId,
        type: confirmImmediately
          ? SubscriptionEventType.PAYMENT_CONFIRMED
          : SubscriptionEventType.PAYMENT_RECORDED,
        description: confirmImmediately
          ? "Pagamento manual registrado e confirmado."
          : "Pagamento manual registrado e aguardando confirmação.",
        createdByUserId: input.recordedByUserId ?? null,
        metadata: {
          chargeId: charge.id,
          paymentId: payment.id,
          amountCents: payment.amountCents,
        },
      },
    });

    if (confirmImmediately) {
      await recalculateChargeInsideTransaction(tx, charge.id);
    }

    return payment;
  });
}

export async function confirmManualSubscriptionPayment(params: {
  paymentId: string;
  confirmedByUserId?: string | null;
}) {
  return db.$transaction(async (tx) => {
    const payment = await tx.subscriptionPayment.findUnique({
      where: { id: params.paymentId },
      include: {
        charge: {
          select: { id: true, subscriptionId: true },
        },
      },
    });

    if (!payment) {
      throw new InvalidSubscriptionOperationError("Pagamento não encontrado.");
    }

    if (payment.status !== SubscriptionPaymentStatus.PENDING_CONFIRMATION) {
      throw new InvalidSubscriptionOperationError(
        "Somente pagamentos pendentes podem ser confirmados.",
      );
    }

    const updated = await tx.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: SubscriptionPaymentStatus.CONFIRMED,
        confirmedAt: new Date(),
        confirmedByUserId: params.confirmedByUserId ?? null,
      },
    });

    await recalculateChargeInsideTransaction(tx, payment.charge.id);

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: payment.charge.subscriptionId,
        type: SubscriptionEventType.PAYMENT_CONFIRMED,
        description: "Pagamento manual confirmado.",
        createdByUserId: params.confirmedByUserId ?? null,
        metadata: {
          chargeId: payment.charge.id,
          paymentId: payment.id,
          amountCents: payment.amountCents,
        },
      },
    });

    return updated;
  });
}

async function recalculateChargeInsideTransaction(
  tx: Prisma.TransactionClient,
  chargeId: string,
): Promise<void> {
  const charge = await tx.subscriptionCharge.findUnique({
    where: { id: chargeId },
    select: {
      id: true,
      subscriptionId: true,
      administratorId: true,
      amountCents: true,
      dueAt: true,
    },
  });

  if (!charge) {
    throw new InvalidSubscriptionOperationError("Cobrança não encontrada.");
  }

  const aggregate = await tx.subscriptionPayment.aggregate({
    where: {
      chargeId,
      status: SubscriptionPaymentStatus.CONFIRMED,
    },
    _sum: { amountCents: true },
  });

  const paidAmountCents = aggregate._sum.amountCents ?? 0;
  const fullyPaid = paidAmountCents >= charge.amountCents;
  const now = new Date();

  const updatedChargeStatus = fullyPaid
    ? SubscriptionChargeStatus.PAID
    : charge.dueAt && charge.dueAt < now
      ? SubscriptionChargeStatus.OVERDUE
      : SubscriptionChargeStatus.PENDING;

  await tx.subscriptionCharge.update({
    where: { id: chargeId },
    data: {
      paidAmountCents,
      status: updatedChargeStatus,
      paidAt: fullyPaid ? now : null,
      overdueAt:
        updatedChargeStatus === SubscriptionChargeStatus.OVERDUE
          ? now
          : null,
    },
  });

  if (fullyPaid) {
    const subscription = await tx.administratorSubscription.findUnique({
      where: { id: charge.subscriptionId },
      select: { status: true },
    });

    const remainingOpenCharges =
      await tx.subscriptionCharge.count({
        where: {
          subscriptionId: charge.subscriptionId,
          id: {
            not: chargeId,
          },
          status: {
            in: [
              SubscriptionChargeStatus.PENDING,
              SubscriptionChargeStatus.OVERDUE,
            ],
          },
        },
      });

    if (
      subscription &&
      remainingOpenCharges === 0 &&
      (subscription.status === AdministratorPlanStatus.PAST_DUE ||
        subscription.status === AdministratorPlanStatus.SUSPENDED)
    ) {
      await tx.administratorSubscription.update({
        where: { id: charge.subscriptionId },
        data: { status: AdministratorPlanStatus.ACTIVE },
      });

      await tx.administrator.update({
        where: { id: charge.administratorId },
        data: { planStatus: AdministratorPlanStatus.ACTIVE },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: charge.subscriptionId,
          type: SubscriptionEventType.REACTIVATED,
          description:
            "Assinatura reativada automaticamente após a quitação de todas as cobranças abertas.",
          metadata: {
            chargeId,
            remainingOpenCharges,
          },
        },
      });
    }
  }
}
