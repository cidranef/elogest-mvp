import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { getActiveUserAccessFromCookies } from "@/lib/user-access";
import Link from "next/link";
import AdminContextGuard from "@/components/AdminContextGuard";
import AdminShell from "@/components/AdminShell";
import ResponsiveSection from "@/components/ui/ResponsiveSection";



/* =========================================================
   DASHBOARD ADMIN - ELOGEST

   /admin/dashboard
   → visão geral da administradora/carteira

   /admin/chamados/dashboard
   → dashboard específico do módulo de chamados

   ETAPA 41.2.7 — PADRONIZAÇÃO VISUAL DOS TÍTULOS

   Ajustes desta revisão:
   - Removidos os labels "Administradora / Super Admin" e
     "Área administrativa" do card de boas-vindas.
   - A identificação passa a ficar mais limpa:
     "Bem-vindo, NOME DA ADMINISTRADORA".
   - Mantido o título da página fora dos cards:
     "Dashboard Administrativo".
   - Mantida a qualificação/rating no card lateral.
   - Mantida a Visão da Carteira limpa e sem labels internas.
   - Preservada toda a lógica server-side aprovada.
   - Títulos dos chamados passam a usar formatação visual consistente.
   ========================================================= */



/* =========================================================
   HELPERS DE STATUS, PRIORIDADE E PRAZO
   ========================================================= */

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    OPEN: "Aberto",
    IN_PROGRESS: "Em andamento",
    RESOLVED: "Resolvido",
    CANCELED: "Cancelado",
  };

  return labels[status] || status;
}



function statusBadgeClass(status: string) {
  const classes: Record<string, string> = {
    OPEN: "border-[#DDE5DF] bg-white text-[#17211B]",
    IN_PROGRESS: "border-yellow-200 bg-yellow-50 text-yellow-800",
    RESOLVED: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
    CANCELED: "border-red-200 bg-red-50 text-red-700",
  };

  return classes[status] || "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]";
}



function ticketCardClass(status: string) {
  const classes: Record<string, string> = {
    OPEN: "border-[#DDE5DF] bg-white hover:border-[#256D3C]/35",
    IN_PROGRESS: "border-[#DDE5DF] bg-white hover:border-yellow-300",
    RESOLVED: "border-[#DDE5DF] bg-white hover:border-[#8ED08E]",
    CANCELED: "border-[#DDE5DF] bg-white hover:border-red-300",
  };

  return classes[status] || "border-[#DDE5DF] bg-white hover:border-[#256D3C]/40";
}



function priorityClass(priority?: string | null) {
  const classes: Record<string, string> = {
    LOW: "text-[#5E6B63]",
    MEDIUM: "text-[#5E6B63]",
    HIGH: "text-orange-700",
    URGENT: "text-red-700",
  };

  return classes[priority || ""] || "text-[#5E6B63]";
}



function priorityLabel(priority?: string | null) {
  const labels: Record<string, string> = {
    LOW: "Baixa",
    MEDIUM: "Média",
    HIGH: "Alta",
    URGENT: "Urgente",
  };

  return labels[priority || ""] || "-";
}



function getSlaLimitHours(priority?: string | null) {
  if (priority === "URGENT") return 4;
  if (priority === "HIGH") return 24;
  if (priority === "MEDIUM") return 48;
  return 72;
}



function isActiveTicket(status: string) {
  return status === "OPEN" || status === "IN_PROGRESS";
}



function isTicketOverdue(ticket: {
  status: string;
  priority?: string | null;
  createdAt: Date;
}) {
  if (!isActiveTicket(ticket.status)) {
    return false;
  }

  const createdAt = new Date(ticket.createdAt).getTime();
  const elapsedHours = Math.floor((Date.now() - createdAt) / (1000 * 60 * 60));
  const remainingHours = getSlaLimitHours(ticket.priority) - elapsedHours;

  return remainingHours <= 0;
}



function getTicketScopeLabel(ticket: {
  scope?: string | null;
}) {
  if (ticket.scope === "CONDOMINIUM") {
    return "Condomínio";
  }

  return "Unidade";
}



function getTicketLocationLabel(ticket: {
  scope?: string | null;
  unit?: {
    block?: string | null;
    unitNumber: string;
  } | null;
}) {
  if (ticket.scope === "CONDOMINIUM") {
    return "Condomínio / Área comum";
  }

  if (ticket.unit) {
    return `Unidade ${
      ticket.unit.block ? ticket.unit.block + " - " : ""
    }${ticket.unit.unitNumber}`;
  }

  return "Condomínio / Área comum";
}



