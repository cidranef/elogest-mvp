import Link from "next/link";
import EloGestShell from "@/components/EloGestShell";
import { db } from "@/lib/db";
import OnboardingActions from "./onboarding-actions";

/* =========================================================
   ELOGEST — SOLICITAÇÕES DE ACESSO

   Rota:
   /elogest/onboarding

   ETAPA 56.6 — ÁREA SUPER ADMIN DE SOLICITAÇÕES

   Objetivo:
   - Exibir as solicitações públicas recebidas pelo site.
   - Permitir análise inicial pelo Super Admin.
   - Marcar como em contato, aprovar ou rejeitar.
   - Preparar a conversão controlada para a 56.7.

   Segurança:
   - A proteção principal da área /elogest é feita pelo layout.
   - As ações de API também usam requireEloGestSuperAdmin().
   ========================================================= */

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?:
    | Promise<{
        status?: string;
      }>
    | {
        status?: string;
      };
};

type StatusFilter =
  | "ALL"
  | "PENDING_REVIEW"
  | "IN_CONTACT"
  | "APPROVED"
  | "CONVERTED"
  | "REJECTED";

const STATUS_FILTERS: {
  key: StatusFilter;
  label: string;
  href: string;
}[] = [
  {
    key: "ALL",
    label: "Todas",
    href: "/elogest/onboarding",
  },
  {
    key: "PENDING_REVIEW",
    label: "Pendentes",
    href: "/elogest/onboarding?status=PENDING_REVIEW",
  },
  {
    key: "IN_CONTACT",
    label: "Em Contato",
    href: "/elogest/onboarding?status=IN_CONTACT",
  },
  {
    key: "APPROVED",
    label: "Aprovadas",
    href: "/elogest/onboarding?status=APPROVED",
  },
  {
    key: "CONVERTED",
    label: "Convertidas",
    href: "/elogest/onboarding?status=CONVERTED",
  },
  {
    key: "REJECTED",
    label: "Rejeitadas",
    href: "/elogest/onboarding?status=REJECTED",
  },
];

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "Não informado";
  }

  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) {
    return "Sem telefone";
  }

  if (digits.length === 11) {
    return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  }

  if (digits.length === 10) {
    return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  }

  return value || digits;
}

function normalizeStatusFilter(value?: string | null): StatusFilter {
  const status = String(value || "").trim().toUpperCase();

  if (
    status === "PENDING_REVIEW" ||
    status === "IN_CONTACT" ||
    status === "APPROVED" ||
    status === "CONVERTED" ||
    status === "REJECTED"
  ) {
    return status;
  }

  return "ALL";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING_REVIEW: "Pendente De Análise",
    IN_CONTACT: "Em Contato",
    APPROVED: "Aprovada",
    CONVERTED: "Convertida",
    REJECTED: "Rejeitada",
  };

  return labels[status] || status;
}

function statusClasses(status: string) {
  if (status === "PENDING_REVIEW") {
    return "border-yellow-200 bg-yellow-50 text-yellow-800";
  }

  if (status === "IN_CONTACT") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }

  if (status === "APPROVED" || status === "CONVERTED") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  if (status === "REJECTED") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  return "border-[#DDE5DF] bg-[#F7F9F8] text-[#64736A]";
}

function buildLocation(city?: string | null, state?: string | null) {
  const parts = [city, state].filter(Boolean);

  return parts.length > 0 ? parts.join(" — ") : "Local não informado";
}

function StatCard({
  title,
  value,
  description,
  tone = "default",
}: {
  title: string;
  value: number;
  description: string;
  tone?: "default" | "success" | "warning" | "muted";
}) {
  const toneClasses = {
    default: "border-[#DDE5DF] bg-white/92",
    success: "border-[#CFE6D4] bg-[#F7FBF8]",
    warning: "border-yellow-200 bg-yellow-50/80",
    muted: "border-[#DDE5DF] bg-[#F7F9F8]",
  };

  return (
    <div
      className={[
        "rounded-[26px] border p-5 shadow-[0_16px_48px_rgba(23,33,27,0.06)]",
        toneClasses[tone],
      ].join(" ")}
    >
      <p className="text-sm font-semibold text-[#64736A]">
        {title}
      </p>

      <p className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-[#17211B]">
        {formatNumber(value)}
      </p>

      <p className="mt-2 text-sm leading-6 text-[#7A877F]">
        {description}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F7F9F8] px-4 py-10 text-center">
      <p className="text-sm font-semibold text-[#17211B]">
        Nenhuma solicitação encontrada.
      </p>

      <p className="mt-1 text-sm text-[#64736A]">
        As solicitações enviadas pelo formulário público aparecerão aqui.
      </p>

      <Link
        href="/onboarding"
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 py-3 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
      >
        Abrir formulário público
      </Link>
    </div>
  );
}

