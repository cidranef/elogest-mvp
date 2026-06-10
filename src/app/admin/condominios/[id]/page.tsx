"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Children,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AdminShell from "@/components/AdminShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";



/* =========================================================
   DETALHE DO CONDOMÍNIO - ADMIN

   ETAPA 45.2 — CADASTRO CONDOMINIAL AVANÇADO
   - Tela de detalhe do condomínio.
   - Fachada em destaque.
   - Dados cadastrais, endereço, contatos e dados operacionais.

   ETAPA 45.3 — DETALHE OPERACIONAL DO CONDOMÍNIO
   - Página passa a consumir API específica:
     /api/admin/condominios/[id]/detalhe
   - Adicionados blocos de unidades recentes.
   - Adicionados blocos de moradores/proprietários recentes.
   - Adicionados chamados recentes.
   - Adicionados atalhos operacionais preparados para filtros futuros.
   - Mantida proteção por escopo na API.

   ETAPA 45.3.1 — ESCALABILIDADE DAS LISTAS
   - Botão Atualizar Dados recebe estado visual.
   - Listas operacionais passam a ser prévias limitadas.
   - Cards de listas recebem altura máxima e rolagem interna.
   - Botões Ver todos direcionam para páginas filtradas.
   - Evita crescimento excessivo da página em condomínios grandes.

   ETAPA 45.7 — REVISÃO FINAL DO CADASTRO CONDOMINIAL AVANÇADO
   - Adicionado tratamento para ID ausente.
   - Adicionado encodeURIComponent nos links com filtro por condomínio.
   - Fortalecida formatação de datas inválidas.
   - RecentCard passa a usar Children.count para detectar conteúdo.
   - Corrigida declaração de condominio antes do uso nos hrefs e métricas.
   - Mantidos botão Atualizar Dados, fachada, detalhe operacional e
     listagens escaláveis.
   ========================================================= */



/* =========================================================
   TYPES
   ========================================================= */

type CondominiumStatus = "ACTIVE" | "INACTIVE";

type CondominiumType =
  | "RESIDENTIAL"
  | "COMMERCIAL"
  | "MIXED"
  | "HORIZONTAL"
  | "OTHER";



interface Administradora {
  id: string;
  name: string;
}



interface Condominio {
  id: string;
  administratorId: string;
  administrator?: Administradora | null;

  name: string;
  legalName?: string | null;
  cnpj?: string | null;
  type?: CondominiumType | string | null;

  facadeImagePath?: string | null;

  email?: string | null;
  phone?: string | null;

  administrativeContactName?: string | null;
  administrativeContactEmail?: string | null;
  administrativeContactPhone?: string | null;

  cep?: string | null;
  address?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;

  unitsCount?: number | null;
  blocksCount?: number | null;
  managementStartDate?: string | null;
  managementEndDate?: string | null;
  notes?: string | null;

  status: CondominiumStatus | string;
  createdAt: string;
  updatedAt?: string | null;

  totalUnits?: number;
  activeUnits?: number;

  totalResidents?: number;
  activeResidents?: number;

  totalTickets?: number;
  openTickets?: number;
}



interface RecentUnit {
  id: string;
  unitNumber?: string | null;
  block?: string | null;
  label: string;
  status: string;
  createdAt: string;
}



interface RecentResident {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  createdAt: string;
  unit?: {
    id: string;
    unitNumber?: string | null;
    block?: string | null;
    label: string;
  } | null;
}



interface RecentTicket {
  id: string;
  title: string;
  status: string;
  priority?: string | null;
  createdAt: string;
  unit?: {
    id: string;
    unitNumber?: string | null;
    block?: string | null;
    label: string;
  } | null;
}



interface CondominioDetalheResponse {
  condominio: Condominio;

  unidadesResumo: {
    total: number;
    active: number;
    inactive: number;
    recent: RecentUnit[];
  };

  moradoresResumo: {
    total: number;
    active: number;
    inactive: number;
    recent: RecentResident[];
  };

  sindicoAtual: null;

  chamadosResumo: {
    total: number;
    open: number;
    recent: RecentTicket[];
  };
}



