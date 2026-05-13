"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import NotificationBell from "@/components/NotificationBell";



/* =========================================================
   AÇÕES DO TOPO ADMINISTRATIVO - ELOGEST

   Centraliza os botões principais da área administrativa.

   ETAPA 23.1 - AJUSTE

   Antes:
   - Este arquivo possuía uma implementação própria do sino
     de notificações.

   Problema:
   - O projeto passou a ter também o componente reutilizável
     NotificationBell.tsx.
   - As páginas administrativas continuavam usando o sino antigo
     embutido neste arquivo.
   - Por isso o botão "Ver todas" não aparecia.

   Agora:
   - Removemos a lógica interna de notificações deste arquivo.
   - O topo administrativo passa a usar o componente central:
     <NotificationBell />
   - Assim o botão "Ver todas" aparece corretamente e aponta para
     /notificacoes.

   ETAPA 29.1 - REFINAMENTO POR PERFIL DE ACESSO ATIVO

   Objetivo:
   - Cada perfil deve ver apenas ações compatíveis com o perfil
     de acesso ativo.

   Regras:
   - SUPER_ADMIN:
     vê menu administrativo completo.

   - ADMINISTRADORA:
     vê menu administrativo completo.

   - SÍNDICO:
     não deve ver atalhos administrativos amplos;
     recebe atalhos para o Portal do Síndico.

   - MORADOR / PROPRIETÁRIO:
     não devem operar a área administrativa;
     recebem atalhos para o Portal.

   Observação:
   A proteção real continua nas páginas e APIs.
   Este componente apenas melhora a experiência visual.

   ETAPA 30.3.2:
   Revisão final dos redirecionamentos:
   - Selecionar perfil aponta para /contexto quando não há perfil ativo;
   - perfil administrativo usa NotificationBell com fallback /admin/dashboard;
   - perfil de portal usa NotificationBell com fallback /portal/dashboard;
   - sem perfil ou carregando usa fallback neutro /contexto.

   ETAPA 38.7:
   - Padronização geral da navegação administrativa.
   - Textos visíveis trocados de "contexto" para "perfil de acesso".
   - Botões revisados para ficarem mais claros e consistentes.
   - Mantida a rota técnica /contexto.

   ETAPA 38.7.1:
   - Botão "Trocar perfil" passa a aparecer somente quando o usuário
     possui mais de um perfil de acesso disponível.
   - Usuário com apenas um perfil não vê opção de troca.
   - Caso não exista perfil ativo, "Selecionar perfil" continua aparecendo.

   ETAPA 38.9 — REVISÃO DE TEXTOS FINAIS E MICROCOPY DO MVP

   - Texto de carregamento ajustado para "Preparando atalhos...".
   - Botão "+ Novo chamado" ajustado para "Novo chamado".
   - Mantidos textos finais:
     Dashboard admin, Dashboard portal, Fila de chamados,
     Dashboard de chamados, Relatórios, Selecionar perfil e Trocar perfil.
   - Mantida a regra de exibir "Trocar perfil" somente quando
     existir mais de um perfil de acesso disponível.
   - Mantida a rota técnica /contexto.
   ========================================================= */



type AdminPage =
  | "home"
  | "condominios"
  | "unidades"
  | "moradores"
  | "usuarios"
  | "fila"
  | "chamados-dashboard"
  | "relatorios"
  | "detalhe";

interface AdminTopActionsProps {
  current?: AdminPage;
  onNewTicket?: () => void;
}



interface ActiveAccess {
  accessId?: string | null;
  role?: string | null;
  label?: string | null;
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
  source?: string | null;
}



type NavItem = {
  key: AdminPage | string;
  label: string;
  href: string;
  tone?: "default" | "green";
};



/* =========================================================
   HELPERS DE PERFIL
   ========================================================= */

function isAdminRole(role?: string | null) {
  return role === "SUPER_ADMIN" || role === "ADMINISTRADORA";
}



function isPortalRole(role?: string | null) {
  return role === "SINDICO" || role === "MORADOR" || role === "PROPRIETARIO";
}



/* =========================================================
   EXTRAIR QUANTIDADE DE PERFIS DISPONÍVEIS

   A API /api/user/accesses pode evoluir o formato da resposta.
   Por isso esta função é defensiva e aceita formatos comuns:

   - data.accesses
   - data.user.accesses
   - data.availableAccesses
   - data.items

   Se nada vier, retorna 0.
   ========================================================= */

