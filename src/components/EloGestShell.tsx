"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import ActiveAccessBadge from "@/components/ActiveAccessBadge";
import NotificationBell from "@/components/NotificationBell";



/* =========================================================
   ELOGEST SHELL - ÁREA INTERNA DA PLATAFORMA

   ETAPA 42.2 — AMBIENTE SUPER ADMIN ELOGEST

   Objetivo:
   - Separar a área interna da EloGest da área administrativa
     das administradoras.
   - Evitar mistura entre:
     EloGest = dona da plataforma
     Administradora = cliente operacional
     Portal = usuário final
   - Criar base visual e estrutural para:
     dashboard global,
     administradoras,
     usuários globais,
     planos,
     indicadores SaaS,
     auditoria,
     suporte e configurações globais.

   Rotas sugeridas:
   /elogest/dashboard
   /elogest/administradoras
   /elogest/administradoras/nova
   /elogest/administradoras/[id]
   /elogest/usuarios
   /elogest/planos
   /elogest/indicadores
   /elogest/auditoria
   /elogest/suporte
   /elogest/configuracoes

   Importante:
   - Este shell deve ser usado apenas por SUPER_ADMIN.
   - A proteção de rota será feita nas páginas/APIs com getAuthUser.
   - O AdminShell permanece reservado para administradoras.
   ========================================================= */



type EloGestNavKey =
  | "dashboard"
  | "administradoras"
  | "usuarios"
  | "planos"
  | "indicadores"
  | "auditoria"
  | "suporte"
  | "configuracoes";

interface EloGestShellProps {
  children: ReactNode;
  current?: EloGestNavKey;
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
        <linearGradient id="egFrameDarkEloGestShell" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#256D3C" />
          <stop offset="100%" stopColor="#174B2A" />
        </linearGradient>

        <linearGradient id="egFrameLightEloGestShell" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#8ED08E" />
          <stop offset="100%" stopColor="#5FAE68" />
        </linearGradient>
      </defs>

      <path
        d="M39 8 L15 20 L15 55 L39 72"
        fill="none"
        stroke="url(#egFrameDarkEloGestShell)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
      />

      <path
        d="M41 8 L65 20 L65 55 L41 72"
        fill="none"
        stroke="url(#egFrameLightEloGestShell)"
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
        <EloGestMark className={compact ? "h-9 w-9" : "h-10 w-10"} dark />
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
            Plataforma
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
    | "close"
    | "search"
    | "dashboard"
    | "administrator"
    | "users"
    | "plans"
    | "chart"
    | "audit"
    | "support"
    | "settings";
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

      {type === "administrator" && (
        <>
          <path {...common} d="M4 20h16" />
          <path {...common} d="M6 20V5a1 1 0 0 1 1-1h7v16" />
          <path {...common} d="M14 10h3a1 1 0 0 1 1 1v9" />
          <path {...common} d="M9 8h2" />
          <path {...common} d="M9 12h2" />
          <path {...common} d="M9 16h2" />
        </>
      )}

      {type === "users" && (
        <>
          <circle {...common} cx="9" cy="8" r="3" />
          <path {...common} d="M3 20a6 6 0 0 1 12 0" />
          <path {...common} d="M16 11a3 3 0 0 0 0-6" />
          <path {...common} d="M18 20a5 5 0 0 0-3-4.5" />
        </>
      )}

      {type === "plans" && (
        <>
          <path {...common} d="M5 5h14v14H5z" />
          <path {...common} d="M8 9h8" />
          <path {...common} d="M8 13h5" />
          <path {...common} d="M8 17h3" />
        </>
      )}

      {type === "chart" && (
        <>
          <path {...common} d="M4 19V5" />
          <path {...common} d="M4 19h16" />
          <path {...common} d="M8 15l3-3 3 2 5-7" />
        </>
      )}

      {type === "audit" && (
        <>
          <path {...common} d="M7 3h8l4 4v14H7z" />
          <path {...common} d="M15 3v5h5" />
          <path {...common} d="M9 13h6" />
          <path {...common} d="M9 17h4" />
          <path {...common} d="M5 7v14" />
        </>
      )}

