import { randomUUID } from "node:crypto";
import { CommercialProposalEventType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { clientIp, tokenHash, toPrismaJson } from "@/lib/commercial-proposal";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ token: string }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function findProposal(rawToken: string) {
  return db.commercialProposal.findUnique({
    where: { publicTokenHash: tokenHash(rawToken) },
    include: {
      plan: { select: { name: true, slug: true } },
      commercialLeadProfile: {
        select: {
          onboardingRequest: {
            select: {
              administratorName: true,
              responsibleName: true,
              email: true,
            },
          },
        },
      },
    },
  });
}

function isUnavailable(
  proposal: Awaited<ReturnType<typeof findProposal>>,
): proposal is null {
  return (
    !proposal ||
    !proposal.publicTokenExpiresAt ||
    proposal.publicTokenExpiresAt < new Date()
  );
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { token } = await params;
    const proposal = await findProposal(token);

    if (isUnavailable(proposal)) {
      return jsonError("Link inválido ou expirado.", 404);
    }

    const now = new Date();
    const ip = clientIp(request.headers) ?? "não identificado";
    const userAgent = request.headers.get("user-agent") ?? "não identificado";

    // O rastreamento não deve impedir o cliente de visualizar a proposta.
    try {
      await db.$transaction([
        db.commercialProposal.update({
          where: { id: proposal.id },
          data: {
            status: proposal.status === "SENT" ? "VIEWED" : proposal.status,
            firstViewedAt: proposal.firstViewedAt ?? now,
            lastViewedAt: now,
          },
        }),
        db.commercialProposalEvent.create({
          data: {
            id: randomUUID(),
            commercialProposalId: proposal.id,
            type: CommercialProposalEventType.VIEWED,
            description: "Proposta visualizada pelo link público.",
            metadata: toPrismaJson({ ip, userAgent }),
          },
        }),
      ]);
    } catch (trackingError) {
      console.error("Falha ao registrar visualização da proposta:", trackingError);
    }

    return NextResponse.json(
      {
        proposal: {
          id: proposal.id,
          title: proposal.title,
          status: proposal.status,
          plan: proposal.plan,
          monthlyPriceCents: proposal.monthlyPriceCents,
          implementationFeeCents: proposal.implementationFeeCents,
          discountCents: proposal.discountCents,
          discountPercent: proposal.discountPercent,
          validUntil: proposal.validUntil,
          paymentTerms: proposal.paymentTerms,
          commercialNotes: proposal.commercialNotes,
          modules: proposal.modules,
          currentVersion: proposal.currentVersion,
          acceptedAt: proposal.acceptedAt,
          lead: proposal.commercialLeadProfile.onboardingRequest,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Erro ao carregar proposta pública:", error);
    return jsonError("Não foi possível carregar a proposta agora.", 500);
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { token } = await params;
    const proposal = await findProposal(token);

    if (isUnavailable(proposal)) {
      return jsonError("Link inválido ou expirado.", 404);
    }

    if (proposal.status === "ACCEPTED") {
      return jsonError("Proposta já aceita.", 409);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const accepted = body.accepted === true;

    if (!name || !email || !accepted) {
      return jsonError("Informe nome, e-mail e confirme o aceite.", 400);
    }

    const statement = `Declaro que li e aceito integralmente a proposta EloGest versão ${proposal.currentVersion}.`;
    const now = new Date();
    const ip = clientIp(request.headers) ?? "não identificado";

    await db.$transaction(async (tx) => {
      await tx.commercialProposal.update({
        where: { id: proposal.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: now,
          acceptedByName: name,
          acceptedByEmail: email,
          acceptedIp: ip,
          acceptedUserAgent:
            request.headers.get("user-agent") ?? "não identificado",
          acceptanceStatement: statement,
        },
      });

      await tx.commercialProposalEvent.create({
        data: {
          id: randomUUID(),
          commercialProposalId: proposal.id,
          type: CommercialProposalEventType.ACCEPTED,
          description: "Proposta aceita eletronicamente.",
          metadata: toPrismaJson({
            name,
            email,
            version: proposal.currentVersion,
            ip,
          }),
        },
      });

      await tx.commercialLeadProfile.update({
        where: { id: proposal.commercialLeadProfileId },
        data: { stage: "NEGOTIATION", lastContactAt: now },
      });
    });

    return NextResponse.json(
      { ok: true, acceptedAt: now, statement },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Erro no aceite público da proposta:", error);
    return jsonError("Não foi possível registrar o aceite agora.", 500);
  }
}
