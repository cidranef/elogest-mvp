"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import ActiveAccessBadge from "@/components/ActiveAccessBadge";
import NotificationBell from "@/components/NotificationBell";



/* =========================================================
   PORTAL SHELL - ELOGEST

   ETAPA 39.14 — SHELL OFICIAL DO PORTAL

   Objetivo:
   - Criar o esqueleto visual padrão do portal.
   - Centralizar topbar, menu mobile, navegação, notificações,
     perfil ativo, logout e footer.
   - Preparar o portal para síndico, morador e proprietário.
   - Reduzir repetição visual nas páginas do portal.

   ETAPA 39.14.3 — AJUSTE DE NAVEGAÇÃO DO PORTAL

   Correção:
   - Removido item "Notificações" da sidebar.
   - Removido link "Notificações" do footer.
   - Notificações passam a ficar centralizadas apenas no sino.

   ETAPA 39.16.1 — REFINO DA TOPBAR DO PORTAL

   Correção:
   - Removido badge solto de roleLabel da topbar.
   - Busca deixa de parecer um input quebrado.
   - Busca vira botão compacto "Buscar".
   - ActiveAccessBadge passa a usar modo compacto.
   - Topbar fica mais limpa e com espaçamento mais consistente.

   ETAPA 41.1 — REFINAMENTO COMERCIAL E VISUAL GLOBAL

   Ajustes desta revisão:
   - Topbar mantida com comunicação institucional leve:
     "EloGest • Governança Condominial".
   - Mantido subtítulo:
     "Atendimento, comunicação e acompanhamento em um só lugar."
   - Sidebar foi despoluída:
     removido card superior "Portal do usuário".
     removido card inferior "Portal EloGest".
   - Rodapé da sidebar passa a exibir copyright discreto.
   - Padronizada a escrita "Governança Condominial".
   - Mantida navegação, notificações, perfil ativo e logout.
   - Mantida toda a lógica funcional já aprovada.

   ETAPA 41.2 — BUSCA GLOBAL PORTAL

   Ajustes desta revisão:
   - Botão estático "Buscar" foi substituído por formulário real.
   - Campo aceita digitação.
   - Enter executa a busca.
   - Clique na lupa executa a busca.
   - Redireciona para /portal/busca?q=termo.
   - A página /portal/busca será criada na próxima etapa.
   - Mantida a topbar limpa e compacta.

   Regra visual:
   - Sidebar = marca, navegação e copyright discreto.
   - Topbar = identidade discreta e ações globais.
   - Página = título, explicação, ação principal e conteúdo.
   ========================================================= */



type PortalNavKey =
  | "dashboard"
  | "chamados"
  | "perfil";

interface PortalShellProps {
  children: ReactNode;
  title?: string;
  description?: string;
  current?: PortalNavKey;
  actions?: ReactNode;

  /*
    Mantido por compatibilidade com páginas que ainda enviam roleLabel.
    A topbar não renderiza mais esse badge, pois o perfil ativo agora
    fica centralizado no ActiveAccessBadge.
  */
  roleLabel?: string;

  canSwitchProfile?: boolean;
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
        <linearGradient id="egFrameDarkPortal" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#256D3C" />
          <stop offset="100%" stopColor="#174B2A" />
        </linearGradient>

        <linearGradient id="egFrameLightPortal" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#8ED08E" />
          <stop offset="100%" stopColor="#5FAE68" />
        </linearGradient>
      </defs>

      <path
        d="M39 8 L15 20 L15 55 L39 72"
        fill="none"
        stroke="url(#egFrameDarkPortal)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
      />

      <path
        d="M41 8 L65 20 L65 55 L41 72"
        fill="none"
        stroke="url(#egFrameLightPortal)"
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
            Portal condominial
          </p>
        )}
      </div>
    </div>
  );
}



/* =========================================================
   ÍCONES
   ========================================================= */

function PortalIcon({
  type,
  className = "",
}: {
  type:
    | "menu"
    | "close"
    | "dashboard"
    | "ticket"
    | "profile"
    | "home"
    | "search";
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

      {type === "profile" && (
        <>
          <circle {...common} cx="12" cy="8" r="4" />
          <path {...common} d="M4 21a8 8 0 0 1 16 0" />
        </>
      )}

      {type === "home" && (
        <>
          <path {...common} d="M4 20V9l8-6 8 6v11" />
          <path {...common} d="M9 20v-6h6v6" />
        </>
      )}

      {type === "search" && (
        <>
          <circle {...common} cx="11" cy="11" r="7" />
          <path {...common} d="M20 20l-3.5-3.5" />
        </>
      )}
    </svg>
  );
}



/* =========================================================
   NAVEGAÇÃO DO PORTAL
   ========================================================= */

function getPortalNavItems(canSwitchProfile: boolean) {
  const items: {
    key: PortalNavKey;
    label: string;
    href: string;
    icon: Parameters<typeof PortalIcon>[0]["type"];
  }[] = [
    {
      key: "dashboard",
      label: "Dashboard",
      href: "/portal/dashboard",
      icon: "dashboard",
    },
    {
      key: "chamados",
      label: "Chamados",
      href: "/portal/chamados",
      icon: "ticket",
    },
  ];

  if (canSwitchProfile) {
    items.push({
      key: "perfil",
      label: "Trocar perfil",
      href: "/contexto",
      icon: "profile",
    });
  }

  return items;
}