interface ApiErrorResponse {
  error?: string;
}



/* =========================================================
   HELPERS
   ========================================================= */

function getApiErrorMessage(data: unknown, fallback: string) {
  if (typeof data === "object" && data !== null && "error" in data) {
    const error = (data as ApiErrorResponse).error;

    if (error) {
      return error;
    }
  }

  return fallback;
}



function statusLabel(status?: string | null) {
  return (
    {
      ACTIVE: "Ativo",
      INACTIVE: "Inativo",
    }[status || ""] ||
    status ||
    "-"
  );
}



function statusClass(status?: string | null) {
  return status === "ACTIVE"
    ? "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]"
    : "border-red-200 bg-red-50 text-red-700";
}



function condominiumTypeLabel(type?: string | null) {
  return (
    {
      RESIDENTIAL: "Residencial",
      COMMERCIAL: "Comercial",
      MIXED: "Misto",
      HORIZONTAL: "Horizontal",
      OTHER: "Outro",
    }[type || ""] ||
    type ||
    "-"
  );
}



function ticketStatusLabel(status?: string | null) {
  return (
    {
      OPEN: "Aberto",
      IN_PROGRESS: "Em andamento",
      RESOLVED: "Resolvido",
      CANCELED: "Cancelado",
    }[status || ""] ||
    status ||
    "-"
  );
}



function ticketPriorityLabel(priority?: string | null) {
  return (
    {
      LOW: "Baixa",
      MEDIUM: "Média",
      HIGH: "Alta",
      URGENT: "Urgente",
    }[priority || ""] ||
    priority ||
    "-"
  );
}



function getSafeDate(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}



function formatDate(value?: string | null) {
  const date = getSafeDate(value);

  if (!date) return "-";

  return date.toLocaleDateString("pt-BR");
}



function formatDateTime(value?: string | null) {
  const date = getSafeDate(value);

  if (!date) return "-";

  return date.toLocaleString("pt-BR");
}



function getFullAddress(condominio: Condominio) {
  const main = [condominio.address, condominio.number]
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .join(", ");

  const district = condominio.district || "";

  const cityState = [condominio.city, condominio.state]
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .join(" / ");

  const lines = [main, district, cityState, condominio.cep]
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .map((item) => item.trim());

  return lines.length > 0 ? lines.join(" • ") : "-";
}



function getShortLocation(condominio: Condominio) {
  const cityState = [condominio.city, condominio.state]
    .filter(Boolean)
    .join(" / ");

  return cityState || "-";
}



function getManagementPeriod(condominio: Condominio) {
  const start = formatDate(condominio.managementStartDate);
  const end = formatDate(condominio.managementEndDate);

  if (start === "-" && end === "-") {
    return "-";
  }

  if (start !== "-" && end === "-") {
    return `Desde ${start}`;
  }

  if (start === "-" && end !== "-") {
    return `Até ${end}`;
  }

  return `${start} até ${end}`;
}



function isCondominioDetalheResponse(
  data: unknown
): data is CondominioDetalheResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    "condominio" in data &&
    "unidadesResumo" in data &&
    "moradoresResumo" in data &&
    "chamadosResumo" in data
  );
}



function buildCondominioFilterHref(basePath: string, condominiumId: string) {
  return `${basePath}?condominio=${encodeURIComponent(condominiumId)}`;
}



/* =========================================================
   PÁGINA
   ========================================================= */

