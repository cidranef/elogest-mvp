import Link from "next/link";
import { notFound } from "next/navigation";
import EloGestShell from "@/components/EloGestShell";
import { db } from "@/lib/db";
import {
  commercialPriorityLabel,
  commercialStageLabel,
  scoreClassification,
} from "@/lib/commercial-lead";
import CommercialLeadEditor from "./CommercialLeadEditor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function formatDate(value: Date | null | undefined) {
  if (!value) return "Não definido";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

function datetimeLocal(value: Date | null | undefined) {
  if (!value) return "";

  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

export default async function CommercialLeadDetailPage({ params }: Props) {
  const { id } = await params;

  const [item, owners] = await Promise.all([
    db.commercialLeadProfile.findUnique({
      where: { id },
      select: {
        id: true,
        stage: true,
        priority: true,
        score: true,
        ownerUserId: true,
        nextFollowUpAt: true,
        notes: true,
        lostReason: true,
        strategicPotential: true,
        investorInterest: true,
        qualification: {
          select: {
            status: true,
            totalScore: true,
            classification: true,
            completedAt: true,
          },
        },
        onboardingRequest: {
          select: {
            id: true,
            administratorName: true,
            responsibleName: true,
            email: true,
            phone: true,
            city: true,
            state: true,
            condominiumEstimate: true,
            unitEstimate: true,
            message: true,
            createdAt: true,
            interestedPlan: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            convertedAdmin: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
        },
        ownerUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        logs: {
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            action: true,
            description: true,
            createdAt: true,
            createdByUser: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    }),
    db.user.findMany({
      where: { role: "SUPER_ADMIN" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
      },
    }),
  ]);

  if (!item) notFound();

  const lead = item.onboardingRequest;
  const qualificationScore = item.qualification?.totalScore ?? null;
  const qualificationLabel = qualificationScore == null
    ? "Pontuação Ainda Não Calculada"
    : `${qualificationScore}/50 · ${scoreClassification(qualificationScore)}`;

  return (
    <EloGestShell current="comercial">
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div>
          <Link
            href="/elogest/comercial"
            className="text-sm font-semibold text-[#256D3C]"
          >
            ← Voltar Para A Central Comercial
          </Link>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#17211B]">
            {lead.administratorName}
          </h1>

          <p className="mt-2 text-sm text-[#5B665F]">
            {lead.responsibleName} · {lead.email}
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/elogest/comercial/${id}/qualificacao`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#256D3C] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1E5A32]"
            >
              Abrir Qualificação Comercial
            </Link>

            <Link
              href="/elogest/comercial/materiais"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#C9D6CD] bg-white px-4 py-2 text-sm font-semibold text-[#256D3C] shadow-sm transition hover:bg-[#F4F8F5]"
            >
              Biblioteca De Materiais
            </Link>
            <Link
              href={`/elogest/comercial/${id}/reunioes`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#C9D6CD] bg-white px-4 py-2 text-sm font-semibold text-[#256D3C] shadow-sm transition hover:bg-[#F4F8F5]"
            >
              Reuniões E Follow-up
            </Link>

            <Link
              href={`/elogest/comercial/${id}/diagnostico`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#C9D6CD] bg-white px-4 py-2 text-sm font-semibold text-[#256D3C] shadow-sm transition hover:bg-[#F4F8F5]"
            >
              Diagnóstico Externo
            </Link>
          <Link
            href={`/elogest/comercial/${id}/piloto`}
            className="inline-flex items-center rounded-xl border border-[#256D3C] px-4 py-2.5 text-sm font-semibold text-[#256D3C] transition hover:bg-[#EEF7F1]"
          >
            Piloto Comercial
          </Link>
          <Link
            href={`/elogest/comercial/${id}/proposta`}
            className="inline-flex items-center rounded-xl border border-[#256D3C] px-4 py-2.5 text-sm font-semibold text-[#256D3C] transition hover:bg-[#EEF7F1]"
          >
            Proposta E Conversão
          </Link>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            ["Estágio", commercialStageLabel(item.stage)],
            ["Prioridade", commercialPriorityLabel(item.priority)],
            ["Pontuação", qualificationLabel],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-3xl border border-[#DDE5DF] bg-white p-5 shadow-sm"
            >
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7A847D]">
                {label}
              </p>
              <p className="mt-2 text-lg font-semibold text-[#17211B]">{value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-[#DDE5DF] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-[#17211B]">Dados Do Lead</h2>

            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[#7A847D]">Responsável</dt>
                <dd className="mt-1 font-semibold text-[#344139]">
                  {lead.responsibleName}
                </dd>
              </div>

              <div>
                <dt className="text-[#7A847D]">Telefone</dt>
                <dd className="mt-1 font-semibold text-[#344139]">
                  {lead.phone || "Não informado"}
                </dd>
              </div>

              <div>
                <dt className="text-[#7A847D]">Cidade/Estado</dt>
                <dd className="mt-1 font-semibold text-[#344139]">
                  {lead.city || "Não informado"}
                  {lead.state ? `/${lead.state}` : ""}
                </dd>
              </div>

              <div>
                <dt className="text-[#7A847D]">Plano De Interesse</dt>
                <dd className="mt-1 font-semibold text-[#344139]">
                  {lead.interestedPlan?.name || "Não informado"}
                </dd>
              </div>

              <div>
                <dt className="text-[#7A847D]">Estimativa De Condomínios</dt>
                <dd className="mt-1 font-semibold text-[#344139]">
                  {lead.condominiumEstimate ?? "Não informada"}
                </dd>
              </div>

              <div>
                <dt className="text-[#7A847D]">Estimativa De Unidades</dt>
                <dd className="mt-1 font-semibold text-[#344139]">
                  {lead.unitEstimate ?? "Não informada"}
                </dd>
              </div>

              <div>
                <dt className="text-[#7A847D]">Recebido Em</dt>
                <dd className="mt-1 font-semibold text-[#344139]">
                  {formatDate(lead.createdAt)}
                </dd>
              </div>

              <div>
                <dt className="text-[#7A847D]">Responsável Comercial</dt>
                <dd className="mt-1 font-semibold text-[#344139]">
                  {item.ownerUser?.name || "Não atribuído"}
                </dd>
              </div>
            </dl>

            {lead.message && (
              <div className="mt-5 rounded-2xl bg-[#F6F8F6] p-4 text-sm leading-6 text-[#536058]">
                {lead.message}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-[#DDE5DF] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-[#17211B]">
              Histórico Comercial
            </h2>

            <div className="mt-5 space-y-4">
              {item.logs.length === 0 ? (
                <p className="text-sm text-[#667168]">
                  Nenhuma alteração registrada.
                </p>
              ) : (
                item.logs.map((log) => (
                  <div key={log.id} className="border-l-2 border-[#8ED08E] pl-4">
                    <p className="text-sm font-semibold text-[#344139]">
                      {log.description || log.action}
                    </p>
                    <p className="mt-1 text-xs text-[#7A847D]">
                      {formatDate(log.createdAt)} · {log.createdByUser?.name || "Sistema"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <CommercialLeadEditor
          id={item.id}
          owners={owners}
          initial={{
            stage: item.stage,
            priority: item.priority,
            ownerUserId: item.ownerUserId,
            nextFollowUpAt: datetimeLocal(item.nextFollowUpAt),
            notes: item.notes || "",
            lostReason: item.lostReason || "",
            strategicPotential: item.strategicPotential,
            investorInterest: item.investorInterest,
          }}
        />
      </main>
    </EloGestShell>
  );
}



