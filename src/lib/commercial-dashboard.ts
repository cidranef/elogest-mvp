import { db } from "@/lib/db";

const ACTIVE_OPPORTUNITY_STAGES = new Set([
  "QUALIFIED",
  "DEMO_SCHEDULED",
  "DEMO_COMPLETED",
  "PILOT_PROPOSED",
  "PILOT_ACTIVE",
  "PROPOSAL_SENT",
  "NEGOTIATION",
]);

const FUNNEL = [
  { key: "NEW", label: "Novos" },
  { key: "CONTACT", label: "Contato", stages: ["CONTACT_PENDING", "CONTACTED"] },
  { key: "DIAGNOSIS", label: "Diagnóstico", stages: ["DIAGNOSIS_SENT", "DIAGNOSIS_RECEIVED"] },
  { key: "QUALIFIED", label: "Qualificados", stages: ["QUALIFIED"] },
  { key: "DEMO", label: "Demonstração", stages: ["DEMO_SCHEDULED", "DEMO_COMPLETED"] },
  { key: "PILOT", label: "Piloto", stages: ["PILOT_PROPOSED", "PILOT_ACTIVE"] },
  { key: "PROPOSAL", label: "Proposta", stages: ["PROPOSAL_SENT", "NEGOTIATION"] },
  { key: "CONVERTED", label: "Convertidos", stages: ["CONVERTED"] },
] as const;

function netMonthlyValue(input: {
  monthlyPriceCents: number | null;
  discountCents: number;
  discountPercent: number | null;
}) {
  const gross = input.monthlyPriceCents ?? 0;
  const percentage = input.discountPercent
    ? Math.round((gross * input.discountPercent) / 100)
    : 0;
  return Math.max(0, gross - input.discountCents - percentage);
}