export default function CondominioDetailPage() {
  const params = useParams<{ id?: string }>();
  const router = useRouter();

  const condominiumId = params?.id || "";

  const [detalhe, setDetalhe] = useState<CondominioDetalheResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const condominio = detalhe?.condominio || null;



  /* =========================================================
     CARREGAR DETALHE
     ========================================================= */

  const loadCondominio = useCallback(
    async ({
      showLoading = true,
      showSuccessMessage = false,
    }: {
      showLoading?: boolean;
      showSuccessMessage?: boolean;
    } = {}) => {
      if (!condominiumId) {
        setError("ID do condomínio não informado.");
        setDetalhe(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        if (showLoading) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }

        setError("");
        setSuccess("");

        const res = await fetch(
          `/api/admin/condominios/${condominiumId}/detalhe`,
          {
            cache: "no-store",
          }
        );

        const data: unknown = await res.json();

        if (!res.ok) {
          setError(getApiErrorMessage(data, "Erro ao carregar condomínio."));
          setDetalhe(null);
          return;
        }

        if (!isCondominioDetalheResponse(data)) {
          setError("Resposta inválida da API.");
          setDetalhe(null);
          return;
        }

        setDetalhe(data);

        if (showSuccessMessage) {
          setSuccess("Dados atualizados com sucesso.");

          window.setTimeout(() => {
            setSuccess("");
          }, 3500);
        }
      } catch (err) {
        console.error(err);
        setError("Erro ao carregar condomínio.");
        setDetalhe(null);
      } finally {
        if (showLoading) {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [condominiumId]
  );



  /* =========================================================
     INIT

     Ajuste:
     - Evita setState síncrono diretamente no corpo do useEffect.
     - O carregamento inicial roda dentro de Promise.resolve().then().
     ========================================================= */

  useEffect(() => {
    let isMounted = true;

    Promise.resolve()
      .then(async () => {
        if (!condominiumId) {
          if (!isMounted) {
            return;
          }

          setError("ID do condomínio não informado.");
          setDetalhe(null);
          setLoading(false);
          return;
        }

        const res = await fetch(
          `/api/admin/condominios/${condominiumId}/detalhe`,
          {
            cache: "no-store",
          }
        );

        const data: unknown = await res.json();

        if (!isMounted) {
          return;
        }

        if (!res.ok) {
          setError(getApiErrorMessage(data, "Erro ao carregar condomínio."));
          setDetalhe(null);
          return;
        }

        if (!isCondominioDetalheResponse(data)) {
          setError("Resposta inválida da API.");
          setDetalhe(null);
          return;
        }

        setDetalhe(data);
      })
      .catch((err: unknown) => {
        if (!isMounted) {
          return;
        }

        console.error(err);
        setError("Erro ao carregar condomínio.");
        setDetalhe(null);
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [condominiumId]);



  /* =========================================================
     HREFS OPERACIONAIS
     ========================================================= */

  const unidadesHref = condominio
    ? buildCondominioFilterHref("/admin/unidades", condominio.id)
    : "/admin/unidades";

  const moradoresHref = condominio
    ? buildCondominioFilterHref("/admin/moradores", condominio.id)
    : "/admin/moradores";

  const chamadosHref = condominio
    ? buildCondominioFilterHref("/admin/chamados", condominio.id)
    : "/admin/chamados";



  /* =========================================================
     MÉTRICAS DO CONDOMÍNIO
     ========================================================= */

  const metrics = useMemo(() => {
    if (!detalhe || !condominio) {
      return {
        activeUnits: 0,
        totalUnits: 0,
        plannedUnits: 0,
        activeResidents: 0,
        totalResidents: 0,
        openTickets: 0,
        totalTickets: 0,
      };
    }

    return {
      activeUnits: Number(detalhe.unidadesResumo.active || 0),
      totalUnits: Number(detalhe.unidadesResumo.total || 0),
      plannedUnits: Number(condominio.unitsCount || 0),
      activeResidents: Number(detalhe.moradoresResumo.active || 0),
      totalResidents: Number(detalhe.moradoresResumo.total || 0),
      openTickets: Number(detalhe.chamadosResumo.open || 0),
      totalTickets: Number(detalhe.chamadosResumo.total || 0),
    };
  }, [detalhe, condominio]);



  /* =========================================================
     CARREGAMENTO
     ========================================================= */

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando condomínio..."
        description="Aguarde enquanto carregamos os dados completos do condomínio selecionado."
      />
    );
  }



  /* =========================================================
     ERRO / NÃO ENCONTRADO
     ========================================================= */

  if (error || !detalhe || !condominio) {
    return (
      <AdminShell
        current="condominios"
        title="Condomínio"
        description="Detalhe do condomínio da carteira administrativa."
      >
        <div className="space-y-6">
          <button
            type="button"
            onClick={() => router.push("/admin/condominios")}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
          >
            ← Voltar para Condomínios
          </button>

          <section className="rounded-[32px] border border-red-200 bg-red-50 p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-red-800">
              Não foi possível abrir este condomínio
            </h1>

            <p className="mt-2 text-sm leading-6 text-red-700">
              {error || "Condomínio não encontrado."}
            </p>
          </section>
        </div>
      </AdminShell>
    );
  }



  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <AdminShell
      current="condominios"
      title={condominio.name}
      description="Detalhe do condomínio da carteira administrativa."
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/admin/condominios"
            className="inline-flex h-11 w-fit items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
          >
            ← Voltar para Condomínios
          </Link>

          <button
            type="button"
            onClick={() =>
              void loadCondominio({
                showLoading: false,
                showSuccessMessage: true,
              })
            }
            disabled={refreshing}
            className="inline-flex h-11 w-fit items-center justify-center rounded-2xl bg-[#17211B] px-4 text-sm font-semibold text-white transition hover:bg-[#26382D] disabled:cursor-not-allowed disabled:bg-[#9AA7A0]"
          >
            {refreshing ? "Atualizando..." : "Atualizar Dados"}
          </button>
        </div>

        {success && (
          <div className="rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] p-4 text-sm font-semibold text-[#256D3C]">
            {success}
          </div>
        )}



        {/* =====================================================
            HERO COM FACHADA
            ===================================================== */}

        <section className="overflow-hidden rounded-[36px] border border-[#DDE5DF] bg-white shadow-sm">
          <div className="grid min-h-[320px] lg:grid-cols-[1.15fr_0.85fr]">
            <CondominioFacadeHero condominio={condominio} />

            <div className="flex flex-col justify-between gap-6 p-6 lg:p-8">
              <div>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                      condominio.status
                    )}`}
                  >
                    {statusLabel(condominio.status)}
                  </span>

                  <span className="rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-semibold text-[#5E6B63]">
                    {condominiumTypeLabel(condominio.type)}
                  </span>

                  {metrics.openTickets > 0 && (
                    <span className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-800">
                      {metrics.openTickets} chamado(s) em aberto
                    </span>
                  )}
                </div>

                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
                  Detalhe do condomínio
                </p>

                <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
                  {condominio.name}
                </h1>

                {condominio.legalName && (
                  <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                    Razão social:{" "}
                    <strong className="font-semibold text-[#17211B]">
                      {condominio.legalName}
                    </strong>
                  </p>
                )}

                <p className="mt-4 text-sm leading-6 text-[#5E6B63]">
                  {getFullAddress(condominio)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <HeaderMiniMetric
                  label="Unidades ativas"
                  value={metrics.activeUnits}
                />

                <HeaderMiniMetric
                  label="Moradores ativos"
                  value={metrics.activeResidents}
                />

                <HeaderMiniMetric
                  label="Chamados abertos"
                  value={metrics.openTickets}
                />

                <HeaderMiniMetric
                  label="Unidades previstas"
                  value={metrics.plannedUnits || "-"}
                />
              </div>
            </div>
          </div>
        </section>



        {/* =====================================================
            KPIS
            ===================================================== */}

        <section className="grid gap-4 md:grid-cols-4">
          <MetricCard
            title="Unidades cadastradas"
            value={`${metrics.activeUnits} / ${metrics.totalUnits}`}
            description="Ativas em relação ao total cadastrado."
            tone="green"
          />

          <MetricCard
            title="Unidades previstas"
            value={metrics.plannedUnits || "-"}
            description="Quantidade informada no cadastro avançado."
          />

          <MetricCard
            title="Moradores"
            value={`${metrics.activeResidents} / ${metrics.totalResidents}`}
            description="Ativos em relação ao total vinculado."
          />

          <MetricCard
            title="Chamados"
            value={`${metrics.openTickets} / ${metrics.totalTickets}`}
            description="Abertos em relação ao histórico total."
            tone={metrics.openTickets > 0 ? "yellow" : "default"}
          />
        </section>



        {/* =====================================================
            AÇÕES RÁPIDAS
            ===================================================== */}

        <section className="rounded-[32px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[#17211B]">
                Ações rápidas
              </h2>

              <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                Atalhos para operações relacionadas ao condomínio.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin/condominios"
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
              >
                Editar cadastro
              </Link>

              <Link
                href={unidadesHref}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
              >
                Unidades
              </Link>

              <Link
                href={moradoresHref}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
              >
                Moradores e vínculos
              </Link>

              <Link
                href={chamadosHref}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
              >
                Chamados
              </Link>
            </div>
          </div>
        </section>



        {/* =====================================================
            BLOCOS OPERACIONAIS ESCALÁVEIS
            ===================================================== */}

        <section className="grid gap-6 xl:grid-cols-3">
          <RecentCard
            title="Unidades vinculadas"
            description="Prévia das unidades deste condomínio. Para bases grandes, use o botão Ver todos."
            emptyMessage="Nenhuma unidade vinculada ainda."
            total={detalhe.unidadesResumo.total}
            active={detalhe.unidadesResumo.active}
            inactive={detalhe.unidadesResumo.inactive}
            viewAllHref={unidadesHref}
            viewAllLabel="Ver todas"
          >
            {detalhe.unidadesResumo.recent.map((unit) => (
              <CompactListItem
                key={unit.id}
                title={unit.label}
                subtitle={`Status: ${statusLabel(unit.status)}`}
                footer={`Criada em ${formatDate(unit.createdAt)}`}
              />
            ))}
          </RecentCard>

          <RecentCard
            title="Moradores e vínculos"
            description="Prévia de pessoas vinculadas ao condomínio. A listagem completa fica em Moradores."
            emptyMessage="Nenhum morador vinculado ainda."
            total={detalhe.moradoresResumo.total}
            active={detalhe.moradoresResumo.active}
            inactive={detalhe.moradoresResumo.inactive}
            viewAllHref={moradoresHref}
            viewAllLabel="Ver todos"
          >
            {detalhe.moradoresResumo.recent.map((resident) => (
              <CompactListItem
                key={resident.id}
                title={resident.name}
                subtitle={`Unidade: ${resident.unit?.label || "-"}`}
                footer={resident.email || resident.phone || statusLabel(resident.status)}
              />
            ))}
          </RecentCard>

          <RecentCard
            title="Chamados recentes"
            description="Prévia dos chamados mais recentes. A fila completa deve ser vista na página de chamados."
            emptyMessage="Nenhum chamado registrado ainda."
            total={detalhe.chamadosResumo.total}
            active={detalhe.chamadosResumo.open}
            activeLabel="Abertos"
            inactive={Math.max(
              detalhe.chamadosResumo.total - detalhe.chamadosResumo.open,
              0
            )}
            inactiveLabel="Demais"
            viewAllHref={chamadosHref}
            viewAllLabel="Ver chamados"
          >
            {detalhe.chamadosResumo.recent.map((ticket) => (
              <CompactListItem
                key={ticket.id}
                title={ticket.title}
                subtitle={`${ticketStatusLabel(ticket.status)} • ${ticketPriorityLabel(
                  ticket.priority
                )}`}
                footer={`Unidade: ${ticket.unit?.label || "-"} • ${formatDate(
                  ticket.createdAt
                )}`}
              />
            ))}
          </RecentCard>
        </section>



        {/* =====================================================
            DADOS COMPLETOS
            ===================================================== */}

        <section className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
          <DetailCard
            title="Dados cadastrais"
            description="Informações principais de identificação e situação do condomínio."
          >
            <InfoGrid>
              <InfoItem label="Nome" value={condominio.name} />
              <InfoItem label="Razão social" value={condominio.legalName || "-"} />
              <InfoItem label="CNPJ" value={condominio.cnpj || "-"} />
              <InfoItem
                label="Tipo"
                value={condominiumTypeLabel(condominio.type)}
              />
              <InfoItem
                label="Status"
                value={statusLabel(condominio.status)}
              />
              <InfoItem
                label="Administradora"
                value={condominio.administrator?.name || "-"}
              />
              <InfoItem
                label="Criado em"
                value={formatDateTime(condominio.createdAt)}
              />
              <InfoItem
                label="Atualizado em"
                value={formatDateTime(condominio.updatedAt)}
              />
            </InfoGrid>
          </DetailCard>

          <DetailCard
            title="Endereço"
            description="Localização principal do condomínio."
          >
            <InfoGrid>
              <InfoItem label="CEP" value={condominio.cep || "-"} />
              <InfoItem label="Endereço" value={condominio.address || "-"} />
              <InfoItem label="Número" value={condominio.number || "-"} />
              <InfoItem
                label="Complemento"
                value={condominio.complement || "-"}
              />
              <InfoItem label="Bairro" value={condominio.district || "-"} />
              <InfoItem label="Cidade / UF" value={getShortLocation(condominio)} />
            </InfoGrid>
          </DetailCard>

          <DetailCard
            title="Contatos"
            description="Canais de contato principal e administrativo."
          >
            <InfoGrid>
              <InfoItem label="E-mail principal" value={condominio.email || "-"} />
              <InfoItem label="Telefone principal" value={condominio.phone || "-"} />
              <InfoItem
                label="Contato administrativo"
                value={condominio.administrativeContactName || "-"}
              />
              <InfoItem
                label="E-mail administrativo"
                value={condominio.administrativeContactEmail || "-"}
              />
              <InfoItem
                label="Telefone administrativo"
                value={condominio.administrativeContactPhone || "-"}
              />
            </InfoGrid>
          </DetailCard>

          <DetailCard
            title="Dados operacionais"
            description="Informações úteis para implantação, relatórios e governança."
          >
            <InfoGrid>
              <InfoItem
                label="Unidades previstas"
                value={condominio.unitsCount ?? "-"}
              />
              <InfoItem
                label="Blocos/Torres"
                value={condominio.blocksCount ?? "-"}
              />
              <InfoItem
                label="Período de gestão"
                value={getManagementPeriod(condominio)}
              />
              <InfoItem
                label="Imagem da fachada"
                value={condominio.facadeImagePath || "-"}
              />
            </InfoGrid>

            {condominio.notes && (
              <div className="mt-5 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                  Observações internas
                </p>

                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#5E6B63]">
                  {condominio.notes}
                </p>
              </div>
            )}
          </DetailCard>
        </section>



        {/* =====================================================
            PREPARAÇÃO PARA MÓDULOS FUTUROS
            ===================================================== */}

        <section className="rounded-[32px] border border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_60%,#EAF7EE_140%)] p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
                Base preparada
              </p>

              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">
                Próximos módulos conectados ao condomínio
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                Este cadastro passa a ser a base operacional para módulos futuros
                como fornecedores homologados, comunicados, assembleias,
                enquetes, financeiro e relatórios gerenciais.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[420px]">
              <FutureModule label="Fornecedores" />
              <FutureModule label="Comunicados" />
              <FutureModule label="Assembleias" />
              <FutureModule label="Votações" />
              <FutureModule label="Financeiro" />
              <FutureModule label="Relatórios" />
            </div>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}



/* =========================================================
   HERO DA FACHADA
   ========================================================= */

function CondominioFacadeHero({
  condominio,
}: {
  condominio: Condominio;
}) {
  const imagePath = condominio.facadeImagePath?.trim();

  if (!imagePath) {
    return (
      <div className="flex min-h-[280px] items-center justify-center bg-[linear-gradient(135deg,#EAF7EE_0%,#F8FAF9_55%,#FFFFFF_100%)] p-8 text-center">
        <div>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-[#CFE6D4] bg-white text-2xl">
            🏢
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
            Fachada não cadastrada
          </p>

          <p className="mt-2 max-w-sm text-sm leading-6 text-[#5E6B63]">
            Adicione uma imagem da fachada pela edição do condomínio para deixar
            a identificação visual mais clara.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[280px] bg-cover bg-center"
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(23,33,27,0.10), rgba(23,33,27,0.24)), url("${imagePath}")`,
      }}
      aria-label={`Fachada do condomínio ${condominio.name}`}
      role="img"
    />
  );
}



