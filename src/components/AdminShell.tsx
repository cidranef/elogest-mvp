"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import ActiveAccessBadge from "@/components/ActiveAccessBadge";
import NotificationBell from "@/components/NotificationBell";



/* =========================================================
   ADMIN SHELL - ELOGEST

   ETAPA 39.4 — SHELL ADMINISTRATIVO OFICIAL

   Objetivo:
   - Criar o esqueleto visual padrão da área administrativa.
   - Centralizar topbar, sidebar, navegação, perfil ativo e footer.
   - Preparar o layout para desktop, tablet e mobile.
   - Reduzir repetição visual nas páginas administrativas.
   - Servir como base para Dashboard, Chamados, Condomínios,
     Unidades, Moradores, Relatórios e demais módulos admin.

   ETAPA 39.6.2 — SINO DE NOTIFICAÇÕES REAL

   Correção:
   - Substituído botão estático do sino por NotificationBell.
   - O sino volta a abrir o dropdown de notificações.
   - Mantém fallback administrativo para /admin/dashboard.

   ETAPA 39.12.1 — MENU DE USUÁRIOS

   Atualização:
   - Adicionada chave "usuarios" ao AdminNavKey.
   - Adicionado item "Usuários" na sidebar.
   - Adicionado ícone "user".
   - Página /admin/usuarios passa a ter item próprio no menu.

   ETAPA 39.17.3 — REFINO DA TOPBAR ADMIN

   Atualização:
   - Topbar admin alinhada ao PortalShell refinado.
   - Busca deixa de parecer input quebrado e passa a ser botão compacto.
   - ActiveAccessBadge passa a usar modo compacto.
   - Melhorado espaçamento da topbar para evitar sobreposição visual.

   ETAPA 41.1 — REFINAMENTO COMERCIAL E VISUAL GLOBAL

   Ajustes desta revisão:
   - AdminShell passa a seguir o padrão visual aprovado no PortalShell.
   - Topbar mantém comunicação institucional leve:
     "EloGest • Governança Condominial".
   - Subtítulo comercial:
     "Gestão, operação e indicadores da carteira em um só lugar."
   - Sidebar foi despoluída:
     removido card superior explicativo.
     removido card inferior "Plataforma em evolução".
   - Rodapé da sidebar passa a exibir copyright discreto.
   - Menu administrativo permanece agrupado por:
     Visão geral, Cadastros, Gestão e análise, Sistema.
   - Padronizada a escrita "Governança Condominial".
   - Mantida navegação, notificações, perfil ativo e logout.
   - Mantida toda a lógica funcional já aprovada.

   ETAPA 41.2 — BUSCA GLOBAL ADMIN

   Ajustes desta revisão:
   - Botão estático "Buscar" foi substituído por formulário real.
   - Campo aceita digitação.
   - Enter executa a busca.
   - Clique na lupa executa a busca.
   - Redireciona para /admin/busca?q=termo.
   - A página /admin/busca será criada na próxima etapa.
   - Mantida a topbar limpa e compacta.

   Regra visual:
   - Sidebar = marca, navegação e copyright discreto.
   - Topbar = identidade discreta e ações globais.
   - Página = título, explicação, ação principal e conteúdo.

   ETAPA 43.1 — REFINAMENTO VISUAL DO CONTEXTO ATIVO

   Ajustes desta revisão:
   - Topbar passa a exibir melhor o perfil ativo e sua carteira.
   - Em telas menores, o badge aparece em uma faixa secundária,
     evitando que a administradora opere sem perceber qual
     carteira/perfil está em uso.

   ETAPA 46 — REDE DE FORNECEDORES ELOGEST

   Ajustes desta revisão:
   - Adicionada chave "fornecedores" ao AdminNavKey.
   - Adicionado item "Fornecedores" no grupo Cadastros.
   - Adicionado ícone "provider" para a Rede de Fornecedores EloGest.
   - Página /admin/fornecedores passa a ter item próprio no menu.

   ETAPA 48.7 — MENU DE COMUNICADOS

   Ajustes desta revisão:
   - Adicionada chave "comunicados" ao AdminNavKey.
   - Adicionado item "Comunicados" na navegação administrativa.
   - Adicionado ícone "announcement" para comunicação oficial.
   - Página /admin/comunicados passa a ter item próprio no menu.

   ETAPA 49 — REUNIÕES DE CONSELHO

   Ajustes desta revisão:
   - Adicionada chave "reunioes-conselho" ao AdminNavKey.
   - Adicionado item "Reuniões De Conselho" na navegação administrativa.
   - Adicionado ícone "meeting" para a Sala De Reunião EloGest.
   - Página /admin/reunioes-conselho passa a ter item próprio no menu.

   ETAPA 50 — ENQUETES

   Ajustes desta revisão:
   - Adicionada chave "enquetes" ao AdminNavKey.
   - Adicionado item "Enquetes" na navegação administrativa.
   - Adicionado ícone "poll" para consultas rápidas e participação.
   - Página /admin/enquetes passa a ter item próprio no menu.
   - Adicionado bloqueio visual por plano/módulo usando a API de Enquetes.

   ETAPA 51 — ASSEMBLEIAS E VOTAÇÃO PELO CELULAR

   Ajustes desta revisão:
   - Adicionada chave "assembleias" ao AdminNavKey.
   - Adicionado item "Assembleias" na navegação administrativa.
   - Adicionado ícone próprio para deliberações formais.
   - Adicionado bloqueio visual por plano/módulo usando a API de Assembleias.

   ETAPA 53.1 — FINANCEIRO INICIAL

   Ajustes desta revisão:
   - Adicionada chave "financeiro" ao AdminNavKey.
   - Adicionado item "Financeiro" na navegação administrativa.
   - Adicionado ícone próprio para receitas, despesas e mensalidades.
   - Adicionado bloqueio visual por plano/módulo usando a API Financeira.

   ETAPA 54.8.1 — LINK DA CENTRAL DE RELATÓRIOS

   Ajustes desta revisão:
   - Item "Relatórios" passa a apontar para /admin/relatorios.
   - Rodapé administrativo recebe link direto para Relatórios.
   - Mantida compatibilidade com current="relatorios" nas páginas da Etapa 54.
   ========================================================= */