      {type === "support" && (
        <>
          <path {...common} d="M4 12a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2h-2" />
          <path {...common} d="M8 18H6a2 2 0 0 1-2-2v-4" />
          <path {...common} d="M9 12h.01" />
          <path {...common} d="M15 12h.01" />
          <path {...common} d="M10 16h4" />
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
    </svg>
  );
}



/* =========================================================
   NAVEGAÇÃO ELOGEST
   ========================================================= */

const eloGestNavGroups: {
  title: string;
  items: {
    key: EloGestNavKey;
    label: string;
    href: string;
    icon: Parameters<typeof ShellIcon>[0]["type"];
    badge?: string;
  }[];
}[] = [
  {
    title: "Plataforma",
    items: [
      {
        key: "dashboard",
        label: "Dashboard",
        href: "/elogest/dashboard",
        icon: "dashboard",
      },
      {
        key: "administradoras",
        label: "Administradoras",
        href: "/elogest/administradoras",
        icon: "administrator",
      },
      {
        key: "usuarios",
        label: "Usuários globais",
        href: "/elogest/usuarios",
        icon: "users",
      },
    ],
  },
  {
    title: "Gestão SaaS",
    items: [
      {
        key: "planos",
        label: "Planos",
        href: "/elogest/planos",
        icon: "plans",
        badge: "Futuro",
      },
      {
        key: "indicadores",
        label: "Indicadores",
        href: "/elogest/indicadores",
        icon: "chart",
      },
      {
        key: "auditoria",
        label: "Auditoria",
        href: "/elogest/auditoria",
        icon: "audit",
        badge: "Futuro",
      },
    ],
  },
  {
    title: "Operação",
    items: [
      {
        key: "suporte",
        label: "Suporte",
        href: "/elogest/suporte",
        icon: "support",
        badge: "Futuro",
      },
      {
        key: "configuracoes",
        label: "Configurações",
        href: "/elogest/configuracoes",
        icon: "settings",
      },
    ],
  },
];



const eloGestNavItems = eloGestNavGroups.flatMap((group) => group.items);



function isNavActive({
  pathname,
  current,
  item,
}: {
  pathname: string;
  current?: EloGestNavKey;
  item: (typeof eloGestNavItems)[number];
}) {
  if (current) {
    return current === item.key;
  }

  if (item.href === "/elogest/dashboard") {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}



/* =========================================================
   SIDEBAR
   ========================================================= */

function EloGestSidebar({
  current,
  onNavigate,
}: {
  current?: EloGestNavKey;
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
          {eloGestNavGroups.map((group) => (
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
                        <ShellIcon type={item.icon} className="h-5 w-5" />
                      </span>

                      <span className="min-w-0 flex-1 truncate">
                        {item.label}
                      </span>

                      {item.badge && (
                        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold text-white/80">
                          {item.badge}
                        </span>
                      )}
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
          Ambiente interno da plataforma.
        </p>
      </div>
    </aside>
  );
}



/* =========================================================
   TOPBAR
   ========================================================= */

function EloGestTopbar({
  actions,
  onOpenMobileMenu,
}: {
  actions?: ReactNode;
  onOpenMobileMenu: () => void;
}) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const term = searchTerm.trim();

    if (!term) {
      return;
    }

    router.push(`/elogest/busca?q=${encodeURIComponent(term)}`);
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
          <div className="min-w-0">
            <div className="text-lg font-semibold tracking-tight">
              <span className="text-[#256D3C]">Elo</span>
              <span className="text-[#17211B]">Gest</span>
            </div>

            <p className="truncate text-xs font-medium text-[#5E6B63]">
              Plataforma
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
                Ambiente interno da plataforma
              </p>
            </div>

            <p className="mt-1 max-w-3xl text-sm font-medium text-[#7A877F]">
              Gestão de administradoras, uso da plataforma e operação global.
            </p>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <form
            onSubmit={handleSearch}
            className="hidden h-12 w-[260px] items-center gap-2 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold text-[#5E6B63] shadow-sm focus-within:border-[#256D3C] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#256D3C]/10 xl:flex"
            role="search"
            aria-label="Busca na plataforma"
          >
            <button
              type="submit"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#5E6B63] transition hover:bg-[#EAF7EE] hover:text-[#256D3C]"
              aria-label="Buscar na plataforma"
              title="Buscar na plataforma"
            >
              <ShellIcon type="search" className="h-5 w-5" />
            </button>

            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar..."
              className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#17211B] outline-none placeholder:text-[#9AA7A0]"
              aria-label="Buscar na plataforma"
            />
          </form>

          <NotificationBell fallbackHref="/elogest/dashboard" />

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

function EloGestFooter() {
  return (
    <footer className="mt-10 border-t border-[#DDE5DF] py-6">
      <div className="flex flex-col gap-4 text-xs text-[#7A877F] md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-semibold text-[#5E6B63]">
            EloGest — Governança Condominial
          </p>

          <p className="mt-1">
            Ambiente interno para gestão da plataforma e administradoras.
          </p>
        </div>

        <div className="flex flex-wrap gap-4">
          <Link href="/elogest/dashboard" className="font-semibold hover:text-[#256D3C]">
            Dashboard
          </Link>

          <Link href="/elogest/administradoras" className="font-semibold hover:text-[#256D3C]">
            Administradoras
          </Link>

          <Link href="/admin/dashboard" className="font-semibold hover:text-[#256D3C]">
            Área Admin
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

export default function EloGestShell({
  children,
  current,
  actions,
}: EloGestShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#F6F8F7_0%,#FFFFFF_45%,#EAF7EE_120%)] text-[#17211B]">
      {/* Sidebar desktop */}
      <div className="fixed inset-y-0 left-0 z-40 hidden w-72 lg:block">
        <EloGestSidebar current={current} />
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
            <EloGestSidebar
              current={current}
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
        <EloGestTopbar
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

            <EloGestFooter />
          </div>
        </main>
      </div>
    </div>
  );
}