function percentage(value: number, total: number) {
  if (total <= 0) return 0;

  return Math.round((value / total) * 100);
}



/* =========================================================
   HELPER DE ESTRELAS
   ========================================================= */

function renderStars(value: number) {
  return "★".repeat(value) + "☆".repeat(Math.max(0, 5 - value));
}



/* =========================================================
   HELPER DE PADRONIZAÇÃO VISUAL DE TÍTULOS

   Observação:
   - Apenas formata a exibição.
   - Não altera o texto salvo no banco de dados.
   ========================================================= */

function formatDisplayTitle(value?: string | null) {
  const text = String(value || "").trim();

  if (!text) return "-";

  const smallWords = new Set([
    "a",
    "à",
    "ao",
    "as",
    "às",
    "o",
    "os",
    "de",
    "da",
    "das",
    "do",
    "dos",
    "e",
    "em",
    "no",
    "na",
    "nos",
    "nas",
    "com",
    "para",
    "por",
    "sem",
    "sob",
    "sobre",
  ]);

  return text
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((word, index) => {
      if (!word) return word;

      if (index > 0 && smallWords.has(word)) {
        return word;
      }

      return word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
    })
    .join(" ");
}



/* =========================================================
   CARD KPI PREMIUM
   ========================================================= */

function KpiCard({
  title,
  value,
  description,
  href,
  tone = "neutral",
}: {
  title: string;
  value: number | string;
  description?: string;
  href?: string;
  tone?: "neutral" | "green" | "warning" | "danger";
}) {
  const toneClass =
    tone === "green"
      ? "border-[#CFE6D4] bg-[#F9FBFA]"
      : tone === "warning"
        ? "border-yellow-200 bg-white"
        : tone === "danger"
          ? "border-red-200 bg-white"
          : "border-[#DDE5DF] bg-white";

  const valueClass =
    tone === "green"
      ? "text-[#256D3C]"
      : tone === "warning"
        ? "text-yellow-800"
        : tone === "danger"
          ? "text-red-700"
          : "text-[#17211B]";

  const markerClass =
    tone === "green"
      ? "bg-[#256D3C]"
      : tone === "warning"
        ? "bg-yellow-500"
        : tone === "danger"
          ? "bg-red-600"
          : "bg-[#CFE6D4]";

  const content = (
    <div
      className={[
        "relative h-full overflow-hidden rounded-[28px] border p-5 shadow-sm transition",
        "hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(23,33,27,0.08)]",
        toneClass,
      ].join(" ")}
    >
      <span
        className={[
          "absolute left-0 top-5 h-8 w-1 rounded-r-full",
          markerClass,
        ].join(" ")}
      />

      <p className="pl-2 text-sm font-semibold text-[#5E6B63]">
        {title}
      </p>

      <h2 className={`mt-2 pl-2 text-4xl font-semibold tracking-tight ${valueClass}`}>
        {value}
      </h2>

      {description && (
        <p className="mt-2 pl-2 text-xs leading-relaxed text-[#5E6B63]">
          {description}
        </p>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}



/* =========================================================
   LINHA DO GRÁFICO DE DISTRIBUIÇÃO
   ========================================================= */

function DistributionRow({
  label,
  value,
  total,
  tone = "neutral",
}: {
  label: string;
  value: number;
  total: number;
  tone?: "neutral" | "green" | "warning" | "danger";
}) {
  const percent = percentage(value, total);

  const barClass =
    tone === "green"
      ? "bg-[#256D3C]"
      : tone === "warning"
        ? "bg-yellow-500"
        : tone === "danger"
          ? "bg-red-600"
          : "bg-[#8ED08E]";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#17211B]">
          {label}
        </p>

        <p className="text-sm font-semibold text-[#5E6B63]">
          {value}
          <span className="ml-1 text-xs font-medium text-[#9AA7A0]">
            {percent}%
          </span>
        </p>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-[#EDF2EF]">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{
            width: `${Math.max(percent, value > 0 ? 4 : 0)}%`,
          }}
        />
      </div>
    </div>
  );
}



/* =========================================================
   FALLBACK ADMIN
   ========================================================= */

function AdminDashboardBlockedFallback() {
  return (
    <AdminContextGuard
      fallbackTitle="Dashboard administrativo indisponível neste perfil de acesso"
      fallbackDescription="A home administrativa é exclusiva para administradora ou super admin. Para acompanhar chamados como síndico, morador ou proprietário, acesse o portal."
    >
      <main className="flex min-h-screen items-center justify-center bg-[#F6F8F7] p-8 text-[#17211B]">
        <div className="w-full max-w-xl rounded-[28px] border border-red-200 bg-red-50 p-6 text-red-800">
          Acesso indisponível para o perfil de acesso atual.
        </div>
      </main>
    </AdminContextGuard>
  );
}



/* =========================================================
   PÁGINA
   ========================================================= */

export default async function AdminDashboardPage() {
  const sessionUser: any = await getAuthUser();

  const activeAccess: any = await getActiveUserAccessFromCookies({
    userId: sessionUser.id,
  });



  /* =========================================================
     PERFIL DE ACESSO EFETIVO
     ========================================================= */

  if (!activeAccess) {
    return <AdminDashboardBlockedFallback />;
  }

  const effectiveRole = activeAccess.role || sessionUser.role;

  const effectiveAdministratorId =
    activeAccess.administratorId !== undefined
      ? activeAccess.administratorId
      : sessionUser.administratorId;



  /* =========================================================
     PROTEÇÃO SERVER-SIDE POR PERFIL DE ACESSO ATIVO
     ========================================================= */

  if (effectiveRole !== "SUPER_ADMIN" && effectiveRole !== "ADMINISTRADORA") {
    return <AdminDashboardBlockedFallback />;
  }

  if (effectiveRole === "ADMINISTRADORA" && !effectiveAdministratorId) {
    return <AdminDashboardBlockedFallback />;
  }



  /* =========================================================
     FILTROS POR PERFIL EFETIVO
     ========================================================= */

  const isSuperAdminContext = effectiveRole === "SUPER_ADMIN";

  const condominiumFilter = isSuperAdminContext
    ? {}
    : {
        administratorId: effectiveAdministratorId,
      };

  const unitFilter = isSuperAdminContext
    ? {}
    : {
        condominium: {
          administratorId: effectiveAdministratorId,
        },
      };

  const residentFilter = isSuperAdminContext
    ? {}
    : {
        condominium: {
          administratorId: effectiveAdministratorId,
        },
      };

  const ticketFilter = isSuperAdminContext
    ? {}
    : {
        condominium: {
          administratorId: effectiveAdministratorId,
        },
      };



  /* =========================================================
     CONSULTAS PRINCIPAIS
     ========================================================= */

  const [
    administradoraAtual,
    totalCondominios,
    totalUnidades,
    totalMoradores,
    chamados,
    ultimosChamados,
    condominios,
  ] = await Promise.all([
    effectiveAdministratorId
      ? db.administrator.findUnique({
          where: {
            id: effectiveAdministratorId,
          },
          select: {
            id: true,
            name: true,
          },
        })
      : Promise.resolve(null),

    db.condominium.count({
      where: condominiumFilter,
    }),

    db.unit.count({
      where: unitFilter,
    }),

    db.resident.count({
      where: residentFilter,
    }),

    db.ticket.findMany({
      where: ticketFilter,
      include: {
        condominium: true,
        unit: true,
        resident: true,
        assignedToUser: true,
        createdByUser: true,
        rating: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),

    db.ticket.findMany({
      where: ticketFilter,
      take: 8,
      include: {
        condominium: true,
        unit: true,
        resident: true,
        assignedToUser: true,
        createdByUser: true,
        rating: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),

    db.condominium.findMany({
      where: condominiumFilter,
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    }),
  ]);



  /* =========================================================
     IDENTIFICAÇÃO DE BOAS-VINDAS
     ========================================================= */

  const nomeAdministradora =
    isSuperAdminContext
      ? "Super Admin"
      : administradoraAtual?.name || "Administradora";

  const accessDescription =
    isSuperAdminContext
      ? "Visão geral da plataforma, administradoras e operação consolidada."
      : `Visão da carteira vinculada à ${nomeAdministradora}.`;



  /* =========================================================
     MÉTRICAS DE CHAMADOS
     ========================================================= */

  const totalChamados = chamados.length;

  const chamadosAtivos = chamados.filter((chamado) =>
    isActiveTicket(chamado.status)
  );

  const chamadosAbertos = chamados.filter(
    (chamado) => chamado.status === "OPEN"
  ).length;

  const chamadosEmAndamento = chamados.filter(
    (chamado) => chamado.status === "IN_PROGRESS"
  ).length;

  const chamadosResolvidos = chamados.filter(
    (chamado) => chamado.status === "RESOLVED"
  ).length;

  const chamadosSemResponsavel = chamadosAtivos.filter(
    (chamado) => !chamado.assignedToUserId
  ).length;

  const chamadosVencidos = chamados.filter((chamado) =>
    isTicketOverdue({
      status: chamado.status,
      priority: chamado.priority,
      createdAt: chamado.createdAt,
    })
  ).length;



  /* =========================================================
     MÉTRICAS DE AVALIAÇÃO DO ATENDIMENTO
     ========================================================= */

  const chamadosAvaliados = chamados.filter((chamado) => chamado.rating).length;

  const chamadosResolvidosAvaliados = chamados.filter((chamado) => {
    return chamado.status === "RESOLVED" && chamado.rating;
  }).length;

  const chamadosResolvidosSemAvaliacao = chamados.filter(
    (chamado) => chamado.status === "RESOLVED" && !chamado.rating
  ).length;

  const somaAvaliacoes = chamados.reduce((total, chamado) => {
    return total + (chamado.rating?.rating || 0);
  }, 0);

  const avaliacaoMedia =
    chamadosAvaliados > 0 ? somaAvaliacoes / chamadosAvaliados : 0;

  const avaliacaoMediaLabel =
    chamadosAvaliados > 0 ? avaliacaoMedia.toFixed(1) : "-";

  const avaliacaoMediaEstrelas =
    chamadosAvaliados > 0 ? renderStars(Math.round(avaliacaoMedia)) : "☆☆☆☆☆";

  const taxaAvaliacaoLabel =
    chamadosResolvidos > 0
      ? `${Math.round(
          (chamadosResolvidosAvaliados / chamadosResolvidos) * 100
        )}%`
      : "-";

  const ultimasAvaliacoes = chamados
    .filter((chamado) => chamado.rating)
    .sort((a, b) => {
      const dateA = a.rating?.createdAt
        ? new Date(a.rating.createdAt).getTime()
        : 0;

      const dateB = b.rating?.createdAt
        ? new Date(b.rating.createdAt).getTime()
        : 0;

      return dateB - dateA;
    })
    .slice(0, 5);



  /* =========================================================
     RANKING DE CONDOMÍNIOS POR VOLUME DE CHAMADOS
     ========================================================= */

  const condominiumMap = new Map<
    string,
    {
      id: string;
      name: string;
      total: number;
      open: number;
      overdue: number;
    }
  >();

  condominios.forEach((condominio) => {
    condominiumMap.set(condominio.id, {
      id: condominio.id,
      name: condominio.name,
      total: 0,
      open: 0,
      overdue: 0,
    });
  });

  chamados.forEach((chamado) => {
    const current =
      condominiumMap.get(chamado.condominiumId) ||
      {
        id: chamado.condominiumId,
        name: chamado.condominium?.name || "Condomínio",
        total: 0,
        open: 0,
        overdue: 0,
      };

    current.total += 1;

    if (isActiveTicket(chamado.status)) {
      current.open += 1;
    }

    if (
      isTicketOverdue({
        status: chamado.status,
        priority: chamado.priority,
        createdAt: chamado.createdAt,
      })
    ) {
      current.overdue += 1;
    }

    condominiumMap.set(chamado.condominiumId, current);
  });

  const condominiosComMaisChamados = Array.from(condominiumMap.values())
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);



  /* =========================================================
     ALERTAS OPERACIONAIS
     ========================================================= */

  const alertas = [];

  if (chamadosVencidos > 0) {
    alertas.push({
      title: `${chamadosVencidos} chamado(s) com prazo vencido`,
      description:
        "Existem atendimentos fora do prazo esperado. Priorize os casos críticos para reduzir risco operacional.",
      href: "/admin/chamados?sla=overdue",
      className:
        "border-red-200 bg-red-50 text-red-800 hover:border-red-300 hover:bg-red-100",
    });
  }

  if (chamadosSemResponsavel > 0) {
    alertas.push({
      title: `${chamadosSemResponsavel} chamado(s) sem responsável`,
      description:
        "Chamados ativos sem atribuição podem atrasar a resposta ao condomínio.",
      href: "/admin/chamados?assigned=none",
      className:
        "border-yellow-200 bg-yellow-50 text-yellow-800 hover:border-yellow-300 hover:bg-yellow-100",
    });
  }

  if (chamadosAbertos > 0) {
    alertas.push({
      title: `${chamadosAbertos} chamado(s) aguardando triagem`,
      description:
        "Há solicitações novas que ainda precisam de primeiro encaminhamento.",
      href: "/admin/chamados?status=OPEN",
      className:
        "border-[#DDE5DF] bg-white text-[#17211B] hover:border-[#256D3C]/40 hover:bg-[#F9FBFA]",
    });
  }

  if (chamadosResolvidosSemAvaliacao > 0) {
    alertas.push({
      title: `${chamadosResolvidosSemAvaliacao} resolvido(s) sem avaliação`,
      description:
        "Acompanhe os chamados finalizados que ainda não receberam feedback.",
      href: "/admin/chamados?status=RESOLVED",
      className:
        "border-[#DDE5DF] bg-white text-[#17211B] hover:border-[#256D3C]/40 hover:bg-[#F9FBFA]",
    });
  }

  if (alertas.length === 0) {
    alertas.push({
      title: "Operação sem alertas críticos",
      description:
        "Não há chamados com prazo vencido ou ativos sem responsável neste momento.",
      href: "/admin/chamados/dashboard",
      className:
        "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C] hover:border-[#8ED08E] hover:bg-[#DDF8E2]",
    });
  }



  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <AdminContextGuard
      fallbackTitle="Dashboard administrativo indisponível neste perfil de acesso"
      fallbackDescription="A home administrativa é exclusiva para administradora ou super admin. Para acompanhar chamados como síndico, morador ou proprietário, acesse o portal."
    >
      <AdminShell current="dashboard">
        {/* =====================================================
            TÍTULO DA PÁGINA
            ===================================================== */}

        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
            Administração
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
            Dashboard Administrativo
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
            Acompanhe a visão geral da administradora, monitore prioridades e acesse os principais indicadores da operação.
          </p>
        </header>



        {/* =====================================================
            BOAS-VINDAS / IDENTIFICAÇÃO INICIAL
            ===================================================== */}

        <section className="mb-6 rounded-[32px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-[#17211B] md:text-3xl">
                Bem-vindo, {nomeAdministradora}
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                {accessDescription} Use este painel para acompanhar prioridades,
                visualizar indicadores e acessar rapidamente os principais módulos
                da operação.
              </p>
            </div>

            <div className="rounded-[24px] border border-[#CFE6D4] bg-[#F9FBFA] p-5 lg:min-w-[340px]">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#256D3C]">
                Qualificação do atendimento
              </p>

              <div className="mt-2 flex items-end gap-3">
                <p className="text-4xl font-semibold tracking-tight text-[#256D3C]">
                  {avaliacaoMediaLabel}
                </p>

                <p className="pb-1 text-sm font-medium text-[#7A877F]">
                  de 5
                </p>
              </div>

              <p className="mt-2 text-xl tracking-wider text-[#256D3C]">
                {avaliacaoMediaEstrelas}
              </p>

              <p className="mt-3 text-sm leading-6 text-[#5E6B63]">
                {chamadosAvaliados > 0
                  ? `${chamadosAvaliados} avaliação(ões) registradas. ${taxaAvaliacaoLabel} dos chamados resolvidos receberam feedback.`
                  : "Ainda não há avaliações registradas para compor a nota média."}
              </p>
            </div>
          </div>
        </section>



        {/* =====================================================
            VISÃO DA CARTEIRA
            ===================================================== */}

        <section className="mb-6 overflow-hidden rounded-[32px] border border-[#DDE5DF] bg-white shadow-sm">
          <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_62%,#EAF7EE_135%)] p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-[#17211B] md:text-3xl">
                  Visão da Carteira
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                  Resumo da base administrada com condomínios, unidades, moradores e chamados ativos.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:min-w-[620px] xl:grid-cols-4">
                <Link
                  href="/admin/condominios"
                  className="rounded-2xl border border-[#CFE6D4] bg-white p-4 shadow-sm transition hover:border-[#256D3C]/40 hover:bg-[#F9FBFA]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#256D3C]">
                    Condomínios
                  </p>

                  <strong className="mt-2 block text-3xl font-semibold text-[#256D3C]">
                    {totalCondominios}
                  </strong>

                  <p className="mt-1 text-xs text-[#5E6B63]">
                    Carteira vinculada.
                  </p>
                </Link>

                <Link
                  href="/admin/unidades"
                  className="rounded-2xl border border-[#DDE5DF] bg-white p-4 shadow-sm transition hover:border-[#256D3C]/40 hover:bg-[#F9FBFA]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                    Unidades
                  </p>

                  <strong className="mt-2 block text-3xl font-semibold text-[#17211B]">
                    {totalUnidades}
                  </strong>

                  <p className="mt-1 text-xs text-[#5E6B63]">
                    Unidades cadastradas.
                  </p>
                </Link>

                <Link
                  href="/admin/moradores"
                  className="rounded-2xl border border-[#DDE5DF] bg-white p-4 shadow-sm transition hover:border-[#256D3C]/40 hover:bg-[#F9FBFA]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                    Moradores
                  </p>

                  <strong className="mt-2 block text-3xl font-semibold text-[#17211B]">
                    {totalMoradores}
                  </strong>

                  <p className="mt-1 text-xs text-[#5E6B63]">
                    Moradores e proprietários.
                  </p>
                </Link>

                <Link
                  href="/admin/chamados"
                  className="rounded-2xl border border-[#DDE5DF] bg-white p-4 shadow-sm transition hover:border-[#256D3C]/40 hover:bg-[#F9FBFA]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                    Chamados ativos
                  </p>

                  <strong className="mt-2 block text-3xl font-semibold text-[#17211B]">
                    {chamadosAtivos.length}
                  </strong>

                  <p className="mt-1 text-xs text-[#5E6B63]">
                    Abertos ou em atendimento.
                  </p>
                </Link>
              </div>
            </div>
          </div>

          <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Operação ativa
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                {chamadosAtivos.length} chamado(s) em aberto ou em atendimento.
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Prazo vencido
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                {chamadosVencidos > 0
                  ? `${chamadosVencidos} chamado(s) exigem priorização.`
                  : "Nenhum chamado ativo fora do prazo esperado."}
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Atenção da gestão
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                {chamadosVencidos > 0 || chamadosSemResponsavel > 0
                  ? "Há pontos de atenção que merecem priorização operacional."
                  : "A carteira não possui alertas críticos no momento."}
              </p>
            </div>
          </div>
        </section>



        <div className="space-y-6">
          <ResponsiveSection
            title="Prioridades da Operação"
            description="Pontos de atenção e ações rápidas para manter a rotina da administradora organizada."
            defaultOpenMobile
          >
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm xl:col-span-2">
                <h3 className="text-lg font-semibold text-[#17211B]">
                  Pontos de Atenção
                </h3>

                <p className="mt-1 text-sm text-[#5E6B63]">
                  Prioridades que ajudam a reduzir atrasos, melhorar a resposta
                  e organizar a operação.
                </p>

                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                  {alertas.map((alerta) => (
                    <Link
                      key={alerta.title}
                      href={alerta.href}
                      className={`rounded-2xl border p-4 transition ${alerta.className}`}
                    >
                      <p className="font-semibold">{alerta.title}</p>

                      <p className="mt-2 text-sm opacity-80">
                        {alerta.description}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>

              <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-[#17211B]">
                  Ações Rápidas
                </h3>

                <p className="mt-1 text-sm text-[#5E6B63]">
                  Acesse os módulos mais usados na rotina operacional.
                </p>

                <div className="mt-5 space-y-3">
                  <Link
                    href="/admin/chamados"
                    className="block rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 transition hover:border-[#256D3C]/50 hover:bg-[#EAF7EE]"
                  >
                    <p className="font-semibold text-[#17211B]">
                      Fila de Chamados
                    </p>

                    <p className="mt-1 text-sm text-[#5E6B63]">
                      Triagem, atribuição e acompanhamento dos atendimentos.
                    </p>
                  </Link>

                  <Link
                    href="/admin/chamados/dashboard"
                    className="block rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 transition hover:border-[#256D3C]/50 hover:bg-[#EAF7EE]"
                  >
                    <p className="font-semibold text-[#17211B]">
                      Indicadores de Chamados
                    </p>

                    <p className="mt-1 text-sm text-[#5E6B63]">
                      Visão específica de desempenho do atendimento.
                    </p>
                  </Link>

                  <Link
                    href="/admin/chamados/relatorios"
                    className="block rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 transition hover:border-[#256D3C]/50 hover:bg-[#EAF7EE]"
                  >
                    <p className="font-semibold text-[#17211B]">
                      Relatórios
                    </p>

                    <p className="mt-1 text-sm text-[#5E6B63]">
                      Consulta estruturada dos chamados registrados.
                    </p>
                  </Link>
                </div>
              </section>
            </div>
          </ResponsiveSection>



          <ResponsiveSection
            title="Distribuição dos Chamados"
            description="Comparativo simples da carteira para leitura rápida do volume operacional."
            defaultOpenMobile
          >
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
              <div className="grid grid-cols-1 gap-8 xl:grid-cols-5">
                <div className="xl:col-span-3">
                  <h3 className="text-lg font-semibold text-[#17211B]">
                    Situação Atual da Operação
                  </h3>

                  <p className="mt-1 text-sm text-[#5E6B63]">
                    As barras indicam a participação de cada situação dentro do
                    total de chamados registrados.
                  </p>

                  <div className="mt-6 space-y-5">
                    <DistributionRow
                      label="Aguardando triagem"
                      value={chamadosAbertos}
                      total={totalChamados}
                    />

                    <DistributionRow
                      label="Em atendimento"
                      value={chamadosEmAndamento}
                      total={totalChamados}
                      tone="warning"
                    />

                    <DistributionRow
                      label="Resolvidos"
                      value={chamadosResolvidos}
                      total={totalChamados}
                      tone="green"
                    />

                    <DistributionRow
                      label="Prazo vencido"
                      value={chamadosVencidos}
                      total={totalChamados}
                      tone="danger"
                    />

                    <DistributionRow
                      label="Sem responsável"
                      value={chamadosSemResponsavel}
                      total={totalChamados}
                      tone="warning"
                    />
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#DDE5DF] bg-[#F9FBFA] p-5 xl:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                    Leitura executiva
                  </p>

                  <h4 className="mt-2 text-xl font-semibold text-[#17211B]">
                    {totalChamados > 0
                      ? `${totalChamados} chamado(s) registrados`
                      : "Sem chamados registrados"}
                  </h4>

                  <p className="mt-3 text-sm leading-6 text-[#5E6B63]">
                    {totalChamados > 0
                      ? "Use essa visão para identificar gargalos, priorizar atendimentos e acompanhar a evolução da operação."
                      : "Assim que os chamados forem registrados, esta área mostrará a distribuição da operação."}
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-[#DDE5DF] bg-white p-4">
                      <p className="text-xs text-[#7A877F]">
                        Ativos
                      </p>

                      <strong className="text-2xl text-[#17211B]">
                        {chamadosAtivos.length}
                      </strong>
                    </div>

                    <div className="rounded-2xl border border-[#DDE5DF] bg-white p-4">
                      <p className="text-xs text-[#7A877F]">
                        Finalizados
                      </p>

                      <strong className="text-2xl text-[#256D3C]">
                        {chamadosResolvidos}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </ResponsiveSection>



          <ResponsiveSection
            title="Gestão de Chamados"
            description="Indicadores operacionais detalhados para acompanhamento da fila."
            defaultOpenMobile={false}
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <KpiCard
                title="Total"
                value={totalChamados}
                description="Chamados registrados."
                href="/admin/chamados"
              />

              <KpiCard
                title="Aguardando"
                value={chamadosAbertos}
                description="Novas solicitações."
                href="/admin/chamados?status=OPEN"
              />

              <KpiCard
                title="Em atendimento"
                value={chamadosEmAndamento}
                description="Chamados em execução."
                href="/admin/chamados?status=IN_PROGRESS"
                tone={chamadosEmAndamento > 0 ? "warning" : "neutral"}
              />

              <KpiCard
                title="Resolvidos"
                value={chamadosResolvidos}
                description="Chamados finalizados."
                href="/admin/chamados?status=RESOLVED"
                tone="green"
              />

              <KpiCard
                title="Prazo vencido"
                value={chamadosVencidos}
                description="Ativos fora do prazo."
                href="/admin/chamados?sla=overdue"
                tone={chamadosVencidos > 0 ? "danger" : "neutral"}
              />

              <KpiCard
                title="Sem responsável"
                value={chamadosSemResponsavel}
                description="Aguardando atribuição."
                href="/admin/chamados?assigned=none"
                tone={chamadosSemResponsavel > 0 ? "warning" : "neutral"}
              />
            </div>
          </ResponsiveSection>



          <ResponsiveSection
            title="Últimas Avaliações Recebidas"
            description="Feedbacks recentes ajudam a acompanhar a percepção do atendimento."
            defaultOpenMobile={false}
          >
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
              {ultimasAvaliacoes.length === 0 ? (
                <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-5 text-sm text-[#5E6B63]">
                  Ainda não há avaliações registradas.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {ultimasAvaliacoes.map((chamado) => (
                    <Link
                      key={chamado.id}
                      href={`/admin/chamados/${chamado.id}`}
                      className="block rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 transition hover:border-[#256D3C]/40 hover:bg-white"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-semibold text-[#17211B]">
                            {formatDisplayTitle(chamado.title)}
                          </p>

                          <p className="mt-1 text-sm text-[#5E6B63]">
                            {chamado.condominium?.name || "-"} ·{" "}
                            {getTicketLocationLabel(chamado)}
                          </p>

                          <p className="mt-1 text-xs text-[#7A877F]">
                            Avaliado por {chamado.rating?.user?.name || "usuário"} ·{" "}
                            {chamado.rating?.createdAt
                              ? new Date(chamado.rating.createdAt).toLocaleString(
                                  "pt-BR"
                                )
                              : "-"}
                          </p>
                        </div>

                        <div className="text-left md:text-right">
                          <p className="text-2xl tracking-wider text-[#256D3C]">
                            {renderStars(chamado.rating?.rating || 0)}
                          </p>

                          <p className="text-sm font-semibold text-[#256D3C]">
                            Nota {chamado.rating?.rating || "-"} de 5
                          </p>
                        </div>
                      </div>

                      {chamado.rating?.comment && (
                        <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-white p-3">
                          <p className="mb-1 text-xs text-[#7A877F]">
                            Comentário registrado
                          </p>

                          <p className="line-clamp-3 text-sm text-[#5E6B63]">
                            {chamado.rating.comment}
                          </p>
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </ResponsiveSection>



          <ResponsiveSection
            title="Chamados Recentes e Ranking"
            description="Últimas ocorrências da carteira e condomínios com maior demanda."
            defaultOpenMobile={false}
          >
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm xl:col-span-2">
                <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-[#17211B]">
                      Últimos Chamados Recebidos
                    </h3>

                    <p className="mt-1 text-sm text-[#5E6B63]">
                      Ocorrências mais recentes da carteira administrativa.
                    </p>
                  </div>

                  <Link
                    href="/admin/chamados"
                    className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                  >
                    Ver Fila Completa
                  </Link>
                </div>

                <div className="space-y-4">
                  {ultimosChamados.length === 0 ? (
                    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-4 text-[#5E6B63]">
                      Nenhum chamado registrado.
                    </div>
                  ) : (
                    ultimosChamados.map((chamado) => (
                      <Link
                        key={chamado.id}
                        href={`/admin/chamados/${chamado.id}`}
                        className={`block rounded-2xl border p-4 transition ${ticketCardClass(
                          chamado.status
                        )}`}
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-[#17211B]">
                                {formatDisplayTitle(chamado.title)}
                              </h3>

                              <span
                                className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass(
                                  chamado.status
                                )}`}
                              >
                                {statusLabel(chamado.status)}
                              </span>

                              <span className="rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-semibold text-[#5E6B63]">
                                {getTicketScopeLabel(chamado)}
                              </span>

                              {chamado.rating && (
                                <span className="rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                                  Avaliado {chamado.rating.rating}/5
                                </span>
                              )}
                            </div>

                            <p className="text-sm text-[#5E6B63]">
                              {chamado.condominium?.name || "-"} ·{" "}
                              {getTicketLocationLabel(chamado)}
                            </p>

                            <p className="text-sm text-[#7A877F]">
                              Morador: {chamado.resident?.name || "-"}
                            </p>

                            <p className="mt-1 text-xs text-[#9AA7A0]">
                              Criado por {chamado.createdByUser?.name || "-"} ·{" "}
                              {new Date(chamado.createdAt).toLocaleString("pt-BR")}
                            </p>
                          </div>

                          <div className="text-sm md:text-right">
                            <p className={`font-semibold ${priorityClass(chamado.priority)}`}>
                              Prioridade: {priorityLabel(chamado.priority)}
                            </p>

                            <p
                              className={
                                chamado.assignedToUser
                                  ? "text-[#7A877F]"
                                  : "font-semibold text-yellow-700"
                              }
                            >
                              Responsável:{" "}
                              {chamado.assignedToUser?.name || "Sem responsável"}
                            </p>
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </section>



              <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-[#17211B]">
                  Condomínios com Maior Demanda
                </h3>

                <p className="mt-1 text-sm text-[#5E6B63]">
                  Identifique onde há maior volume de solicitações.
                </p>

                {condominiosComMaisChamados.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-5 text-sm text-[#5E6B63]">
                    Ainda não há chamados suficientes para ranking.
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    {condominiosComMaisChamados.map((condominio, index) => (
                      <div
                        key={condominio.id}
                        className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm text-[#7A877F]">#{index + 1}</p>

                            <p className="font-semibold text-[#17211B]">
                              {condominio.name}
                            </p>
                          </div>

                          <strong className="text-2xl text-[#17211B]">
                            {condominio.total}
                          </strong>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-xl border border-[#DDE5DF] bg-white p-3">
                            <p className="text-[#7A877F]">Ativos</p>

                            <strong className="text-[#17211B]">
                              {condominio.open}
                            </strong>
                          </div>

                          <div className="rounded-xl border border-[#DDE5DF] bg-white p-3">
                            <p className="text-[#7A877F]">Prazo vencido</p>

                            <strong className="text-red-700">
                              {condominio.overdue}
                            </strong>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </ResponsiveSection>
        </div>
      </AdminShell>
    </AdminContextGuard>
  );
}