type AdminNavKey =
  | "dashboard"
  | "chamados"
  | "chamados-dashboard"
  | "comunicados"
  | "enquetes"
  | "assembleias"
  | "financeiro"
  | "reunioes-conselho"
  | "condominios"
  | "unidades"
  | "moradores"
  | "fornecedores"
  | "usuarios"
  | "relatorios"
  | "documentos"
  | "configuracoes";

interface AdminShellProps {
  children: ReactNode;
  title?: string;
  description?: string;
  current?: AdminNavKey;
  actions?: ReactNode;
}



/* =========================================================
   MARCA VISUAL - ELOGEST
   ========================================================= */

function EloGestMark({
  className = "",
  dark = false,
}: {
  className?: string;
  dark?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 80 80"
      className={className}
      role="img"
      aria-label="Ícone EloGest"
    >
      <defs>
        <linearGradient id="egFrameDarkShell" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#256D3C" />
          <stop offset="100%" stopColor="#174B2A" />
        </linearGradient>

        <linearGradient id="egFrameLightShell" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#8ED08E" />
          <stop offset="100%" stopColor="#5FAE68" />
        </linearGradient>
      </defs>

      <path
        d="M39 8 L15 20 L15 55 L39 72"
        fill="none"
        stroke="url(#egFrameDarkShell)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
      />

      <path
        d="M41 8 L65 20 L65 55 L41 72"
        fill="none"
        stroke="url(#egFrameLightShell)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
      />

      <path
        d="M26 50 L34 45 L34 60 L26 56 Z"
        fill={dark ? "#FFFFFF" : "#17211B"}
      />

      <path
        d="M37 28 L45 24 L45 61 L37 61 Z"
        fill={dark ? "#FFFFFF" : "#17211B"}
      />

      <path
        d="M49 40 L57 45 L57 58 L49 62 Z"
        fill={dark ? "#FFFFFF" : "#17211B"}
      />
    </svg>
  );
}



function EloGestLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/10 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
        <EloGestMark
          className={compact ? "h-9 w-9" : "h-10 w-10"}
          dark
        />
      </div>

      <div>
        <div
          className={[
            "font-semibold tracking-tight",
            compact ? "text-xl" : "text-2xl",
          ].join(" ")}
        >
          <span className="text-[#8ED08E]">Elo</span>
          <span className="text-white">Gest</span>
        </div>

        {!compact && (
          <p className="text-xs font-medium text-white/55">
            Área administrativa
          </p>
        )}
      </div>
    </div>
  );
}



/* =========================================================
   ÍCONES INTERNOS
   ========================================================= */

function ShellIcon({
  type,
  className = "",
}: {
  type:
    | "menu"
    | "search"
    | "dashboard"
    | "ticket"
    | "announcement"
    | "poll"
    | "assembly"
    | "finance"
    | "meeting"
    | "building"
    | "unit"
    | "people"
    | "provider"
    | "user"
    | "report"
    | "document"
    | "settings"
    | "chart"
    | "close";
  className?: string;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      className={className || "h-5 w-5"}
      aria-hidden="true"
    >
      {type === "menu" && (
        <>
          <path {...common} d="M4 7h16" />
          <path {...common} d="M4 12h16" />
          <path {...common} d="M4 17h16" />
        </>
      )}

      {type === "close" && (
        <>
          <path {...common} d="M6 6l12 12" />
          <path {...common} d="M18 6L6 18" />
        </>
      )}

      {type === "search" && (
        <>
          <circle {...common} cx="11" cy="11" r="7" />
          <path {...common} d="M20 20l-3.5-3.5" />
        </>
      )}

      {type === "dashboard" && (
        <>
          <path {...common} d="M4 13h7V4H4z" />
          <path {...common} d="M13 20h7V4h-7z" />
          <path {...common} d="M4 20h7v-5H4z" />
        </>
      )}

      {type === "ticket" && (
        <>
          <path
            {...common}
            d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z"
          />
          <path {...common} d="M9 9h6" />
          <path {...common} d="M9 15h6" />
        </>
      )}

      {type === "announcement" && (
        <>
          <path
            {...common}
            d="M5 10v4a2 2 0 0 0 2 2h2l4 4v-4h2l4 3V5l-4 3H7a2 2 0 0 0-2 2z"
          />
          <path {...common} d="M15 8v8" />
        </>
      )}

      {type === "poll" && (
        <>
          <path
            {...common}
            d="M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1z"
          />
          <path {...common} d="M8 9h2v6H8z" />
          <path {...common} d="M12 12h2v3h-2z" />
          <path {...common} d="M16 8h2v7h-2z" />
          <path {...common} d="M4 19h16" />
        </>
      )}

      {type === "assembly" && (
        <>
          <path {...common} d="M5 20h14" />
          <path {...common} d="M7 20v-8h10v8" />
          <path {...common} d="M5 12h14" />
          <path {...common} d="M12 4l7 4H5z" />
          <path {...common} d="M10 15h4" />
        </>
      )}

      {type === "finance" && (
        <>
          <rect {...common} x="4" y="5" width="16" height="14" rx="2" />
          <path {...common} d="M4 9h16" />
          <path {...common} d="M8 14h3" />
          <path {...common} d="M16 13v3" />
          <path {...common} d="M14.5 14.5h3" />
        </>
      )}

      {type === "meeting" && (
        <>
          <path
            {...common}
            d="M5 8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9l-4 3v-3a3 3 0 0 1-3-3V8z"
          />
          <path {...common} d="M8 10h5" />
          <path {...common} d="M8 13h8" />
          <path {...common} d="M15 9l3-2v8l-3-2" />
        </>
      )}

      {type === "building" && (
        <>
          <path {...common} d="M4 20h16" />
          <path {...common} d="M6 20V5a1 1 0 0 1 1-1h7v16" />
          <path {...common} d="M14 10h3a1 1 0 0 1 1 1v9" />
          <path {...common} d="M9 8h2" />
          <path {...common} d="M9 12h2" />
          <path {...common} d="M9 16h2" />
        </>
      )}

      {type === "unit" && (
        <>
          <path {...common} d="M4 20V8l8-5 8 5v12" />
          <path {...common} d="M9 20v-6h6v6" />
        </>
      )}

      {type === "people" && (
        <>
          <circle {...common} cx="9" cy="8" r="3" />
          <path {...common} d="M3 20a6 6 0 0 1 12 0" />
          <path {...common} d="M16 11a3 3 0 0 0 0-6" />
          <path {...common} d="M18 20a5 5 0 0 0-3-4.5" />
        </>
      )}

      {type === "provider" && (
        <>
          <path
            {...common}
            d="M6 20V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v13"
          />
          <path {...common} d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
          <path {...common} d="M4 20h16" />
          <path {...common} d="M9 10h6" />
          <path {...common} d="M9 14h6" />
          <path {...common} d="M8 20v-3h8v3" />
        </>
      )}

      {type === "user" && (
        <>
          <circle {...common} cx="12" cy="8" r="4" />
          <path {...common} d="M4 21a8 8 0 0 1 16 0" />
        </>
      )}

      {type === "report" && (
        <>
          <path {...common} d="M5 20V4" />
          <path {...common} d="M19 20V10" />
          <path {...common} d="M12 20V7" />
          <path {...common} d="M4 20h16" />
        </>
      )}

      {type === "document" && (
        <>
          <path {...common} d="M7 3h7l4 4v14H7z" />
          <path {...common} d="M14 3v5h5" />
          <path {...common} d="M9 13h6" />
          <path {...common} d="M9 17h6" />
        </>
      )}

      {type === "settings" && (
        <>
          <circle {...common} cx="12" cy="12" r="3" />
          <path
            {...common}
            d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 2-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V20h-3v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-2-2 .1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H4v-3h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-2 .1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V4h3v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2 2-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v3h-.1a1.7 1.7 0 0 0-1.5 1z"
          />
        </>
      )}

      {type === "chart" && (
        <>
          <path {...common} d="M4 19V5" />
          <path {...common} d="M4 19h16" />
          <path {...common} d="M8 15l3-3 3 2 5-7" />
        </>
      )}
    </svg>
  );
}



