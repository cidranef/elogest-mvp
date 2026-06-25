import { AdministratorPlanStatus, Prisma } from "@prisma/client";

import { db } from "@/lib/db";

const subscriptionInclude = {
  administrator: {
    select: {
      id: true,
      name: true,
      status: true,
      isDemo: true,
      planStatus: true,
    },
  },
  plan: {
    select: {
      id: true,
      name: true,
      slug: true,
      monthlyPriceCents: true,
      annualPriceCents: true,
    },
  },
  commercialProposal: {
    select: { id: true, title: true, status: true },
  },
  charges: {
    orderBy: { createdAt: "desc" as const },
    include: {
      payments: { orderBy: { createdAt: "desc" as const } },
    },
  },
  events: {
    orderBy: { createdAt: "desc" as const },
    take: 100,
  },
} satisfies Prisma.AdministratorSubscriptionInclude;

export async function listAdministratorSubscriptions(params: {
  search?: string;
  status?: AdministratorPlanStatus;
  planId?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const search = params.search?.trim();

  const where: Prisma.AdministratorSubscriptionWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.planId ? { planId: params.planId } : {}),
    ...(search
      ? {
          OR: [
            { administrator: { name: { contains: search, mode: "insensitive" } } },
            { plan: { name: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [items, total] = await db.$transaction([
    db.administratorSubscription.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        administrator: {
          select: { id: true, name: true, isDemo: true, planStatus: true },
        },
        plan: { select: { id: true, name: true, slug: true } },
        _count: { select: { charges: true, events: true } },
      },
    }),
    db.administratorSubscription.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export async function getAdministratorSubscription(id: string) {
  return db.administratorSubscription.findUnique({
    where: { id },
    include: subscriptionInclude,
  });
}

export async function getAdministratorSubscriptionSummary() {
  const now = new Date();

  const [
    total,
    active,
    trialing,
    pastDue,
    suspended,
    canceled,
    recurring,
    pendingCharges,
    overdueCharges,
    confirmedPayments,
  ] = await db.$transaction([
    db.administratorSubscription.count(),
    db.administratorSubscription.count({ where: { status: AdministratorPlanStatus.ACTIVE } }),
    db.administratorSubscription.count({ where: { status: AdministratorPlanStatus.TRIALING } }),
    db.administratorSubscription.count({ where: { status: AdministratorPlanStatus.PAST_DUE } }),
    db.administratorSubscription.count({ where: { status: AdministratorPlanStatus.SUSPENDED } }),
    db.administratorSubscription.count({ where: { status: AdministratorPlanStatus.CANCELED } }),
    db.administratorSubscription.aggregate({
      where: {
        status: { in: [AdministratorPlanStatus.ACTIVE, AdministratorPlanStatus.PAST_DUE] },
        isComplimentary: false,
      },
      _sum: { finalPriceCents: true },
    }),
    db.subscriptionCharge.aggregate({
      where: { status: "PENDING" },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
    db.subscriptionCharge.aggregate({
      where: {
        dueAt: { lt: now },
        status: { in: ["PENDING", "OVERDUE"] },
      },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
    db.subscriptionPayment.aggregate({
      where: { status: "CONFIRMED" },
      _sum: { amountCents: true },
    }),
  ]);

  return {
    total,
    active,
    trialing,
    pastDue,
    suspended,
    canceled,
    monthlyRecurringRevenueCents: recurring._sum.finalPriceCents ?? 0,
    pendingCharges: pendingCharges._count._all,
    pendingAmountCents: pendingCharges._sum.amountCents ?? 0,
    overdueCharges: overdueCharges._count._all,
    overdueAmountCents: overdueCharges._sum.amountCents ?? 0,
    confirmedRevenueCents: confirmedPayments._sum.amountCents ?? 0,
  };
}