function extractAccessCount(data: unknown) {
  const value = data as {
    accesses?: unknown;
    user?: {
      accesses?: unknown;
    };
    availableAccesses?: unknown;
    items?: unknown;
  };

  if (Array.isArray(value?.accesses)) {
    return value.accesses.length;
  }

  if (Array.isArray(value?.user?.accesses)) {
    return value.user.accesses.length;
  }

  if (Array.isArray(value?.availableAccesses)) {
    return value.availableAccesses.length;
  }

  if (Array.isArray(value?.items)) {
    return value.items.length;
  }

  return 0;
}



/* =========================================================
   CLASSE PADRÃO DOS BOTÕES
   ========================================================= */

function navButtonClass(tone: "default" | "green" = "default") {
  if (tone === "green") {
    return "inline-flex h-12 items-center justify-center bg-green-600 hover:bg-green-700 px-6 rounded-xl font-bold";
  }

  return "inline-flex h-12 items-center justify-center bg-gray-700 hover:bg-gray-600 px-6 rounded-xl font-bold";
}



/* =========================================================
   BOTÃO TROCAR PERFIL

   Exibido somente quando houver mais de um perfil disponível.
   ========================================================= */

function SwitchProfileButton() {
  return (
    <Link
      href="/contexto"
      className="inline-flex h-12 items-center justify-center bg-gray-700 hover:bg-gray-600 px-6 rounded-xl font-bold"
    >
      Trocar perfil
    </Link>
  );
}



/* =========================================================
   COMPONENTE
   ========================================================= */