/* =========================================================
   COMPONENTES VISUAIS
   ========================================================= */

function HeaderMiniMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
        {label}
      </p>

      <strong className="mt-1 block text-2xl font-semibold text-[#17211B]">
        {value}
      </strong>
    </div>
  );
}



function MetricCard({
  title,
  value,
  description,
  tone = "default",
}: {
  title: string;
  value: string | number;
  description: string;
  tone?: "default" | "green" | "yellow";
}) {
  const toneClass =
    tone === "green"
      ? "border-[#CFE6D4] bg-[#EAF7EE]"
      : tone === "yellow"
        ? "border-yellow-200 bg-yellow-50"
        : "border-[#DDE5DF] bg-white";

  const valueClass =
    tone === "green"
      ? "text-[#256D3C]"
      : tone === "yellow"
        ? "text-yellow-800"
        : "text-[#17211B]";

  return (
    <div className={`rounded-[28px] border p-5 shadow-sm ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
        {title}
      </p>

      <strong className={`mt-2 block text-3xl font-semibold ${valueClass}`}>
        {value}
      </strong>

      <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
        {description}
      </p>
    </div>
  );
}



function DetailCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[32px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-[#17211B]">
          {title}
        </h2>

        <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
          {description}
        </p>
      </div>

      {children}
    </section>
  );
}



function InfoGrid({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {children}
    </div>
  );
}



function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-semibold text-[#17211B]">
        {value}
      </p>
    </div>
  );
}



function RecentCard({
  title,
  description,
  emptyMessage,
  total,
  active,
  inactive,
  activeLabel = "Ativos",
  inactiveLabel = "Inativos",
  viewAllHref,
  viewAllLabel,
  children,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  total: number;
  active: number;
  inactive: number;
  activeLabel?: string;
  inactiveLabel?: string;
  viewAllHref: string;
  viewAllLabel: string;
  children: ReactNode;
}) {
  const hasContent = Children.count(children) > 0;

  return (
    <section className="flex max-h-[560px] min-h-[420px] flex-col rounded-[32px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
      <div className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[#17211B]">
              {title}
            </h2>

            <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <MiniCount label="Total" value={total} highlighted />
          <MiniCount label={activeLabel} value={active} />
          <MiniCount label={inactiveLabel} value={inactive} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {hasContent ? (
          <div className="space-y-3">
            {children}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F9FBFA] p-4 text-sm text-[#7A877F]">
            {emptyMessage}
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-[#DDE5DF] pt-4">
        <Link
          href={viewAllHref}
          className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
        >
          {viewAllLabel}
        </Link>
      </div>
    </section>
  );
}



function MiniCount({
  label,
  value,
  highlighted = false,
}: {
  label: string;
  value: number;
  highlighted?: boolean;
}) {
  return (
    <div
      className={
        highlighted
          ? "rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] p-3"
          : "rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-3"
      }
    >
      <p
        className={
          highlighted
            ? "text-[10px] font-semibold uppercase tracking-[0.12em] text-[#256D3C]"
            : "text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A877F]"
        }
      >
        {label}
      </p>

      <strong
        className={
          highlighted
            ? "mt-1 block text-lg font-semibold text-[#256D3C]"
            : "mt-1 block text-lg font-semibold text-[#17211B]"
        }
      >
        {value}
      </strong>
    </div>
  );
}



function CompactListItem({
  title,
  subtitle,
  footer,
}: {
  title: string;
  subtitle: string;
  footer: string;
}) {
  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
      <p className="break-words text-sm font-semibold text-[#17211B]">
        {title}
      </p>

      <p className="mt-1 text-xs text-[#5E6B63]">
        {subtitle}
      </p>

      <p className="mt-2 text-xs text-[#7A877F]">
        {footer}
      </p>
    </div>
  );
}



function FutureModule({
  label,
}: {
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-[#CFE6D4] bg-white/80 p-4 text-sm font-semibold text-[#17211B] shadow-sm">
      {label}
    </div>
  );
}