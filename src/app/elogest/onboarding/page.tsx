import Link from "next/link";
import { Prisma, Role } from "@prisma/client";
import EloGestShell from "@/components/EloGestShell";
import { db } from "@/lib/db";
import OnboardingActions from "./onboarding-actions";
import LeadManagementCard from "./lead-management-card";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

function first(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function asObject(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, Prisma.JsonValue>;
  }

  return value as Record<string, Prisma.JsonValue>;
}

function leadFromMetadata(metadata: Prisma.JsonValue | null) {
  const root = asObject(metadata);
  const lead = asObject(root.lead as Prisma.JsonValue | null);
  const attribution = asObject(root.attribution as Prisma.JsonValue | null);
  const owner = asObject(lead.commercialOwner as Prisma.JsonValue | null);

  return {
    priority: String(lead.priority || "NORMAL"),
    stage: String(lead.stage || "NOVO"),
    channel: String(lead.channel || attribution.medium || "SITE_PUBLICO"),
    source: String(lead.source || attribution.source || "DIRECT"),
    firstContactAt:
      typeof lead.firstContactAt === "string" ? lead.firstContactAt : null,
    nextActionAt:
      typeof lead.nextActionAt === "string" ? lead.nextActionAt : null,
    nextAction:
      typeof lead.nextAction === "string" ? lead.nextAction : null,
    internalNotes:
      typeof lead.internalNotes === "string" ? lead.internalNotes : null,
    commercialOwner:
      owner.id && owner.name && owner.email
        ? {
            id: String(owner.id),
            name: String(owner.name),
            email: String(owner.email),
          }
        : null,
    campaign:
      typeof attribution.campaign === "string" ? attribution.campaign : null,
    medium:
      typeof attribution.medium === "string" ? attribution.medium : null,
    referrer:
      typeof attribution.referrer === "string" ? attribution.referrer : null,
  };
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING_REVIEW: "Pendente",
    IN_CONTACT: "Em Contato",
    APPROVED: "Aprovada",
    CONVERTED: "Convertida",
    REJECTED: "Rejeitada",
  };
  return labels[status] || status;
}

function priorityLabel(priority: string) {
  const labels: Record<string, string> = {
    LOW: "Baixa",
    NORMAL: "Normal",
    HIGH: "Alta",
    URGENT: "Urgente",
  };
  return labels[priority] || priority;
}

function stageLabel(stage: string) {
  const labels: Record<string, string> = {
    NOVO: "Novo",
    QUALIFICACAO: "Qualificação",
    CONTATO: "Contato",
    PROPOSTA: "Proposta",
    NEGOCIACAO: "Negociação",
    GANHO: "Ganho",
    PERDIDO: "Perdido",
  };
  return labels[stage] || stage;
}

