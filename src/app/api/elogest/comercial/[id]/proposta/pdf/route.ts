import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";
import { proposalPdf } from "@/lib/commercial-proposal";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, { params }: Context) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const proposal = await db.commercialProposal.findUnique({
    where: { commercialLeadProfileId: id },
    include: {
      plan: { select: { name: true } },
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

  if (!proposal) {
    return NextResponse.json(
      { error: "Proposta não encontrada." },
      { status: 404 },
    );
  }

  const onboarding = proposal.commercialLeadProfile.onboardingRequest;
  const pdf = await proposalPdf({
    ...onboarding,
    title: proposal.title,
    planName: proposal.plan?.name,
    monthlyPriceCents: proposal.monthlyPriceCents,
    implementationFeeCents: proposal.implementationFeeCents,
    discountCents: proposal.discountCents,
    discountPercent: proposal.discountPercent,
    validUntil: proposal.validUntil,
    paymentTerms: proposal.paymentTerms,
    commercialNotes: proposal.commercialNotes,
    modules: proposal.modules,
    version: proposal.currentVersion,
    status: proposal.status,
    createdAt: proposal.createdAt,
    acceptedAt: proposal.acceptedAt,
    acceptedByName: proposal.acceptedByName,
    acceptedByEmail: proposal.acceptedByEmail,
    acceptanceStatement: proposal.acceptanceStatement,
  });

  const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength);

  return new NextResponse(body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="proposta-elogest-v${proposal.currentVersion}.pdf"`,
      "cache-control": "private, no-store, max-age=0",
    },
  });
}
