import Link from "next/link";
import type { CommercialLeadPriority, CommercialLeadStage, Prisma } from "@prisma/client";
import EloGestShell from "@/components/EloGestShell";
import { db } from "@/lib/db";
import { getCommercialExecutiveDashboard } from "@/lib/commercial-dashboard";
import {
  COMMERCIAL_PRIORITY_OPTIONS,
  COMMERCIAL_STAGE_OPTIONS,
  ONBOARDING_STATUS_LABELS,
  commercialPriorityLabel,
  commercialStageLabel,
  scoreClassification,
} from "@/lib/commercial-lead";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  search?: string;
  stage?: string;
  priority?: string;
  ownerUserId?: string;
}>;

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Não definido";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Não definido";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function metricCard(label: string, value: string | number, supporting?: string) {
  return (
    <div className="rounded-3xl border border-[#DDE5DF] bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6A756D]">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-[#17211B]">{value}</p>
      {supporting ? <p className="mt-2 text-xs leading-5 text-[#78827B]">{supporting}</p> : null}
    </div>
  );
}

function PriorityList({
  title,
  empty,
  items,
  accent = "#256D3C",
}: {
  title: string;
  empty: string;
  items: Array<{
    id: string;
    administratorName: string;
    stage: CommercialLeadStage;
    priority: CommercialLeadPriority;
    nextFollowUpAt: Date | string | null;
    inactivityDays: number;
  }>;
  accent?: string;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-[#DDE5DF] bg-white shadow-sm">
      <div className="border-b border-[#E8EDE9] px-5 py-4">
        <h3 className="font-semibold text-[#17211B]">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-6 text-sm text-[#6A756D]">{empty}</p>
      ) : (
        <div className="divide-y divide-[#EEF2EF]">
          {items.map((item) => (
            <Link key={item.id} href={`/elogest/comercial/${item.id}`} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-[#F8FAF8]">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#17211B]">{item.administratorName}</p>
                <p className="mt-1 text-xs text-[#748078]">{commercialStageLabel(item.stage)} · {commercialPriorityLabel(item.priority)}</p>
              </div>
              <div className="shrink-0 text-right">
                <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${accent}14`, color: accent }}>
                  {item.nextFollowUpAt ? formatDate(item.nextFollowUpAt) : `${item.inactivityDays} dia(s)`}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function EloGestComercialPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = await searchParams;
  const search = filters.search?.trim() || "";
  const stage = filters.stage as CommercialLeadStage | undefined;
  const priority = filters.priority as CommercialLeadPriority | undefined;
  const ownerUserId = filters.ownerUserId || undefined;

  const dashboard = await getCommercialExecutiveDashboard();

  const where: Prisma.CommercialLeadProfileWhereInput = {
    ...(stage ? { stage } : {}),
    ...(priority ? { priority } : {}),
    ...(ownerUserId ? { ownerUserId } : {}),
    ...(search
      ? {
          onboardingRequest: {
            OR: [
              { administratorName: { contains: search, mode: "insensitive" } },
              { responsibleName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { city: { contains: search, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };

  const [items, owners, totalFiltered] = await Promise.all([
    db.commercialLeadProfile.findMany({
      where,
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      include: {
        onboardingRequest: { include: { interestedPlan: { select: { name: true } } } },
        ownerUser: { select: { id: true, name: true, email: true } },
      },
    }),
    db.user.findMany({
      where: { role: "SUPER_ADMIN" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    db.commercialLeadProfile.count({ where }),
  ]);

  const maxFunnel = Math.max(1, ...dashboard.funnel.map((item) => item.total));

  return (
    <EloGestShell current="comercial">
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C]">Etapa 57.8.9</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B]">Central Comercial</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5B665F]">Visão executiva do funil, receita potencial, conversões e pendências que exigem ação comercial.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/elogest/comercial/materiais" className="rounded-2xl border border-[#C9D6CD] bg-white px-4 py-3 text-sm font-semibold text-[#245C37] shadow-sm">Biblioteca De Materiais</Link>
            <Link href="/elogest/onboarding" className="rounded-2xl bg-[#256D3C] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5B33]">Ver Onboarding</Link>
          </div>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metricCard("Leads No Funil", dashboard.kpis.totalLeads, `${dashboard.kpis.newLast30Days} movimentados nos últimos 30 dias`)}
          {metricCard("Oportunidades Ativas", dashboard.kpis.activeOpportunities, `${dashboard.kpis.qualifiedOpportunities} com pontuação qualificada`)}
          {metricCard("Conversão", `${dashboard.kpis.conversionRate}%`, `${dashboard.kpis.converted} convertidos · ${dashboard.kpis.lost} perdidos`)}
          {metricCard("Receita Mensal Convertida", formatCurrency(dashboard.kpis.convertedMonthlyCents), `${dashboard.kpis.convertedLast30Days} conversão(ões) nos últimos 30 dias`)}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metricCard("Pipeline Mensal", formatCurrency(dashboard.kpis.pipelineMonthlyCents), "Valor líquido das propostas abertas e aceitas")}
          {metricCard("Implantação Potencial", formatCurrency(dashboard.kpis.implementationPipelineCents), "Taxas previstas nas propostas em andamento")}
          {metricCard("Propostas Em Decisão", dashboard.kpis.proposalsAwaitingDecision, "Enviadas, visualizadas ou em negociação")}
          {metricCard("Pilotos Ativos", dashboard.kpis.activePilots, "Planejados, em andamento ou pausados")}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
          <div className="rounded-3xl border border-[#DDE5DF] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[#17211B]">Funil Comercial</h2>
                <p className="mt-1 text-sm text-[#6A756D]">Distribuição atual dos leads por macroetapa.</p>
              </div>
              <span className="rounded-full bg-[#EDF7F0] px-3 py-1 text-xs font-semibold text-[#256D3C]">Atualizado agora</span>
            </div>
            <div className="mt-6 space-y-4">
              {dashboard.funnel.map((item) => (
                <div key={item.key} className="grid grid-cols-[110px_1fr_42px] items-center gap-3">
                  <p className="text-sm font-medium text-[#3D4941]">{item.label}</p>
                  <div className="h-3 overflow-hidden rounded-full bg-[#EDF1EE]">
                    <div className="h-full rounded-full bg-[#2E7D49]" style={{ width: `${Math.max(item.total > 0 ? 6 : 0, (item.total / maxFunnel) * 100)}%` }} />
                  </div>
                  <p className="text-right text-sm font-semibold text-[#17211B]">{item.total}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-[#DDE5DF] bg-[#123C2A] p-6 text-white shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9FE0B5]">Resumo De Atenção</p>
            <h2 className="mt-3 text-2xl font-semibold">Pendências Comerciais</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {[
                ["Follow-ups Vencidos", dashboard.kpis.overdueFollowUps],
                ["Leads Sem Movimento", dashboard.kpis.staleLeads],
                ["Propostas Em Decisão", dashboard.kpis.proposalsAwaitingDecision],
                ["Pilotos Ativos", dashboard.kpis.activePilots],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/5 px-4 py-3">
                  <span className="text-sm text-white/80">{label}</span>
                  <strong className="text-xl">{value}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <PriorityList title="Follow-ups Vencidos" empty="Nenhum acompanhamento vencido." items={dashboard.priorities.overdueFollowUps} accent="#B54708" />
          <PriorityList title="Próximos 7 Dias" empty="Nenhum acompanhamento previsto para os próximos sete dias." items={dashboard.priorities.upcomingFollowUps} />
          <PriorityList title="Leads Sem Movimento" empty="Nenhum lead está parado há mais de sete dias." items={dashboard.priorities.staleLeads} accent="#8A3FFC" />
          <PriorityList title="Propostas Próximas Do Vencimento" empty="Nenhuma proposta vence nos próximos sete dias." items={dashboard.priorities.expiringProposals} accent="#B54708" />
          <PriorityList title="Pilotos Com Impedimento" empty="Nenhum piloto está pausado ou bloqueado." items={dashboard.priorities.blockedPilots} accent="#C2410C" />
        </section>

        <form className="grid gap-3 rounded-3xl border border-[#DDE5DF] bg-white p-5 shadow-sm lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <input name="search" defaultValue={search} placeholder="Buscar administradora, responsável ou e-mail" className="rounded-2xl border border-[#DDE5DF] bg-white px-4 py-3 text-sm text-[#17211B] outline-none placeholder:text-[#98A29B] focus:border-[#256D3C]" />
          <select name="stage" defaultValue={stage || ""} className="rounded-2xl border border-[#DDE5DF] bg-white px-4 py-3 text-sm text-[#17211B] outline-none focus:border-[#256D3C]">
            <option value="">Todos os estágios</option>
            {COMMERCIAL_STAGE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select name="priority" defaultValue={priority || ""} className="rounded-2xl border border-[#DDE5DF] bg-white px-4 py-3 text-sm text-[#17211B] outline-none focus:border-[#256D3C]">
            <option value="">Todas as prioridades</option>
            {COMMERCIAL_PRIORITY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select name="ownerUserId" defaultValue={ownerUserId || ""} className="rounded-2xl border border-[#DDE5DF] bg-white px-4 py-3 text-sm text-[#17211B] outline-none focus:border-[#256D3C]">
            <option value="">Todos os responsáveis</option>
            {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
          </select>
          <button className="rounded-2xl bg-[#17211B] px-5 py-3 text-sm font-semibold text-white">Filtrar</button>
        </form>

        <section className="overflow-hidden rounded-3xl border border-[#DDE5DF] bg-white shadow-sm">
          <div className="border-b border-[#E4EAE6] px-5 py-4">
            <h2 className="text-lg font-semibold text-[#17211B]">Oportunidades</h2>
            <p className="mt-1 text-sm text-[#6A756D]">{items.length} de {totalFiltered} leads exibidos com os filtros atuais.</p>
          </div>
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#667168]">Nenhum lead encontrado com os filtros selecionados.</div>
          ) : (
            <div className="divide-y divide-[#EEF2EF]">
              {items.map((item) => (
                <Link key={item.id} href={`/elogest/comercial/${item.id}`} className="grid gap-4 p-5 transition hover:bg-[#F8FAF8] lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-center">
                  <div>
                    <p className="font-semibold text-[#17211B]">{item.onboardingRequest.administratorName}</p>
                    <p className="mt-1 text-sm text-[#667168]">{item.onboardingRequest.responsibleName} · {item.onboardingRequest.email}</p>
                    <p className="mt-1 text-xs text-[#7A847D]">{item.onboardingRequest.city || "Cidade não informada"}{item.onboardingRequest.state ? `/${item.onboardingRequest.state}` : ""} · Plano {item.onboardingRequest.interestedPlan?.name || "não informado"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[#879188]">Estágio</p>
                    <p className="mt-1 text-sm font-semibold text-[#344139]">{commercialStageLabel(item.stage)}</p>
                    <p className="mt-1 text-xs text-[#7A847D]">{ONBOARDING_STATUS_LABELS[item.onboardingRequest.status]}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[#879188]">Prioridade</p>
                    <p className="mt-1 text-sm font-semibold text-[#344139]">{commercialPriorityLabel(item.priority)}</p>
                    <p className="mt-1 text-xs text-[#7A847D]">{item.score}/50 · {scoreClassification(item.score)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[#879188]">Responsável</p>
                    <p className="mt-1 text-sm font-semibold text-[#344139]">{item.ownerUser?.name || "Não atribuído"}</p>
                    <p className="mt-1 text-xs text-[#7A847D]">Follow-up: {formatDate(item.nextFollowUpAt)}</p>
                  </div>
                  <span className="text-sm font-semibold text-[#256D3C]">Abrir →</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </EloGestShell>
  );
}