export default function AdminTopActions({
  current,
  onNewTicket,
}: AdminTopActionsProps) {
  const [activeAccess, setActiveAccess] = useState<ActiveAccess | null>(null);
  const [accessCount, setAccessCount] = useState(0);
  const [loadingAccess, setLoadingAccess] = useState(true);



  /* =========================================================
     CARREGAR PERFIL DE ACESSO ATIVO + PERFIS DISPONÍVEIS

     Usamos:
     - /api/user/active-access para saber o perfil ativo;
     - /api/user/accesses para saber se existe mais de um perfil.

     Assim o topo só mostra "Trocar perfil" quando realmente
     houver mais de uma opção para o usuário.
     ========================================================= */

  async function loadAccessData() {
    try {
      setLoadingAccess(true);

      const [activeAccessResult, accessesResult] = await Promise.allSettled([
        fetch("/api/user/active-access", {
          cache: "no-store",
        }),
        fetch("/api/user/accesses", {
          cache: "no-store",
        }),
      ]);



      /* =====================================================
         PERFIL ATIVO
         ===================================================== */

      if (activeAccessResult.status === "fulfilled") {
        const activeAccessResponse = activeAccessResult.value;
        const activeAccessData = await activeAccessResponse.json();

        if (activeAccessResponse.ok) {
          setActiveAccess(activeAccessData?.activeAccess || null);
        } else {
          setActiveAccess(null);
        }
      } else {
        setActiveAccess(null);
      }



      /* =====================================================
         QUANTIDADE DE PERFIS DISPONÍVEIS
         ===================================================== */

      if (accessesResult.status === "fulfilled") {
        const accessesResponse = accessesResult.value;
        const accessesData = await accessesResponse.json();

        if (accessesResponse.ok) {
          setAccessCount(extractAccessCount(accessesData));
        } else {
          setAccessCount(0);
        }
      } else {
        setAccessCount(0);
      }
    } catch (err) {
      console.error(err);
      setActiveAccess(null);
      setAccessCount(0);
    } finally {
      setLoadingAccess(false);
    }
  }



  useEffect(() => {
    loadAccessData();
  }, []);



  const canSwitchProfile = accessCount > 1;



  /* =========================================================
     ITENS ADMINISTRATIVOS

     Exibidos apenas para SUPER_ADMIN e ADMINISTRADORA.
     ========================================================= */

  const adminItems = useMemo<NavItem[]>(() => {
    return [
      {
        key: "home",
        label: "Dashboard admin",
        href: "/admin/dashboard",
      },
      {
        key: "condominios",
        label: "Condomínios",
        href: "/admin/condominios",
      },
      {
        key: "unidades",
        label: "Unidades",
        href: "/admin/unidades",
      },
      {
        key: "moradores",
        label: "Moradores",
        href: "/admin/moradores",
      },
      {
        key: "usuarios",
        label: "Usuários",
        href: "/admin/usuarios",
      },
      {
        key: "fila",
        label: "Fila de chamados",
        href: "/admin/chamados",
        tone: "green",
      },
      {
        key: "chamados-dashboard",
        label: "Dashboard de chamados",
        href: "/admin/chamados/dashboard",
      },
      {
        key: "relatorios",
        label: "Relatórios",
        href: "/admin/chamados/relatorios",
      },
    ];
  }, []);



  /* =========================================================
     ITENS DO PORTAL

     Exibidos quando o perfil de acesso ativo não é administrativo.

     Importante:
     - "Trocar perfil" NÃO fica fixo aqui.
     - Ele só é renderizado separadamente se canSwitchProfile = true.
     ========================================================= */

  const portalItems = useMemo<NavItem[]>(() => {
    return [
      {
        key: "portal-dashboard",
        label: "Dashboard portal",
        href: "/portal/dashboard",
        tone: "green",
      },
      {
        key: "portal-chamados",
        label: "Meus chamados",
        href: "/portal/chamados",
      },
    ];
  }, []);



  /* =========================================================
     ESTADO DE CARREGAMENTO

     Enquanto carrega, mantemos apenas ações neutras.
     ========================================================= */

  if (loadingAccess) {
    return (
      <div className="flex flex-wrap gap-3 items-start">
        <div className="inline-flex h-12 items-center justify-center border border-gray-800 bg-[#111827] text-gray-400 px-6 rounded-xl text-sm font-bold">
          Preparando atalhos...
        </div>

        <NotificationBell fallbackHref="/contexto" />

        <LogoutButton />
      </div>
    );
  }



  /* =========================================================
     SEM PERFIL DE ACESSO ATIVO

     Neste caso o botão "Selecionar perfil" deve continuar aparecendo,
     mesmo que exista apenas um perfil disponível, pois o usuário ainda
     precisa definir o perfil ativo inicial.
     ========================================================= */

  if (!activeAccess) {
    return (
      <div className="flex flex-wrap gap-3 items-start">
        <Link
          href="/contexto"
          className="inline-flex h-12 items-center justify-center bg-yellow-700 hover:bg-yellow-600 px-6 rounded-xl font-bold"
        >
          Selecionar perfil
        </Link>

        <NotificationBell fallbackHref="/contexto" />

        <LogoutButton />
      </div>
    );
  }



  /* =========================================================
     PERFIL ADMINISTRATIVO

     SUPER_ADMIN / ADMINISTRADORA:
     Mostra menu administrativo completo.
     ========================================================= */

  if (isAdminRole(activeAccess.role)) {
    return (
      <div className="flex flex-wrap gap-3 items-start">
        {adminItems
          .filter((item) => item.key !== current)
          .map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={navButtonClass(item.tone || "default")}
            >
              {item.label}
            </Link>
          ))}

        {onNewTicket && (
          <button
            type="button"
            onClick={onNewTicket}
            className="inline-flex h-12 items-center justify-center bg-green-600 hover:bg-green-700 px-6 rounded-xl font-bold"
          >
            Novo chamado
          </button>
        )}

        {canSwitchProfile && <SwitchProfileButton />}

        <NotificationBell fallbackHref="/admin/dashboard" />

        <LogoutButton />
      </div>
    );
  }



  /* =========================================================
     PERFIL DE PORTAL

     SÍNDICO / MORADOR / PROPRIETÁRIO:
     Não exibimos menu administrativo amplo.
     Direcionamos para o portal correspondente.
     ========================================================= */

  if (isPortalRole(activeAccess.role)) {
    return (
      <div className="flex flex-wrap gap-3 items-start">
        {portalItems.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={navButtonClass(item.tone || "default")}
          >
            {item.label}
          </Link>
        ))}

        {canSwitchProfile && <SwitchProfileButton />}

        <NotificationBell fallbackHref="/portal/dashboard" />

        <LogoutButton />
      </div>
    );
  }



  /* =========================================================
     OUTROS PERFIS

     CONSELHEIRO ou outro perfil futuro:
     Por segurança, não mostra menu admin completo.

     "Trocar perfil" só aparece se houver mais de um perfil.
     ========================================================= */

  return (
    <div className="flex flex-wrap gap-3 items-start">
      {canSwitchProfile && <SwitchProfileButton />}

      <NotificationBell fallbackHref="/contexto" />

      <LogoutButton />
    </div>
  );
}