function daysBetween(date: Date, now: Date) {
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

export async function getCommercialExecutiveDashboard() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const nextSevenDays = new Date(now.getTime() + 7 * 86_400_000);

  const onboardingRequests = await db.onboardingRequest.findMany({ select: { id: true } });
  if (onboardingRequests.length > 0) {
    await db.commercialLeadProfile.createMany({
      data: onboardingRequests.map((item) => ({ onboardingRequestId: item.id })),
      skipDuplicates: true,
    });
  }

  const [leads, proposals, pilots] = await Promise.all([
    db.commercialLeadProfile.findMany({
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        stage: true,
        priority: true,
        score: true,
        nextFollowUpAt: true,
        lastContactAt: true,
        updatedAt: true,
        ownerUser: { select: { id: true, name: true, email: true } },
        onboardingRequest: {
          select: {
            administratorName: true,
            responsibleName: true,
            email: true,
            city: true,
            state: true,
            status: true,
            interestedPlan: { select: { name: true } },
          },
        },
      },
    }),
    db.commercialProposal.findMany({
      select: {
        commercialLeadProfileId: true,
        status: true,
        monthlyPriceCents: true,
        implementationFeeCents: true,
        discountCents: true,
        discountPercent: true,
        validUntil: true,
        acceptedAt: true,
        convertedAt: true,
        updatedAt: true,
      },
    }),
    db.commercialPilot.findMany({
      select: {
        commercialLeadProfileId: true,
        status: true,
        decision: true,
        expectedEndDate: true,
        updatedAt: true,
        items: { select: { status: true } },
      },
    }),
  ]);

  const proposalByLead = new Map(proposals.map((item) => [item.commercialLeadProfileId, item]));
  const pilotByLead = new Map(pilots.map((item) => [item.commercialLeadProfileId, item]));

  const converted = leads.filter((item) => item.stage === "CONVERTED");
  const lost = leads.filter((item) => item.stage === "LOST");
  const active = leads.filter((item) => ACTIVE_OPPORTUNITY_STAGES.has(item.stage));
  const convertedLast30Days = converted.filter((item) => item.updatedAt >= thirtyDaysAgo);
  const newLast30Days = leads.filter((item) => item.updatedAt >= thirtyDaysAgo);

  const pipelineMonthlyCents = proposals
    .filter((item) => !["REJECTED", "EXPIRED", "CANCELLED"].includes(item.status))
    .reduce((sum, item) => sum + netMonthlyValue(item), 0);

  const convertedLeadIds = new Set(converted.map((item) => item.id));

  const convertedMonthlyCents = proposals
    .filter(
      (item) =>
        convertedLeadIds.has(item.commercialLeadProfileId) &&
        item.convertedAt !== null
    )
    .reduce((sum, item) => sum + netMonthlyValue(item), 0);

  const implementationPipelineCents = proposals
    .filter((item) => !["REJECTED", "EXPIRED", "CANCELLED"].includes(item.status))
    .reduce((sum, item) => sum + (item.implementationFeeCents ?? 0), 0);

  const conversionBase = converted.length + lost.length;
  const conversionRate = conversionBase > 0 ? Math.round((converted.length / conversionBase) * 1000) / 10 : 0;

  const funnel = FUNNEL.map((item) => {
    const stages = "stages" in item ? item.stages : [item.key];
    const total = leads.filter((lead) => stages.includes(lead.stage as never)).length;
    return { key: item.key, label: item.label, total };
  });

  const overdueFollowUps = leads
    .filter((item) => item.nextFollowUpAt && item.nextFollowUpAt < now && !["CONVERTED", "LOST"].includes(item.stage))
    .sort((a, b) => (a.nextFollowUpAt?.getTime() ?? 0) - (b.nextFollowUpAt?.getTime() ?? 0));

  const upcomingFollowUps = leads
    .filter((item) => item.nextFollowUpAt && item.nextFollowUpAt >= now && item.nextFollowUpAt <= nextSevenDays)
    .sort((a, b) => (a.nextFollowUpAt?.getTime() ?? 0) - (b.nextFollowUpAt?.getTime() ?? 0));

  const staleLeads = leads
    .filter((item) => !["CONVERTED", "LOST"].includes(item.stage) && item.updatedAt < sevenDaysAgo)
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());

  const expiringProposals = proposals
    .filter((item) => item.validUntil && item.validUntil >= now && item.validUntil <= nextSevenDays && !["ACCEPTED", "REJECTED", "CANCELLED"].includes(item.status))
    .sort((a, b) => (a.validUntil?.getTime() ?? 0) - (b.validUntil?.getTime() ?? 0));

  const blockedPilots = pilots.filter((pilot) =>
    pilot.items.some((item) => item.status === "BLOCKED") || pilot.status === "PAUSED"
  );

  const serializeLead = (lead: (typeof leads)[number]) => ({
    id: lead.id,
    administratorName: lead.onboardingRequest.administratorName,
    responsibleName: lead.onboardingRequest.responsibleName,
    email: lead.onboardingRequest.email,
    city: lead.onboardingRequest.city,
    state: lead.onboardingRequest.state,
    stage: lead.stage,
    priority: lead.priority,
    score: lead.score,
    ownerName: lead.ownerUser?.name ?? null,
    nextFollowUpAt: lead.nextFollowUpAt,
    lastContactAt: lead.lastContactAt,
    updatedAt: lead.updatedAt,
    inactivityDays: daysBetween(lead.updatedAt, now),
    proposalStatus: proposalByLead.get(lead.id)?.status ?? null,
    pilotStatus: pilotByLead.get(lead.id)?.status ?? null,
  });

  const proposalLeadIds = new Set(expiringProposals.map((item) => item.commercialLeadProfileId));
  const pilotLeadIds = new Set(blockedPilots.map((item) => item.commercialLeadProfileId));

  return {
    generatedAt: now,
    kpis: {
      totalLeads: leads.length,
      activeOpportunities: active.length,
      qualifiedOpportunities: leads.filter((item) => item.score >= 26).length,
      converted: converted.length,
      convertedLast30Days: convertedLast30Days.length,
      newLast30Days: newLast30Days.length,
      lost: lost.length,
      conversionRate,
      pipelineMonthlyCents,
      convertedMonthlyCents,
      implementationPipelineCents,
      overdueFollowUps: overdueFollowUps.length,
      staleLeads: staleLeads.length,
      proposalsAwaitingDecision: proposals.filter((item) => ["SENT", "VIEWED", "NEGOTIATION"].includes(item.status)).length,
      activePilots: pilots.filter((item) => ["PLANNED", "ACTIVE", "PAUSED"].includes(item.status)).length,
    },
    funnel,
    priorities: {
      overdueFollowUps: overdueFollowUps.slice(0, 8).map(serializeLead),
      upcomingFollowUps: upcomingFollowUps.slice(0, 8).map(serializeLead),
      staleLeads: staleLeads.slice(0, 8).map(serializeLead),
      expiringProposals: leads.filter((item) => proposalLeadIds.has(item.id)).slice(0, 8).map(serializeLead),
      blockedPilots: leads.filter((item) => pilotLeadIds.has(item.id)).slice(0, 8).map(serializeLead),
    },
  };
}