/* =========================================================
   NAVEGAÇÃO ADMIN
   ========================================================= */

type AdminNavItem = {
  key: AdminNavKey;
  label: string;
  href: string;
  icon: Parameters<typeof ShellIcon>[0]["type"];
  badge?: string;
  requiresCouncilMeetingAccess?: boolean;
  requiresPollsAccess?: boolean;
  requiresAssembliesAccess?: boolean;
  requiresFinancialAccess?: boolean;
};

type AdminNavGroup = {
  title: string;
  items: AdminNavItem[];
};

const adminNavGroups: AdminNavGroup[] = [
  {
    title: "Visão geral",
    items: [
      {
        key: "dashboard",
        label: "Dashboard",
        href: "/admin/dashboard",
        icon: "dashboard",
      },
      {
        key: "chamados",
        label: "Chamados",
        href: "/admin/chamados",
        icon: "ticket",
      },
    ],
  },
  {
    title: "Cadastros",
    items: [
      {
        key: "condominios",
        label: "Condomínios",
        href: "/admin/condominios",
        icon: "building",
      },
      {
        key: "unidades",
        label: "Unidades",
        href: "/admin/unidades",
        icon: "unit",
      },
      {
        key: "moradores",
        label: "Moradores",
        href: "/admin/moradores",
        icon: "people",
      },
      {
        key: "fornecedores",
        label: "Fornecedores",
        href: "/admin/fornecedores",
        icon: "provider",
      },
      {
        key: "usuarios",
        label: "Usuários",
        href: "/admin/usuarios",
        icon: "user",
      },
    ],
  },
  {
    title: "Gestão e análise",
    items: [
      {
        key: "comunicados",
        label: "Comunicados",
        href: "/admin/comunicados",
        icon: "announcement",
      },
      {
        key: "enquetes",
        label: "Enquetes",
        href: "/admin/enquetes",
        icon: "poll",
        requiresPollsAccess: true,
      },
      {
        key: "assembleias",
        label: "Assembleias",
        href: "/admin/assembleias",
        icon: "assembly",
        requiresAssembliesAccess: true,
      },
      {
        key: "financeiro",
        label: "Financeiro",
        href: "/admin/financeiro",
        icon: "finance",
        requiresFinancialAccess: true,
      },
      {
        key: "reunioes-conselho",
        label: "Reuniões De Conselho",
        href: "/admin/reunioes-conselho",
        icon: "meeting",
        requiresCouncilMeetingAccess: true,
      },
      {
        key: "chamados-dashboard",
        label: "Indicadores",
        href: "/admin/chamados/dashboard",
        icon: "chart",
      },
      {
        key: "relatorios",
        label: "Relatórios",
        href: "/admin/relatorios",
        icon: "report",
      },
      {
        key: "documentos",
        label: "Documentos",
        href: "/admin/documentos",
        icon: "document",
      },
    ],
  },
  {
    title: "Sistema",
    items: [
      {
        key: "configuracoes",
        label: "Configurações",
        href: "/admin/configuracoes",
        icon: "settings",
      },
    ],
  },
];