export default async function EloGestOnboardingPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams || {});
  const activeStatus = normalizeStatusFilter(resolvedSearchParams.status);

  const where =
    activeStatus === "ALL"
      ? {}
      : {
          status: activeStatus,
        };

  const [requests, total, pending, inContact, approved, converted, rejected] =
    await Promise.all([
      db.onboardingRequest.findMany({
        where,
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
          createdAt: true,
          updatedAt: true,
          interestedPlan: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          reviewedByUser: {
            select: {
              id: true,
              name: true,
              email: true,
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
        orderBy: [
          {
            createdAt: "desc",
          },
        ],
      }),
      db.onboardingRequest.count(),
      db.onboardingRequest.count({
        where: {
          status: "PENDING_REVIEW",
        },
      }),
      db.onboardingRequest.count({
        where: {
          status: "IN_CONTACT",
        },
      }),
      db.onboardingRequest.count({
        where: {
          status: "APPROVED",
        },
      }),
      db.onboardingRequest.count({
        where: {
          status: "CONVERTED",
        },
      }),
      db.onboardingRequest.count({
        where: {
          status: "REJECTED",
        },
      }),
    ]);

  return (
    <EloGestShell current="onboarding">
      <div className="space-y-8">
        <section className="rounded-[34px] border border-[#DDE5DF] bg-white/90 p-6 shadow-[0_24px_80px_rgba(23,33,27,0.08)] backdrop-blur sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                Funil público EloGest
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-[#17211B] sm:text-4xl">
                Solicitações De Acesso
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#64736A] sm:text-base sm:leading-7">
                Acompanhe os pedidos enviados pela página pública, registre o
                andamento comercial e aprove solicitações para conversão
                controlada em administradora.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/onboarding"
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir o formulário público em uma nova aba"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 py-3 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
              >
                Abrir Formulário Público
              </Link>

              <Link
                href="/elogest/administradoras"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32]"
              >
                Administradoras
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Total"
            value={total}
            description="Solicitações recebidas pelo site público."
          />

          <StatCard
            title="Pendentes"
            value={pending}
            description="Aguardando primeira análise do Super Admin."
            tone="warning"
          />

          <StatCard
            title="Em Contato"
            value={inContact}
            description="Solicitações já assumidas pelo atendimento comercial."
          />

          <StatCard
            title="Aprovadas"
            value={approved + converted}
            description={`${formatNumber(converted)} convertida(s) em administradora.`}
            tone="success"
          />
        </section>

        <section className="rounded-[28px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.025em] text-[#17211B]">
                Onboarding controlado
              </h2>

              <p className="mt-1 text-sm leading-6 text-[#64736A]">
                A conversão cria a administradora ativa de forma controlada,
                vincula o plano de interesse ou o Plano Free como fallback e
                prepara as categorias financeiras padrão sem criar senha automática.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                Sem WhatsApp Real
              </span>

              <span className="rounded-full border border-[#DDE5DF] bg-[#F7F9F8] px-3 py-1 text-xs font-semibold text-[#64736A]">
                Análise Manual
              </span>

              <span className="rounded-full border border-[#DDE5DF] bg-[#F7F9F8] px-3 py-1 text-xs font-semibold text-[#64736A]">
                Rejeitadas: {formatNumber(rejected)}
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)] backdrop-blur">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#17211B]">
                Lista de solicitações
              </h2>

              <p className="mt-1 text-sm leading-6 text-[#64736A]">
                Filtre por status e registre o avanço comercial de cada pedido.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((filter) => {
                const active = activeStatus === filter.key;

                return (
                  <Link
                    key={filter.key}
                    href={filter.href}
                    className={[
                      "inline-flex min-h-9 items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition",
                      active
                        ? "border-[#256D3C] bg-[#256D3C] text-white"
                        : "border-[#DDE5DF] bg-white text-[#64736A] hover:border-[#256D3C] hover:text-[#256D3C]",
                    ].join(" ")}
                  >
                    {filter.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {requests.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-4">
              {requests.map((request) => (
                <article
                  key={request.id}
                  className="rounded-[26px] border border-[#DDE5DF] bg-white p-5 shadow-[0_14px_42px_rgba(23,33,27,0.05)]"
                >
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                            statusClasses(request.status),
                          ].join(" ")}
                        >
                          {statusLabel(request.status)}
                        </span>

                        <span className="rounded-full border border-[#DDE5DF] bg-[#F7F9F8] px-3 py-1 text-xs font-semibold text-[#64736A]">
                          Recebida em {formatDate(request.createdAt)}
                        </span>

                        {request.interestedPlan && (
                          <span className="rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                            Plano {request.interestedPlan.name}
                          </span>
                        )}
                      </div>

                      <h3 className="mt-4 text-xl font-semibold tracking-[-0.025em] text-[#17211B]">
                        {request.administratorName}
                      </h3>

                      <p className="mt-2 text-sm leading-6 text-[#64736A]">
                        Responsável: <strong className="font-semibold text-[#17211B]">{request.responsibleName}</strong>
                      </p>

                      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-[#EEF2EF] bg-[#F7F9F8] p-4">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                            E-mail
                          </p>
                          <p className="mt-2 break-words font-semibold text-[#17211B]">
                            {request.email}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-[#EEF2EF] bg-[#F7F9F8] p-4">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                            Telefone
                          </p>
                          <p className="mt-2 font-semibold text-[#17211B]">
                            {formatPhone(request.phone)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-[#EEF2EF] bg-[#F7F9F8] p-4">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                            Local
                          </p>
                          <p className="mt-2 font-semibold text-[#17211B]">
                            {buildLocation(request.city, request.state)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-[#EEF2EF] bg-[#F7F9F8] p-4">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                            Estrutura
                          </p>
                          <p className="mt-2 font-semibold text-[#17211B]">
                            {formatNumber(request.condominiumEstimate)} condomínio(s)
                          </p>
                          <p className="mt-1 text-xs text-[#64736A]">
                            {formatNumber(request.unitEstimate)} unidade(s)
                          </p>
                        </div>
                      </div>

                      {request.message && (
                        <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-white p-4">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                            Mensagem
                          </p>
                          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#5E6B63]">
                            {request.message}
                          </p>
                        </div>
                      )}

                      {(request.reviewedAt || request.reviewedByUser || request.rejectionReason) && (
                        <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-[#F7F9F8] p-4 text-sm leading-6 text-[#64736A]">
                          {request.reviewedAt && (
                            <p>
                              Revisada em {formatDate(request.reviewedAt)}
                              {request.reviewedByUser?.name
                                ? ` por ${request.reviewedByUser.name}`
                                : ""}
                              .
                            </p>
                          )}

                          {request.rejectionReason && (
                            <p className="mt-1">
                              Motivo da rejeição: <strong className="font-semibold text-red-800">{request.rejectionReason}</strong>
                            </p>
                          )}

                          {request.convertedAdmin && (
                            <p className="mt-1">
                              Convertida em administradora: <Link href={`/elogest/administradoras/${request.convertedAdmin.id}`} className="font-semibold text-[#256D3C] hover:underline">{request.convertedAdmin.name}</Link>.
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="w-full shrink-0 rounded-2xl border border-[#DDE5DF] bg-[#F7F9F8] p-4 xl:w-72">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                        Ações
                      </p>

                      <div className="mt-3">
                        <OnboardingActions
                          requestId={request.id}
                          status={request.status}
                          convertedAdminId={request.convertedAdmin?.id}
                        />
                      </div>

                      <div className="mt-4 border-t border-[#DDE5DF] pt-4">
                        <p className="text-xs leading-5 text-[#64736A]">
                          A conversão cria a administradora e as categorias financeiras padrão.
                          O primeiro acesso deve ser criado manualmente com senha segura.
                        </p>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </EloGestShell>
  );
}
