import Link from "next/link";
import { notFound } from "next/navigation";
import EloGestShell from "@/components/EloGestShell";
import { db } from "@/lib/db";
import DiagnosisLinksPanel from "./DiagnosisLinksPanel";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function DiagnosisManagementPage({ params }: Props) {
  const { id } = await params;
  const lead = await db.commercialLeadProfile.findUnique({
    where: { id },
    select: {
      id: true,
      onboardingRequest: { select: { administratorName: true, responsibleName: true, email: true } },
    },
  });
  if (!lead) notFound();

  return (
    <EloGestShell current="comercial">
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div>
          <Link href={`/elogest/comercial/${id}`} className="text-sm font-semibold text-[#256D3C]">← Voltar Para O Lead</Link>
          <h1 className="mt-3 text-3xl font-semibold text-[#17211B]">Diagnóstico Externo</h1>
          <p className="mt-2 text-sm text-[#5B665F]">{lead.onboardingRequest.administratorName} · {lead.onboardingRequest.responsibleName} · {lead.onboardingRequest.email}</p>
        </div>
        <DiagnosisLinksPanel leadId={id} />
      </main>
    </EloGestShell>
  );
}