function isNavActive({
  pathname,
  current,
  item,
}: {
  pathname: string;
  current?: AdminNavKey;
  item: AdminNavItem;
}) {
  if (current) {
    return current === item.key;
  }

  if (item.href === "/admin/dashboard") {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}



/* =========================================================
   SIDEBAR
   ========================================================= */

function AdminSidebar({
  current,
  councilMeetingAccessAllowed,
  pollsAccessAllowed,
  assembliesAccessAllowed,
  financialAccessAllowed,
  onNavigate,
}: {
  current?: AdminNavKey;
  councilMeetingAccessAllowed?: boolean | null;
  pollsAccessAllowed?: boolean | null;
  assembliesAccessAllowed?: boolean | null;
  financialAccessAllowed?: boolean | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full flex-col overflow-hidden bg-[#17211B] text-white">
      <div className="relative border-b border-white/10 px-5 py-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(142,208,142,0.25),transparent_42%)]" />

        <div className="relative">
          <EloGestLogo compact />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5">
        <div className="space-y-5">
          {adminNavGroups.map((group) => (
            <div key={group.title}>
              <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-white/35">
                {group.title}
              </p>

              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = isNavActive({
                    pathname,
                    current,
                    item,
                  });

                  const disabledByCouncilPlan =
                    item.requiresCouncilMeetingAccess &&
                    councilMeetingAccessAllowed === false;

                  const disabledByPollsPlan =
                    item.requiresPollsAccess && pollsAccessAllowed === false;

                  const disabledByAssembliesPlan =
                    item.requiresAssembliesAccess && assembliesAccessAllowed === false;

                  const disabledByFinancialPlan =
                    item.requiresFinancialAccess && financialAccessAllowed === false;

                  const disabledByPlan =
                    disabledByCouncilPlan ||
                    disabledByPollsPlan ||
                    disabledByAssembliesPlan ||
                    disabledByFinancialPlan;

                  const itemClassName = [
                    "group relative flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition",
                    disabledByPlan
                      ? "cursor-not-allowed text-white/35"
                      : active
                        ? "bg-[#256D3C] text-white shadow-[0_16px_38px_rgba(37,109,60,0.28)]"
                        : "text-white/70 hover:bg-white/10 hover:text-white",
                  ].join(" ");

                  const itemContent = (
                    <>
                      {active && !disabledByPlan && (
                        <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-[#8ED08E]" />
                      )}

                      <span
                        className={[
                          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition",
                          disabledByPlan
                            ? "border-white/5 bg-white/[0.03] text-white/30"
                            : active
                              ? "border-white/15 bg-white/12 text-white"
                              : "border-white/8 bg-white/[0.04] text-[#8ED08E] group-hover:border-white/15 group-hover:bg-white/10",
                        ].join(" ")}
                      >
                        <ShellIcon
                          type={item.icon}
                          className="h-5 w-5"
                        />
                      </span>

                      <span className="min-w-0 flex-1 truncate">
                        {item.label}
                      </span>

                      {disabledByPlan ? (
                        <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-bold text-white/45">
                          Plano
                        </span>
                      ) : item.badge ? (
                        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold text-white">
                          {item.badge}
                        </span>
                      ) : null}
                    </>
                  );

                  if (disabledByPlan) {
                    return (
                      <span
                        key={item.key}
                        className={itemClassName}
                        title={
                          disabledByPollsPlan
                            ? "O módulo Enquetes não está liberado no plano atual."
                            : disabledByAssembliesPlan
                              ? "O módulo Assembleias não está liberado no plano atual."
                              : disabledByFinancialPlan
                                ? "O módulo Financeiro não está liberado no plano atual."
                                : "O módulo Reuniões De Conselho não está liberado no plano atual."
                        }
                        aria-disabled="true"
                      >
                        {itemContent}
                      </span>
                    );
                  }

                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={onNavigate}
                      className={itemClassName}
                    >
                      {itemContent}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
          © 2026 EloGest
        </p>

        <p className="mt-1 text-xs leading-5 text-white/45">
          Todos os direitos reservados.
        </p>
      </div>
    </aside>
  );
}



/* =========================================================
   TOPBAR
   ========================================================= */

function AdminTopbar({
  actions,
  onOpenMobileMenu,
}: {
  actions?: ReactNode;
  onOpenMobileMenu: () => void;
}) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");



  /* =========================================================
     BUSCA GLOBAL ADMIN

     Nesta etapa, a topbar apenas redireciona para a rota
     de resultados. A página /admin/busca será criada na
     próxima etapa.
     ========================================================= */

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const term = searchTerm.trim();

    if (!term) {
      return;
    }

    router.push(`/admin/busca?q=${encodeURIComponent(term)}`);
  }



  return (
    <header className="sticky top-0 z-30 border-b border-[#DDE5DF] bg-white/95 shadow-[0_10px_35px_rgba(23,33,27,0.04)] backdrop-blur-xl">
      <div className="flex min-h-[86px] items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C] lg:hidden"
          aria-label="Abrir menu"
        >
          <ShellIcon type="menu" />
        </button>

        <div className="flex min-w-0 flex-1 items-center lg:hidden">
          <div className="ml-0 min-w-0">
            <div className="text-lg font-semibold tracking-tight">
              <span className="text-[#256D3C]">Elo</span>
              <span className="text-[#17211B]">Gest</span>
            </div>

            <p className="truncate text-xs font-medium text-[#5E6B63]">
              Governança Condominial
            </p>
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 lg:block">
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              <p className="text-base font-semibold tracking-tight text-[#17211B]">
                <span className="text-[#256D3C]">Elo</span>Gest
              </p>

              <span className="h-1 w-1 rounded-full bg-[#9AA7A0]" />

              <p className="text-sm font-semibold text-[#5E6B63]">
                Governança Condominial
              </p>
            </div>

            <p className="mt-1 max-w-3xl text-sm font-medium text-[#7A877F]">
              Gestão, operação e indicadores da carteira em um só lugar.
            </p>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <form
  onSubmit={handleSearch}
  className="hidden h-12 w-[260px] items-center gap-2 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold text-[#5E6B63] shadow-sm focus-within:border-[#256D3C] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#256D3C]/10 xl:flex"
  role="search"
  aria-label="Busca administrativa"
>
  <button
    type="submit"
    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#5E6B63] transition hover:bg-[#EAF7EE] hover:text-[#256D3C]"
    aria-label="Buscar no sistema"
    title="Buscar no sistema"
  >
    <ShellIcon type="search" className="h-5 w-5" />
  </button>

  <input
    type="search"
    value={searchTerm}
    onChange={(event) => setSearchTerm(event.target.value)}
    placeholder="Buscar..."
    className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#17211B] outline-none placeholder:text-[#9AA7A0]"
    aria-label="Buscar no sistema"
  />
</form>

          <NotificationBell fallbackHref="/admin/dashboard" />

          <div className="hidden lg:block">
            <ActiveAccessBadge compact />
          </div>

          <LogoutButton />
        </div>
      </div>

      <div className="border-t border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 sm:px-6 lg:hidden">
        <ActiveAccessBadge />
      </div>

      {actions && (
        <div className="border-t border-[#DDE5DF] bg-[#F6F8F7] px-4 py-3 sm:px-6 lg:hidden">
          {actions}
        </div>
      )}
    </header>
  );
}



/* =========================================================
   FOOTER
   ========================================================= */

function AdminFooter({
  councilMeetingAccessAllowed,
  pollsAccessAllowed,
  assembliesAccessAllowed,
  financialAccessAllowed,
}: {
  councilMeetingAccessAllowed?: boolean | null;
  pollsAccessAllowed?: boolean | null;
  assembliesAccessAllowed?: boolean | null;
  financialAccessAllowed?: boolean | null;
}) {
  return (
    <footer className="mt-10 border-t border-[#DDE5DF] py-6">
      <div className="flex flex-col gap-4 text-xs text-[#7A877F] md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-semibold text-[#5E6B63]">
            EloGest — Governança Condominial
          </p>

          <p className="mt-1">
            Plataforma para gestão de chamados, moradores, unidades e indicadores.
          </p>
        </div>

        <div className="flex flex-wrap gap-4">
          <Link href="/admin/dashboard" className="font-semibold hover:text-[#256D3C]">
            Dashboard
          </Link>

          <Link href="/admin/chamados" className="font-semibold hover:text-[#256D3C]">
            Chamados
          </Link>

          <Link href="/admin/comunicados" className="font-semibold hover:text-[#256D3C]">
            Comunicados
          </Link>

          {pollsAccessAllowed === false ? (
            <span
              className="cursor-not-allowed font-semibold text-[#9AA7A0]"
              title="O módulo Enquetes não está liberado no plano atual."
            >
              Enquetes
            </span>
          ) : (
            <Link href="/admin/enquetes" className="font-semibold hover:text-[#256D3C]">
              Enquetes
            </Link>
          )}

          {assembliesAccessAllowed === false ? (
            <span
              className="cursor-not-allowed font-semibold text-[#9AA7A0]"
              title="O módulo Assembleias não está liberado no plano atual."
            >
              Assembleias
            </span>
          ) : (
            <Link href="/admin/assembleias" className="font-semibold hover:text-[#256D3C]">
              Assembleias
            </Link>
          )}

          {financialAccessAllowed === false ? (
            <span
              className="cursor-not-allowed font-semibold text-[#9AA7A0]"
              title="O módulo Financeiro não está liberado no plano atual."
            >
              Financeiro
            </span>
          ) : (
            <Link href="/admin/financeiro" className="font-semibold hover:text-[#256D3C]">
              Financeiro
            </Link>
          )}

          {councilMeetingAccessAllowed === false ? (
            <span
              className="cursor-not-allowed font-semibold text-[#9AA7A0]"
              title="O módulo Reuniões De Conselho não está liberado no plano atual."
            >
              Reuniões De Conselho
            </span>
          ) : (
            <Link href="/admin/reunioes-conselho" className="font-semibold hover:text-[#256D3C]">
              Reuniões De Conselho
            </Link>
          )}

          <Link href="/admin/usuarios" className="font-semibold hover:text-[#256D3C]">
            Usuários
          </Link>

          <Link href="/admin/fornecedores" className="font-semibold hover:text-[#256D3C]">
            Fornecedores
          </Link>

          <Link href="/admin/relatorios" className="font-semibold hover:text-[#256D3C]">
            Relatórios
          </Link>

          <Link href="/contexto" className="font-semibold hover:text-[#256D3C]">
            Trocar perfil
          </Link>
        </div>
      </div>
    </footer>
  );
}



/* =========================================================
   COMPONENTE PRINCIPAL
   ========================================================= */

export default function AdminShell({
  children,
  current,
  actions,
}: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [councilMeetingAccessAllowed, setCouncilMeetingAccessAllowed] =
    useState<boolean | null>(null);
  const [pollsAccessAllowed, setPollsAccessAllowed] =
    useState<boolean | null>(null);
  const [assembliesAccessAllowed, setAssembliesAccessAllowed] =
    useState<boolean | null>(null);
  const [financialAccessAllowed, setFinancialAccessAllowed] =
    useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function checkCouncilMeetingAccess() {
      try {
        const response = await fetch(
          "/api/admin/reunioes-conselho?page=1&pageSize=1",
          {
            cache: "no-store",
          },
        );

        if (!isMounted) {
          return;
        }

        if (response.status === 403) {
          setCouncilMeetingAccessAllowed(false);
          return;
        }

        if (response.ok) {
          setCouncilMeetingAccessAllowed(true);
        }
      } catch {
        if (isMounted) {
          setCouncilMeetingAccessAllowed(null);
        }
      }
    }

    async function checkPollsAccess() {
      try {
        const response = await fetch("/api/admin/enquetes?page=1&pageSize=1", {
          cache: "no-store",
        });

        if (!isMounted) {
          return;
        }

        if (response.status === 403) {
          setPollsAccessAllowed(false);
          return;
        }

        if (response.ok) {
          setPollsAccessAllowed(true);
        }
      } catch {
        if (isMounted) {
          setPollsAccessAllowed(null);
        }
      }
    }

    async function checkAssembliesAccess() {
      try {
        const response = await fetch("/api/admin/assembleias?page=1&pageSize=1", {
          cache: "no-store",
        });

        if (!isMounted) {
          return;
        }

        if (response.status === 403) {
          setAssembliesAccessAllowed(false);
          return;
        }

        if (response.ok) {
          setAssembliesAccessAllowed(true);
        }
      } catch {
        if (isMounted) {
          setAssembliesAccessAllowed(null);
        }
      }
    }

    async function checkFinancialAccess() {
      try {
        const response = await fetch(
          "/api/admin/financeiro/categorias?page=1&pageSize=1",
          {
            cache: "no-store",
          },
        );

        if (!isMounted) {
          return;
        }

        if (response.status === 403) {
          setFinancialAccessAllowed(false);
          return;
        }

        if (response.ok) {
          setFinancialAccessAllowed(true);
        }
      } catch {
        if (isMounted) {
          setFinancialAccessAllowed(null);
        }
      }
    }

    void checkCouncilMeetingAccess();
    void checkPollsAccess();
    void checkAssembliesAccess();
    void checkFinancialAccess();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#F6F8F7_0%,#FFFFFF_45%,#EAF7EE_120%)] text-[#17211B]">
      {/* Sidebar desktop */}
      <div className="fixed inset-y-0 left-0 z-40 hidden w-72 lg:block">
        <AdminSidebar
          current={current}
          councilMeetingAccessAllowed={councilMeetingAccessAllowed}
          pollsAccessAllowed={pollsAccessAllowed}
          assembliesAccessAllowed={assembliesAccessAllowed}
          financialAccessAllowed={financialAccessAllowed}
        />
      </div>



      {/* Drawer mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-[#17211B]/62 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />

          <div className="absolute inset-y-0 left-0 w-[88%] max-w-80 overflow-hidden rounded-r-[32px] shadow-2xl">
            <AdminSidebar
              current={current}
              councilMeetingAccessAllowed={councilMeetingAccessAllowed}
              pollsAccessAllowed={pollsAccessAllowed}
              assembliesAccessAllowed={assembliesAccessAllowed}
              financialAccessAllowed={financialAccessAllowed}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#17211B] shadow-lg transition hover:text-red-700"
            aria-label="Fechar menu"
          >
            <ShellIcon type="close" />
          </button>
        </div>
      )}



      {/* Área principal */}
      <div className="lg:pl-72">
        <AdminTopbar
          actions={actions}
          onOpenMobileMenu={() => setMobileOpen(true)}
        />

        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-7xl">
            {actions && (
              <div className="mb-6 hidden lg:flex lg:justify-end">
                {actions}
              </div>
            )}

            {children}

            <AdminFooter
              councilMeetingAccessAllowed={councilMeetingAccessAllowed}
              pollsAccessAllowed={pollsAccessAllowed}
              assembliesAccessAllowed={assembliesAccessAllowed}
              financialAccessAllowed={financialAccessAllowed}
            />
          </div>
        </main>
      </div>
    </div>
  );
}