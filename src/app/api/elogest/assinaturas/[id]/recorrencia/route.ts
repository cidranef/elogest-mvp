import {
  SubscriptionBillingInterval,
  SubscriptionEventType,
} from "@prisma/client";
import { NextResponse } from "next/server";

import {
  billingApiError,
  requireBillingSuperAdmin,
} from "@/lib/billing/api";
import { db } from "@/lib/db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  try {
    const authUserId =
      await requireBillingSuperAdmin();

    const { id } = await context.params;

    const body = (await request.json()) as {
      enabled?: boolean;
    };

    if (typeof body.enabled !== "boolean") {
      return NextResponse.json(
        {
          error:
            "Informe se a cobrança recorrente deve ser habilitada.",
        },
        {
          status: 400,
        },
      );
    }

    const subscription =
      await db.administratorSubscription.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          administratorId: true,
          billingInterval: true,
          finalPriceCents: true,
          isComplimentary: true,
          nextBillingAt: true,
          administrator: {
            select: {
              isDemo: true,
            },
          },
        },
      });

    if (!subscription) {
      return NextResponse.json(
        {
          error: "Assinatura não encontrada.",
        },
        {
          status: 404,
        },
      );
    }

    if (body.enabled) {
      if (subscription.isComplimentary) {
        return NextResponse.json(
          {
            error:
              "Assinaturas cortesia não recebem cobrança recorrente.",
          },
          {
            status: 400,
          },
        );
      }

      if (subscription.administrator.isDemo) {
        return NextResponse.json(
          {
            error:
              "O ambiente Demo não recebe cobrança recorrente.",
          },
          {
            status: 400,
          },
        );
      }

      if (subscription.finalPriceCents <= 0) {
        return NextResponse.json(
          {
            error:
              "Defina o valor contratado antes de habilitar a recorrência.",
          },
          {
            status: 400,
          },
        );
      }

      if (!subscription.nextBillingAt) {
        return NextResponse.json(
          {
            error:
              "Defina a próxima data de cobrança antes de habilitar a recorrência.",
          },
          {
            status: 400,
          },
        );
      }

      if (
        subscription.billingInterval ===
        SubscriptionBillingInterval.CUSTOM
      ) {
        return NextResponse.json(
          {
            error:
              "A periodicidade personalizada exige geração manual.",
          },
          {
            status: 400,
          },
        );
      }
    }

    const updated = await db.$transaction(
      async (tx) => {
        const saved =
          await tx.administratorSubscription.update({
            where: {
              id,
            },
            data: {
              manualBillingOnly: !body.enabled,
              updatedByUserId: authUserId,
            },
            select: {
              id: true,
              manualBillingOnly: true,
              nextBillingAt: true,
              finalPriceCents: true,
            },
          });

        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: id,
            type:
              SubscriptionEventType.NOTES_UPDATED,
            createdByUserId: authUserId,
            description: body.enabled
              ? "Cobrança recorrente habilitada pelo EloGest."
              : "Cobrança recorrente desabilitada pelo EloGest.",
            metadata: {
              source:
                "SUBSCRIPTION_RECURRING_CONFIGURATION",
              recurringEnabled: body.enabled,
            },
          },
        });

        return saved;
      },
    );

    return NextResponse.json({
      ok: true,
      recurringEnabled:
        !updated.manualBillingOnly,
      subscription: updated,
    });
  } catch (error) {
    return billingApiError(error);
  }
}