function formatDate(value?: Date | string | null) {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function EloGestOnboardingPage({
  searchParams,
}: PageProps) {
  const params = await Promise.resolve(searchParams || {});
  const status = first(params, "status").toUpperCase();
  const priority = first(params, "priority").toUpperCase();
  const stage = first(params, "stage").toUpperCase();
  const query = first(params, "q").trim().toLowerCase();

  const [allRequests, owners] = await Promise.all([
    db.onboardingRequest.findMany({
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
        status: true,
        rejectionReason: true,
        reviewedAt: true,
        convertedAt: true,
        rejectedAt: true,
        convertedAdminId: true,
        metadata: true,
        createdAt: true,
        interestedPlan: {
          select: { id: true, name: true, slug: true },
        },
        convertedAdmin: {
          select: { id: true, name: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.user.findMany({
      where: {
        role: Role.SUPER_ADMIN,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const enriched = allRequests.map((request) => ({
    ...request,
    lead: leadFromMetadata(request.metadata),
  }));

  const requests = enriched.filter((request) => {
    if (status && request.status !== status) return false;
    if (priority && request.lead.priority !== priority) return false;
    if (stage && request.lead.stage !== stage) return false;

    if (query) {
      const haystack = [
        request.administratorName,
        request.responsibleName,
        request.email,
        request.phone,
        request.city,
        request.state,
        request.lead.source,
        request.lead.channel,
        request.lead.campaign,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(query)) return false;
    }

    return true;
  });

  const total = enriched.length;
  const converted = enriched.filter((item) => item.status === "CONVERTED").length;
  const activePipeline = enriched.filter((item) =>
    ["PENDING_REVIEW", "IN_CONTACT", "APPROVED"].includes(item.status),
  ).length;
  const urgent = enriched.filter(
    (item) => item.lead.priority === "URGENT",
  ).length;
  const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;

  return (
    <EloGestShell current="onboarding">
      <div className="space-y-8">
        <section className="rounded-[34px] border border-[#DDE5DF] bg-white/90 p-6 shadow-[0_24px_80px_rgba(23,33,27,0.08)] sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="inline-flex rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-bold text-[#256D3C]">
                Funil Comercial EloGest
              </p>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#17211B] sm:text-4xl">
                Captação E Gestão De Leads
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[#64736A]">
                Acompanhe origem, prioridade, responsável, próxima ação,
                estágio comercial e conversão das solicitações públicas.
              </p>
            </div>

            <div className="flex gap-3">
              <Link
                href="/onboarding"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl border border-[#DDE5DF] bg-white px-5 py-3 text-sm font-bold text-[#17211B]"
              >
                Abrir Formulário Público
              </Link>
              <Link
                href="/elogest/administradoras"
                className="rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-bold text-white"
              >
                Administradoras
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Total De Leads", total, "Solicitações públicas registradas."],
            ["Funil Ativo", activePipeline, "Pendentes, em contato ou aprovadas."],
            ["Urgentes", urgent, "Leads classificados como urgentes."],
            ["Conversão", `${conversionRate}%`, `${converted} lead(s) convertido(s).`],
          ].map(([title, value, description]) => (
            <article
              key={String(title)}
              className="rounded-[26px] border border-[#DDE5DF] bg-white p-5 shadow-sm"
            >
              <p className="text-sm font-semibold text-[#64736A]">{title}</p>
              <p className="mt-3 text-3xl font-bold text-[#17211B]">{value}</p>
              <p className="mt-2 text-sm text-[#7A877F]">{description}</p>
            </article>
          ))}
        </section>

        <form className="grid gap-3 rounded-[26px] border border-[#DDE5DF] bg-white p-5 md:grid-cols-2 xl:grid-cols-5">
          <input
            name="q"
            defaultValue={first(params, "q")}
            placeholder="Buscar administradora, contato, origem..."
            className="h-11 rounded-xl border border-[#DDE5DF] px-3 text-sm font-semibold"
          />
          <select
            name="status"
            defaultValue={status}
            className="h-11 rounded-xl border border-[#DDE5DF] px-3 text-sm font-semibold"
          >
            <option value="">Todos Os Status</option>
            <option value="PENDING_REVIEW">Pendente</option>
            <option value="IN_CONTACT">Em Contato</option>
            <option value="APPROVED">Aprovada</option>
            <option value="CONVERTED">Convertida</option>
            <option value="REJECTED">Rejeitada</option>
          </select>
          <select
            name="priority"
            defaultValue={priority}
            className="h-11 rounded-xl border border-[#DDE5DF] px-3 text-sm font-semibold"
          >
            <option value="">Todas As Prioridades</option>
            <option value="LOW">Baixa</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">Alta</option>
            <option value="URGENT">Urgente</option>
          </select>
          <select
            name="stage"
            defaultValue={stage}
            className="h-11 rounded-xl border border-[#DDE5DF] px-3 text-sm font-semibold"
          >
            <option value="">Todos Os Estágios</option>
            <option value="NOVO">Novo</option>
            <option value="QUALIFICACAO">Qualificação</option>
            <option value="CONTATO">Contato</option>
            <option value="PROPOSTA">Proposta</option>
            <option value="NEGOCIACAO">Negociação</option>
            <option value="GANHO">Ganho</option>
            <option value="PERDIDO">Perdido</option>
          </select>
          <button className="h-11 rounded-xl bg-[#256D3C] px-4 text-sm font-bold text-white">
            Aplicar Filtros
          </button>
        </form>

        <section className="space-y-4">
          {requests.length === 0 ? (
            <div className="rounded-[26px] border border-dashed border-[#DDE5DF] bg-white p-10 text-center text-sm font-semibold text-[#64736A]">
              Nenhum lead encontrado com os filtros selecionados.
            </div>
          ) : (
            requests.map((request) => (
              <article
                key={request.id}
                className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm sm:p-6"
              >
                <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-[#17211B]">
                        {request.administratorName}
                      </h2>
                      <span className="rounded-full bg-[#F2F5F3] px-3 py-1 text-xs font-bold text-[#64736A]">
                        {statusLabel(request.status)}
                      </span>
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">
                        {priorityLabel(request.lead.priority)}
                      </span>
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">
                        {stageLabel(request.lead.stage)}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-[#64736A]">
                      {request.responsibleName} — {request.email}
                    </p>

                    <div className="mt-4 grid gap-3 text-sm text-[#64736A] sm:grid-cols-2 lg:grid-cols-4">
                      <p><strong className="text-[#17211B]">Plano:</strong> {request.interestedPlan?.name || "Não informado"}</p>
                      <p><strong className="text-[#17211B]">Origem:</strong> {request.lead.source}</p>
                      <p><strong className="text-[#17211B]">Canal:</strong> {request.lead.channel}</p>
                      <p><strong className="text-[#17211B]">Entrada:</strong> {formatDate(request.createdAt)}</p>
                    </div>

                    {request.lead.campaign && (
                      <p className="mt-3 text-xs font-semibold text-[#7A877F]">
                        Campanha: {request.lead.campaign}
                      </p>
                    )}

                    {request.message && (
                      <p className="mt-4 rounded-2xl bg-[#F7F9F8] p-4 text-sm leading-6 text-[#64736A]">
                        {request.message}
                      </p>
                    )}

                    <LeadManagementCard
                      requestId={request.id}
                      lead={request.lead}
                      owners={owners}
                    />
                  </div>

                  <aside className="rounded-2xl border border-[#DDE5DF] bg-[#F7F9F8] p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#7A877F]">
                      Ações
                    </p>
                    <div className="mt-3">
                      <OnboardingActions
                        requestId={request.id}
                        status={request.status}
                        convertedAdminId={request.convertedAdminId}
                      />
                    </div>

                    <div className="mt-4 border-t border-[#DDE5DF] pt-4 text-xs leading-5 text-[#64736A]">
                      <p>
                        Responsável:{" "}
                        <strong className="text-[#17211B]">
                          {request.lead.commercialOwner?.name || "Não atribuído"}
                        </strong>
                      </p>
                      <p className="mt-2">
                        Próxima ação:{" "}
                        <strong className="text-[#17211B]">
                          {request.lead.nextAction || "Não definida"}
                        </strong>
                      </p>
                      <p className="mt-2">
                        Prazo:{" "}
                        <strong className="text-[#17211B]">
                          {formatDate(request.lead.nextActionAt)}
                        </strong>
                      </p>
                    </div>
                  </aside>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </EloGestShell>
  );
}