function isNavActive({
  pathname,
  current,
  item,
}: {
  pathname: string;
  current?: PortalNavKey;
  item: ReturnType<typeof getPortalNavItems>[number];
}) {
  if (current) {
    return current === item.key;
  }

  if (item.href === "/portal/dashboard") {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}



/* =========================================================
   SIDEBAR
   ========================================================= */

function PortalSidebar({
  current,
  canSwitchProfile,
  onNavigate,
}: {
  current?: PortalNavKey;
  canSwitchProfile: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const navItems = getPortalNavItems(canSwitchProfile);

  return (
    <aside className="flex h-full flex-col overflow-hidden bg-[#17211B] text-white">
      <div className="relative border-b border-white/10 px-5 py-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(142,208,142,0.25),transparent_42%)]" />

        <div className="relative">
          <EloGestLogo compact />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5">
        <div className="space-y-1">
          {navItems.map((item) => {
            const active = isNavActive({
              pathname,
              current,
              item,
            });

            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onNavigate}
                className={[
                  "group relative flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition",
                  active
                    ? "bg-[#256D3C] text-white shadow-[0_16px_38px_rgba(37,109,60,0.28)]"
                    : "text-white/70 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-[#8ED08E]" />
                )}

                <span
                  className={[
                    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition",
                    active
                      ? "border-white/15 bg-white/12 text-white"
                      : "border-white/8 bg-white/[0.04] text-[#8ED08E] group-hover:border-white/15 group-hover:bg-white/10",
                  ].join(" ")}
                >
                  <PortalIcon
                    type={item.icon}
                    className="h-5 w-5"
                  />
                </span>

                <span className="min-w-0 flex-1 truncate">
                  {item.label}
                </span>
              </Link>
            );
          })}
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

function PortalTopbar({
  actions,
  onOpenMobileMenu,
}: {
  actions?: ReactNode;
  onOpenMobileMenu: () => void;
}) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");



  /* =========================================================
     BUSCA GLOBAL PORTAL

     Nesta etapa, a topbar apenas redireciona para a rota
     de resultados. A página /portal/busca será criada na
     próxima etapa.
     ========================================================= */

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const term = searchTerm.trim();

    if (!term) {
      return;
    }

    router.push(`/portal/busca?q=${encodeURIComponent(term)}`);
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
          <PortalIcon type="menu" />
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
              Atendimento, comunicação e acompanhamento em um só lugar.
            </p>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <form
            onSubmit={handleSearch}
            className="hidden h-12 w-[260px] items-center gap-2 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold text-[#5E6B63] shadow-sm transition-within:border-[#256D3C] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#256D3C]/10 xl:flex"
            role="search"
            aria-label="Busca no portal"
          >
            <button
              type="submit"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#5E6B63] transition hover:bg-[#EAF7EE] hover:text-[#256D3C]"
              aria-label="Buscar no portal"
              title="Buscar no portal"
            >
              <PortalIcon type="search" className="h-5 w-5" />
            </button>

            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar..."
              className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#17211B] outline-none placeholder:text-[#9AA7A0]"
              aria-label="Buscar no portal"
            />
          </form>

          <NotificationBell fallbackHref="/portal/dashboard" />

          <div className="hidden xl:block">
            <ActiveAccessBadge compact />
          </div>

          <LogoutButton />
        </div>
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

function PortalFooter({ canSwitchProfile }: { canSwitchProfile: boolean }) {
  return (
    <footer className="mt-10 border-t border-[#DDE5DF] py-6">
      <div className="flex flex-col gap-4 text-xs text-[#7A877F] md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-semibold text-[#5E6B63]">
            EloGest — Governança Condominial
          </p>

          <p className="mt-1">
            Canal para acompanhamento de chamados, mensagens e atualizações.
          </p>
        </div>

        <div className="flex flex-wrap gap-4">
          <Link href="/portal/dashboard" className="font-semibold hover:text-[#256D3C]">
            Dashboard
          </Link>

          <Link href="/portal/chamados" className="font-semibold hover:text-[#256D3C]">
            Chamados
          </Link>

          {canSwitchProfile && (
            <Link href="/contexto" className="font-semibold hover:text-[#256D3C]">
              Trocar perfil
            </Link>
          )}
        </div>
      </div>
    </footer>
  );
}



/* =========================================================
   COMPONENTE PRINCIPAL
   ========================================================= */

export default function PortalShell({
  children,
  current,
  actions,
  canSwitchProfile = false,
}: PortalShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#F6F8F7_0%,#FFFFFF_45%,#EAF7EE_120%)] text-[#17211B]">
      {/* Sidebar desktop */}
      <div className="fixed inset-y-0 left-0 z-40 hidden w-72 lg:block">
        <PortalSidebar
          current={current}
          canSwitchProfile={canSwitchProfile}
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
            <PortalSidebar
              current={current}
              canSwitchProfile={canSwitchProfile}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#17211B] shadow-lg transition hover:text-red-700"
            aria-label="Fechar menu"
          >
            <PortalIcon type="close" />
          </button>
        </div>
      )}



      {/* Área principal */}
      <div className="lg:pl-72">
        <PortalTopbar
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

            <PortalFooter canSwitchProfile={canSwitchProfile} />
          </div>
        </main>
      </div>
    </div>
  );
}