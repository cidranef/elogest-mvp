"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import AdminShell from "@/components/AdminShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";



/* =========================================================
   DETALHE DO FORNECEDOR - ADMIN

   Arquivo:
   src/app/admin/fornecedores/[id]/page.tsx

   ETAPA 46 — REDE DE FORNECEDORES ELOGEST

   Objetivo:
   - Exibir visão completa do fornecedor/prestador homologado.
   - Consumir /api/admin/fornecedores/[id].
   - Respeitar escopo da administradora pela API.
   - Preparar a tela para vínculos com condomínios, chamados,
     avaliações, documentos e monetização futura da Rede EloGest.

   Observação:
   - A edição completa continua disponível na listagem principal,
     via modal em /admin/fornecedores.
   - Esta página foca em consulta operacional e ações rápidas seguras.
   ========================================================= */



/* =========================================================
   TYPES
   ========================================================= */

type ProviderEntityType = "COMPANY" | "INDIVIDUAL" | "PROFESSIONAL" | "OTHER";

type ProviderGlobalStatus =
  | "DRAFT"
  | "ACTIVE"
  | "IN_REVIEW"
  | "SUSPENDED"
  | "BLOCKED"
  | "INACTIVE";

type ProviderVisibility = "PRIVATE" | "ELOGEST_NETWORK" | "PUBLIC_FUTURE";

type ProviderOrigin = "ELOGEST" | "ADMINISTRATOR" | "INDICATION" | "IMPORT" | "OTHER";

type AdministratorProviderStatus =
  | "IN_REVIEW"
  | "HOMOLOGATED"
  | "ACTIVE"
  | "SUSPENDED"
  | "BLOCKED"
  | "INACTIVE";

type CondominiumProviderStatus = "ACTIVE" | "SUSPENDED" | "ENDED" | "INACTIVE";

type CondominiumProviderLinkType =
  | "CONTRACT"
  | "RECURRING"
  | "ON_DEMAND"
  | "INDICATED"
  | "PREFERRED"
  | "OTHER";



interface ApiErrorResponse {
  error?: string;
}



interface SimpleUser {
  id: string;
  name?: string | null;
  email?: string | null;
}



interface SimpleAdministrator {
  id: string;
  name: string;
}



interface LinkedCondominium {
  id: string;
  name: string;
  status: string;
  city?: string | null;
  state?: string | null;
}



interface AvailableCondominium {
  id: string;
  name: string;
  status: string;
  city?: string | null;
  state?: string | null;
  alreadyLinked?: boolean;
}



interface CondominiumLinksResponse {
  availableCondominiums: AvailableCondominium[];
  condominiumProviders: CondominiumProviderLink[];
  totals: {
    condominiums: number;
    links: number;
    activeLinks: number;
    preferredLinks: number;
  };
}



interface LinkFormState {
  condominiumId: string;
  category: string;
  linkType: CondominiumProviderLinkType;
  status: CondominiumProviderStatus;
  isPreferred: boolean;
  startDate: string;
  endDate: string;
  notes: string;
}



interface CondominiumProviderLink {
  id: string;
  administratorId: string;
  condominiumId: string;
  providerId: string;
  administratorProviderId?: string | null;
  status: string;
  linkType?: string | null;
  category?: string | null;
  isPreferred?: boolean | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  condominium?: LinkedCondominium | null;
  createdAt: string;
  updatedAt?: string | null;
}



interface ProviderHomologation {
  id: string;
  administratorId: string;
  status: AdministratorProviderStatus | string;
  internalName?: string | null;
  internalCategory?: string | null;
  notes?: string | null;
  canBeUsedInTickets: boolean;
  visibleToSyndics: boolean;
  visibleToResidents: boolean;
  homologatedAt?: string | null;
  homologatedByUserId?: string | null;
  homologatedByUser?: SimpleUser | null;
  metadata?: unknown;
  createdAt: string;
  updatedAt?: string | null;
}



interface ProviderDetail {
  id: string;
  providerId: string;
  administratorProviderId: string;

  tradeName: string;
  legalName?: string | null;
  document?: string | null;
  documentNormalized?: string | null;
  entityType: ProviderEntityType | string;

  primaryCategory?: string | null;
  categories?: unknown;
  description?: string | null;
  serviceArea?: string | null;

  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  website?: string | null;

  cep?: string | null;
  address?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;

  globalStatus: ProviderGlobalStatus | string;
  visibility: ProviderVisibility | string;
  isVerified: boolean;
  isFeatured: boolean;
  origin: ProviderOrigin | string;

  createdByAdministratorId?: string | null;
  createdByAdministrator?: SimpleAdministrator | null;
  createdByUserId?: string | null;
  createdByUser?: SimpleUser | null;

  homologation: ProviderHomologation;
  condominiumProviders: CondominiumProviderLink[];

  totalCondominiumLinks: number;
  totalRatings: number;
  condominiumLinksInThisAdministrator: number;

  metadata?: unknown;
  createdAt: string;
  updatedAt?: string | null;
}



const emptyLinkForm: LinkFormState = {
  condominiumId: "",
  category: "",
  linkType: "ON_DEMAND",
  status: "ACTIVE",
  isPreferred: false,
  startDate: "",
  endDate: "",
  notes: "",
};



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



function formatBoolean(value: boolean) {
  return value ? "Sim" : "Não";
}



function entityTypeLabel(type?: string | null) {
  return (
    {
      COMPANY: "Empresa",
      INDIVIDUAL: "Pessoa Física",
      PROFESSIONAL: "Profissional",
      OTHER: "Outro",
    }[type || ""] ||
    type ||
    "-"
  );
}



function globalStatusLabel(status?: string | null) {
  return (
    {
      DRAFT: "Rascunho",
      ACTIVE: "Ativo",
      IN_REVIEW: "Em Análise",
      SUSPENDED: "Suspenso",
      BLOCKED: "Bloqueado",
      INACTIVE: "Inativo",
    }[status || ""] ||
    status ||
    "-"
  );
}



function homologationStatusLabel(status?: string | null) {
  return (
    {
      IN_REVIEW: "Em Análise",
      HOMOLOGATED: "Homologado",
      ACTIVE: "Ativo",
      SUSPENDED: "Suspenso",
      BLOCKED: "Bloqueado",
      INACTIVE: "Inativo",
    }[status || ""] ||
    status ||
    "-"
  );
}



function visibilityLabel(visibility?: string | null) {
  return (
    {
      PRIVATE: "Privado Da Administradora",
      ELOGEST_NETWORK: "Rede EloGest",
      PUBLIC_FUTURE: "Público Futuro",
    }[visibility || ""] ||
    visibility ||
    "-"
  );
}



function originLabel(origin?: string | null) {
  return (
    {
      ELOGEST: "EloGest",
      ADMINISTRATOR: "Administradora",
      INDICATION: "Indicação",
      IMPORT: "Importação",
      OTHER: "Outro",
    }[origin || ""] ||
    origin ||
    "-"
  );
}



function condominiumProviderStatusLabel(status?: string | null) {
  return (
    {
      ACTIVE: "Ativo",
      SUSPENDED: "Suspenso",
      ENDED: "Encerrado",
      INACTIVE: "Inativo",
    }[status || ""] ||
    status ||
    "-"
  );
}



function condominiumProviderLinkTypeLabel(linkType?: string | null) {
  return (
    {
      CONTRACT: "Contrato",
      RECURRING: "Recorrente",
      ON_DEMAND: "Sob Demanda",
      INDICATED: "Indicado",
      PREFERRED: "Preferencial",
      OTHER: "Outro",
    }[linkType || ""] ||
    linkType ||
    "-"
  );
}



function providerStatusClass(status?: string | null) {
  if (status === "ACTIVE" || status === "HOMOLOGATED") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  if (status === "IN_REVIEW" || status === "DRAFT") {
    return "border-yellow-200 bg-yellow-50 text-yellow-800";
  }

  if (status === "BLOCKED" || status === "SUSPENDED") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]";
}



function getFullAddress(provider: ProviderDetail) {
  const main = [provider.address, provider.number]
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .join(", ");

  const district = provider.district || "";

  const cityState = [provider.city, provider.state]
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .join(" / ");

  const lines = [main, provider.complement, district, cityState, provider.cep]
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .map((item) => item.trim());

  return lines.length > 0 ? lines.join(" • ") : "-";
}



function getPrimaryContact(provider: ProviderDetail) {
  const contacts = [provider.email, provider.phone, provider.whatsapp].filter(
    (item): item is string => typeof item === "string" && item.trim() !== ""
  );

  return contacts.length > 0 ? contacts.join(" • ") : "-";
}



function isProviderDetail(data: unknown): data is ProviderDetail {
  return (
    typeof data === "object" &&
    data !== null &&
    "id" in data &&
    "tradeName" in data &&
    "homologation" in data
  );
}



function isCondominiumLinksResponse(
  data: unknown
): data is CondominiumLinksResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    "availableCondominiums" in data &&
    "condominiumProviders" in data &&
    Array.isArray((data as CondominiumLinksResponse).availableCondominiums) &&
    Array.isArray((data as CondominiumLinksResponse).condominiumProviders)
  );
}



function getCategoryList(provider: ProviderDetail) {
  const categories = provider.categories;

  if (Array.isArray(categories)) {
    return categories
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join(", ");
  }

  if (typeof categories === "string") {
    return categories;
  }

  return provider.primaryCategory || "-";
}



/* =========================================================
   PÁGINA
   ========================================================= */

export default function FornecedorDetailPage() {
  const params = useParams<{ id?: string }>();
  const router = useRouter();

  const providerId = params?.id || "";

  const [fornecedor, setFornecedor] = useState<ProviderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingAction, setSavingAction] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [availableCondominiums, setAvailableCondominiums] = useState<
    AvailableCondominium[]
  >([]);
  const [loadingCondominiums, setLoadingCondominiums] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [linkForm, setLinkForm] = useState<LinkFormState>(emptyLinkForm);



  /* =========================================================
     CARREGAR FORNECEDOR
     ========================================================= */

  const loadFornecedor = useCallback(
    async ({
      showLoading = true,
      showSuccessMessage = false,
    }: {
      showLoading?: boolean;
      showSuccessMessage?: boolean;
    } = {}) => {
      if (!providerId) {
        setError("ID do fornecedor não informado.");
        setFornecedor(null);
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

        const res = await fetch(`/api/admin/fornecedores/${providerId}`, {
          cache: "no-store",
        });

        const data: unknown = await res.json();

        if (!res.ok) {
          setError(getApiErrorMessage(data, "Erro ao carregar fornecedor."));
          setFornecedor(null);
          return;
        }

        if (!isProviderDetail(data)) {
          setError("Resposta inválida da API.");
          setFornecedor(null);
          return;
        }

        setFornecedor(data);

        if (showSuccessMessage) {
          setSuccess("Dados atualizados com sucesso.");

          window.setTimeout(() => {
            setSuccess("");
          }, 3500);
        }
      } catch (err) {
        console.error(err);
        setError("Erro ao carregar fornecedor.");
        setFornecedor(null);
      } finally {
        if (showLoading) {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [providerId]
  );



  /* =========================================================
     CARREGAR CONDOMÍNIOS DISPONÍVEIS PARA VÍNCULO
     ========================================================= */

  const loadCondominiumOptions = useCallback(async () => {
    if (!providerId) {
      return;
    }

    try {
      setLoadingCondominiums(true);

      const res = await fetch(
        `/api/admin/fornecedores/${providerId}/condominios`,
        {
          cache: "no-store",
        }
      );

      const data: unknown = await res.json();

      if (!res.ok) {
        setError(
          getApiErrorMessage(data, "Erro ao carregar condomínios disponíveis.")
        );
        setAvailableCondominiums([]);
        return;
      }

      if (!isCondominiumLinksResponse(data)) {
        setError("Resposta inválida da API de vínculos.");
        setAvailableCondominiums([]);
        return;
      }

      setAvailableCondominiums(data.availableCondominiums);
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar condomínios disponíveis.");
      setAvailableCondominiums([]);
    } finally {
      setLoadingCondominiums(false);
    }
  }, [providerId]);



  /* =========================================================
     AÇÕES RÁPIDAS
     ========================================================= */

  const updateFornecedor = useCallback(
    async (payload: Record<string, unknown>, successMessage: string) => {
      if (!providerId) {
        return;
      }

      try {
        setSavingAction(true);
        setError("");
        setSuccess("");

        const res = await fetch(`/api/admin/fornecedores/${providerId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const data: unknown = await res.json();

        if (!res.ok) {
          setError(getApiErrorMessage(data, "Erro ao atualizar fornecedor."));
          return;
        }

        if (!isProviderDetail(data)) {
          setError("Fornecedor atualizado, mas a resposta da API foi inválida.");
          return;
        }

        setFornecedor(data);
        setSuccess(successMessage);

        window.setTimeout(() => {
          setSuccess("");
        }, 3500);
      } catch (err) {
        console.error(err);
        setError("Erro ao atualizar fornecedor.");
      } finally {
        setSavingAction(false);
      }
    },
    [providerId]
  );



  function homologarFornecedor() {
    void updateFornecedor(
      {
        homologationStatus: "HOMOLOGATED",
        canBeUsedInTickets: true,
      },
      "Fornecedor homologado com sucesso."
    );
  }



  function bloquearFornecedor() {
    const confirmed = window.confirm(
      "Deseja bloquear este fornecedor na carteira da administradora?"
    );

    if (!confirmed) {
      return;
    }

    void updateFornecedor(
      {
        homologationStatus: "BLOCKED",
        canBeUsedInTickets: false,
        visibleToSyndics: false,
        visibleToResidents: false,
      },
      "Fornecedor bloqueado na carteira."
    );
  }



  function liberarParaChamados() {
    void updateFornecedor(
      {
        canBeUsedInTickets: true,
      },
      "Fornecedor liberado para uso em chamados."
    );
  }



  function removerUsoEmChamados() {
    void updateFornecedor(
      {
        canBeUsedInTickets: false,
      },
      "Fornecedor removido do uso em chamados."
    );
  }



  /* =========================================================
     VINCULAR / ATUALIZAR / DESVINCULAR CONDOMÍNIOS
     ========================================================= */

  const reloadAfterLinkChange = useCallback(
    async (message: string) => {
      await loadFornecedor({ showLoading: false });
      await loadCondominiumOptions();

      setSuccess(message);

      window.setTimeout(() => {
        setSuccess("");
      }, 3500);
    },
    [loadFornecedor, loadCondominiumOptions]
  );



  async function linkCondominium() {
    if (!providerId) {
      return;
    }

    if (!linkForm.condominiumId) {
      window.alert("Selecione um condomínio para vincular.");
      return;
    }

    try {
      setSavingLink(true);
      setError("");
      setSuccess("");

      const res = await fetch(
        `/api/admin/fornecedores/${providerId}/condominios`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            condominiumId: linkForm.condominiumId,
            category: linkForm.category.trim() || null,
            linkType: linkForm.linkType,
            status: linkForm.status,
            isPreferred: linkForm.isPreferred,
            startDate: linkForm.startDate || null,
            endDate: linkForm.endDate || null,
            notes: linkForm.notes.trim() || null,
          }),
        }
      );

      const data: unknown = await res.json();

      if (!res.ok) {
        setError(
          getApiErrorMessage(data, "Erro ao vincular fornecedor ao condomínio.")
        );
        return;
      }

      setLinkForm(emptyLinkForm);
      await reloadAfterLinkChange("Condomínio vinculado ao fornecedor.");
    } catch (err) {
      console.error(err);
      setError("Erro ao vincular fornecedor ao condomínio.");
    } finally {
      setSavingLink(false);
    }
  }



  async function setPreferredLink(link: CondominiumProviderLink) {
    if (!providerId) {
      return;
    }

    try {
      setSavingLink(true);
      setError("");
      setSuccess("");

      const res = await fetch(
        `/api/admin/fornecedores/${providerId}/condominios`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            linkId: link.id,
            isPreferred: true,
            status: "ACTIVE",
          }),
        }
      );

      const data: unknown = await res.json();

      if (!res.ok) {
        setError(
          getApiErrorMessage(data, "Erro ao marcar fornecedor como preferencial.")
        );
        return;
      }

      await reloadAfterLinkChange("Fornecedor marcado como preferencial.");
    } catch (err) {
      console.error(err);
      setError("Erro ao marcar fornecedor como preferencial.");
    } finally {
      setSavingLink(false);
    }
  }



  async function unlinkCondominium(link: CondominiumProviderLink) {
    if (!providerId) {
      return;
    }

    const confirmed = window.confirm(
      `Deseja desvincular o fornecedor do condomínio ${
        link.condominium?.name || "selecionado"
      }?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setSavingLink(true);
      setError("");
      setSuccess("");

      const res = await fetch(
        `/api/admin/fornecedores/${providerId}/condominios?linkId=${encodeURIComponent(
          link.id
        )}`,
        {
          method: "DELETE",
        }
      );

      const data: unknown = await res.json();

      if (!res.ok) {
        setError(
          getApiErrorMessage(data, "Erro ao desvincular fornecedor do condomínio.")
        );
        return;
      }

      await reloadAfterLinkChange("Fornecedor desvinculado do condomínio.");
    } catch (err) {
      console.error(err);
      setError("Erro ao desvincular fornecedor do condomínio.");
    } finally {
      setSavingLink(false);
    }
  }



  /* =========================================================
     INIT
     ========================================================= */

  useEffect(() => {
    let isMounted = true;

    Promise.resolve()
      .then(async () => {
        if (!providerId) {
          if (!isMounted) {
            return;
          }

          setError("ID do fornecedor não informado.");
          setFornecedor(null);
          setLoading(false);
          return;
        }

        const res = await fetch(`/api/admin/fornecedores/${providerId}`, {
          cache: "no-store",
        });

        const data: unknown = await res.json();

        if (!isMounted) {
          return;
        }

        if (!res.ok) {
          setError(getApiErrorMessage(data, "Erro ao carregar fornecedor."));
          setFornecedor(null);
          return;
        }

        if (!isProviderDetail(data)) {
          setError("Resposta inválida da API.");
          setFornecedor(null);
          return;
        }

        setFornecedor(data);
      })
      .catch((err: unknown) => {
        if (!isMounted) {
          return;
        }

        console.error(err);
        setError("Erro ao carregar fornecedor.");
        setFornecedor(null);
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [providerId]);



  useEffect(() => {
    let isMounted = true;

    Promise.resolve()
      .then(async () => {
        if (!isMounted) {
          return;
        }

        await loadCondominiumOptions();
      })
      .catch((err: unknown) => {
        console.error(err);
      });

    return () => {
      isMounted = false;
    };
  }, [loadCondominiumOptions]);



  /* =========================================================
     MÉTRICAS
     ========================================================= */

  const activeCondominiumLinks = useMemo(() => {
    if (!fornecedor) {
      return [];
    }

    return fornecedor.condominiumProviders.filter(
      (link) => link.status === "ACTIVE"
    );
  }, [fornecedor]);



  const inactiveCondominiumLinks = useMemo(() => {
    if (!fornecedor) {
      return [];
    }

    return fornecedor.condominiumProviders.filter(
      (link) => link.status !== "ACTIVE"
    );
  }, [fornecedor]);



  const metrics = useMemo(() => {
    if (!fornecedor) {
      return {
        linkedCondominiums: 0,
        historicalLinks: 0,
        ratings: 0,
        canBeUsedInTickets: "-",
        visibility: "-",
      };
    }

    return {
      linkedCondominiums: activeCondominiumLinks.length,
      historicalLinks: inactiveCondominiumLinks.length,
      ratings: Number(fornecedor.totalRatings || 0),
      canBeUsedInTickets: formatBoolean(
        fornecedor.homologation.canBeUsedInTickets
      ),
      visibility: visibilityLabel(fornecedor.visibility),
    };
  }, [fornecedor, activeCondominiumLinks, inactiveCondominiumLinks]);



  /* =========================================================
     CARREGAMENTO
     ========================================================= */

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando fornecedor..."
        description="Aguarde enquanto carregamos os dados completos do fornecedor selecionado."
      />
    );
  }



  /* =========================================================
     ERRO / NÃO ENCONTRADO
     ========================================================= */

  if (error || !fornecedor) {
    return (
      <AdminShell
        current="fornecedores"
        title="Fornecedor"
        description="Detalhe do fornecedor da carteira administrativa."
      >
        <div className="space-y-6">
          <button
            type="button"
            onClick={() => router.push("/admin/fornecedores")}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
          >
            ← Voltar Para Fornecedores
          </button>

          <section className="rounded-[32px] border border-red-200 bg-red-50 p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-red-800">
              Não Foi Possível Abrir Este Fornecedor
            </h1>

            <p className="mt-2 text-sm leading-6 text-red-700">
              {error || "Fornecedor não encontrado."}
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
      current="fornecedores"
      title={fornecedor.tradeName}
      description="Detalhe do fornecedor da carteira administrativa."
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/admin/fornecedores"
            className="inline-flex h-11 w-fit items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
          >
            ← Voltar Para Fornecedores
          </Link>

          <button
            type="button"
            onClick={() =>
              void loadFornecedor({
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

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}



        {/* =====================================================
            HERO
            ===================================================== */}

        <section className="overflow-hidden rounded-[36px] border border-[#DDE5DF] bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="relative min-h-[320px] overflow-hidden bg-[linear-gradient(135deg,#17211B_0%,#26382D_58%,#256D3C_130%)] p-6 text-white lg:p-8">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(142,208,142,0.30),transparent_42%)]" />

              <div className="relative flex h-full flex-col justify-between gap-8">
                <div>
                  <div className="mb-5 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${providerStatusClass(
                        fornecedor.homologation.status
                      )}`}
                    >
                      {homologationStatusLabel(fornecedor.homologation.status)}
                    </span>

                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                      {visibilityLabel(fornecedor.visibility)}
                    </span>

                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                      {entityTypeLabel(fornecedor.entityType)}
                    </span>

                    {fornecedor.isVerified && (
                      <span className="rounded-full border border-[#8ED08E]/35 bg-[#8ED08E]/15 px-3 py-1 text-xs font-semibold text-[#EAF7EE]">
                        Verificado Pelo EloGest
                      </span>
                    )}

                    {fornecedor.isFeatured && (
                      <span className="rounded-full border border-yellow-200/35 bg-yellow-100/15 px-3 py-1 text-xs font-semibold text-yellow-50">
                        Destaque Comercial
                      </span>
                    )}
                  </div>

                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8ED08E]">
                    Rede De Fornecedores EloGest
                  </p>

                  <h1 className="mt-3 break-words text-3xl font-semibold tracking-tight md:text-4xl">
                    {fornecedor.tradeName}
                  </h1>

                  {fornecedor.legalName && (
                    <p className="mt-3 text-sm leading-6 text-white/75">
                      Razão Social: {fornecedor.legalName}
                    </p>
                  )}

                  <p className="mt-4 text-sm leading-6 text-white/72">
                    {fornecedor.description ||
                      "Fornecedor cadastrado na base EloGest, preparado para homologação, vínculos operacionais e uso futuro em chamados e contratos."}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <HeaderMiniMetric
                    label="Categoria Principal"
                    value={fornecedor.primaryCategory || "-"}
                  />

                  <HeaderMiniMetric
                    label="Uso Em Chamados"
                    value={metrics.canBeUsedInTickets}
                  />

                  <HeaderMiniMetric
                    label="Condomínios"
                    value={metrics.linkedCondominiums}
                  />

                  <HeaderMiniMetric
                    label="Avaliações"
                    value={metrics.ratings}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-6 p-6 lg:p-8">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-[#17211B]">
                  Resumo Operacional
                </h2>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  Visão rápida de contato, localização, homologação e preparação
                  para a rede de serviços da plataforma.
                </p>

                <div className="mt-6 space-y-4">
                  <InfoLine label="Contato Principal" value={getPrimaryContact(fornecedor)} />
                  <InfoLine label="Documento" value={fornecedor.document || "-"} />
                  <InfoLine label="Localização" value={getFullAddress(fornecedor)} />
                  <InfoLine label="Área De Atendimento" value={fornecedor.serviceArea || "-"} />
                </div>
              </div>

              <div className="rounded-[28px] border border-[#DDE5DF] bg-[#F9FBFA] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Homologação
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  Status Da Homologação: {" "}
                  <strong className="text-[#17211B]">
                    {homologationStatusLabel(fornecedor.homologation.status)}
                  </strong>
                </p>

                <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                  Homologado Em: {" "}
                  <strong className="text-[#17211B]">
                    {formatDate(fornecedor.homologation.homologatedAt)}
                  </strong>
                </p>
              </div>
            </div>
          </div>
        </section>



        {/* =====================================================
            KPIS
            ===================================================== */}

        <section className="grid gap-4 md:grid-cols-4">
          <MetricCard
            title="Condomínios Vinculados"
            value={metrics.linkedCondominiums}
            description="Vínculos deste fornecedor na carteira atual."
            tone="green"
          />

          <MetricCard
            title="Uso Em Chamados"
            value={metrics.canBeUsedInTickets}
            description="Indica se pode ser usado em rotinas operacionais."
          />

          <MetricCard
            title="Visibilidade"
            value={metrics.visibility}
            description="Define o alcance futuro dentro da plataforma."
          />

          <MetricCard
            title="Avaliações"
            value={metrics.ratings}
            description="Base preparada para reputação do prestador."
          />
        </section>



        {/* =====================================================
            AÇÕES RÁPIDAS
            ===================================================== */}

        <section className="rounded-[32px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[#17211B]">
                Ações Rápidas
              </h2>

              <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                Ajustes operacionais seguros para homologação e uso do fornecedor
                dentro da carteira da administradora.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={homologarFornecedor}
                disabled={savingAction}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:cursor-not-allowed disabled:bg-[#9AA7A0]"
              >
                {savingAction ? "Salvando..." : "Homologar"}
              </button>

              {fornecedor.homologation.canBeUsedInTickets ? (
                <button
                  type="button"
                  onClick={removerUsoEmChamados}
                  disabled={savingAction}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                >
                  Remover De Chamados
                </button>
              ) : (
                <button
                  type="button"
                  onClick={liberarParaChamados}
                  disabled={savingAction}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-60"
                >
                  Liberar Para Chamados
                </button>
              )}

              <button
                type="button"
                onClick={bloquearFornecedor}
                disabled={savingAction}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
              >
                Bloquear
              </button>
            </div>
          </div>
        </section>



        {/* =====================================================
            DETALHES
            ===================================================== */}

        <section className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
          <DetailCard
            title="Dados Cadastrais"
            description="Informações principais de identificação do fornecedor."
          >
            <InfoGrid>
              <InfoItem label="Nome Fantasia" value={fornecedor.tradeName} />
              <InfoItem label="Razão Social" value={fornecedor.legalName || "-"} />
              <InfoItem label="Documento" value={fornecedor.document || "-"} />
              <InfoItem label="Tipo" value={entityTypeLabel(fornecedor.entityType)} />
              <InfoItem label="Origem" value={originLabel(fornecedor.origin)} />
              <InfoItem label="Status Global" value={globalStatusLabel(fornecedor.globalStatus)} />
              <InfoItem label="Criado Em" value={formatDateTime(fornecedor.createdAt)} />
              <InfoItem label="Atualizado Em" value={formatDateTime(fornecedor.updatedAt)} />
            </InfoGrid>
          </DetailCard>

          <DetailCard
            title="Contato"
            description="Canais principais para comunicação com o fornecedor."
          >
            <InfoGrid>
              <InfoItem label="E-Mail" value={fornecedor.email || "-"} />
              <InfoItem label="Telefone" value={fornecedor.phone || "-"} />
              <InfoItem label="WhatsApp" value={fornecedor.whatsapp || "-"} />
              <InfoItem label="Site" value={fornecedor.website || "-"} />
            </InfoGrid>
          </DetailCard>

          <DetailCard
            title="Endereço"
            description="Localização e área de atendimento do fornecedor."
          >
            <InfoGrid>
              <InfoItem label="CEP" value={fornecedor.cep || "-"} />
              <InfoItem label="Endereço" value={fornecedor.address || "-"} />
              <InfoItem label="Número" value={fornecedor.number || "-"} />
              <InfoItem label="Complemento" value={fornecedor.complement || "-"} />
              <InfoItem label="Bairro" value={fornecedor.district || "-"} />
              <InfoItem
                label="Cidade / UF"
                value={`${fornecedor.city || "-"} / ${fornecedor.state || "-"}`}
              />
              <InfoItem label="Área De Atendimento" value={fornecedor.serviceArea || "-"} />
            </InfoGrid>
          </DetailCard>

          <DetailCard
            title="Categorias E Rede EloGest"
            description="Classificação e preparação do fornecedor para busca interna e monetização futura."
          >
            <InfoGrid>
              <InfoItem label="Categoria Principal" value={fornecedor.primaryCategory || "-"} />
              <InfoItem label="Categorias" value={getCategoryList(fornecedor)} />
              <InfoItem label="Visibilidade" value={visibilityLabel(fornecedor.visibility)} />
              <InfoItem label="Fornecedor Verificado" value={formatBoolean(fornecedor.isVerified)} />
              <InfoItem label="Fornecedor Em Destaque" value={formatBoolean(fornecedor.isFeatured)} />
              <InfoItem label="Avaliações" value={fornecedor.totalRatings} />
            </InfoGrid>
          </DetailCard>

          <DetailCard
            title="Homologação Da Administradora"
            description="Regras internas da carteira administrativa para este fornecedor."
          >
            <InfoGrid>
              <InfoItem
                label="Status Da Homologação"
                value={homologationStatusLabel(fornecedor.homologation.status)}
              />
              <InfoItem
                label="Nome Interno"
                value={fornecedor.homologation.internalName || "-"}
              />
              <InfoItem
                label="Categoria Interna"
                value={fornecedor.homologation.internalCategory || "-"}
              />
              <InfoItem
                label="Uso Em Chamados"
                value={formatBoolean(fornecedor.homologation.canBeUsedInTickets)}
              />
              <InfoItem
                label="Visível Para Síndicos"
                value={formatBoolean(fornecedor.homologation.visibleToSyndics)}
              />
              <InfoItem
                label="Visível Para Moradores"
                value={formatBoolean(fornecedor.homologation.visibleToResidents)}
              />
              <InfoItem
                label="Homologado Em"
                value={formatDateTime(fornecedor.homologation.homologatedAt)}
              />
              <InfoItem
                label="Homologado Por"
                value={fornecedor.homologation.homologatedByUser?.name || "-"}
              />
            </InfoGrid>

            {fornecedor.homologation.notes && (
              <div className="mt-5 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                  Observações Internas
                </p>

                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#5E6B63]">
                  {fornecedor.homologation.notes}
                </p>
              </div>
            )}
          </DetailCard>

          <DetailCard
            title="Origem Do Cadastro"
            description="Rastreabilidade de criação do fornecedor na base global EloGest."
          >
            <InfoGrid>
              <InfoItem
                label="Administradora De Origem"
                value={fornecedor.createdByAdministrator?.name || "-"}
              />
              <InfoItem
                label="Usuário Criador"
                value={fornecedor.createdByUser?.name || "-"}
              />
              <InfoItem
                label="E-Mail Do Criador"
                value={fornecedor.createdByUser?.email || "-"}
              />
              <InfoItem label="Origem" value={originLabel(fornecedor.origin)} />
            </InfoGrid>
          </DetailCard>
        </section>



        {/* =====================================================
            CONDOMÍNIOS VINCULADOS
            ===================================================== */}

        <section className="rounded-[32px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-[#17211B]">
                Condomínios Vinculados
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                Defina quais condomínios utilizam este fornecedor, qual categoria
                ele atende e se deve ser tratado como prestador preferencial.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 text-sm font-semibold text-[#256D3C]">
                {activeCondominiumLinks.length} ativo(s)
              </span>

              {inactiveCondominiumLinks.length > 0 && (
                <span className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#5E6B63]">
                  {inactiveCondominiumLinks.length} histórico(s)
                </span>
              )}
            </div>
          </div>

          <CondominiumLinkForm
            form={linkForm}
            setForm={setLinkForm}
            availableCondominiums={availableCondominiums}
            loading={loadingCondominiums}
            saving={savingLink}
            defaultCategory={fornecedor.primaryCategory || ""}
            onSubmit={linkCondominium}
          />

          {activeCondominiumLinks.length === 0 ? (
            <div className="mt-5 rounded-[24px] border border-dashed border-[#CFE6D4] bg-[#F9FBFA] p-6 text-center">
              <h3 className="text-lg font-semibold text-[#17211B]">
                Nenhum Condomínio Vinculado Ativamente
              </h3>

              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[#5E6B63]">
                O fornecedor está homologado na carteira, mas não possui vínculo
                ativo com condomínio neste momento. Vínculos encerrados ou
                inativos ficam preservados no histórico operacional.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {activeCondominiumLinks.map((link) => (
                <article
                  key={link.id}
                  className="rounded-[24px] border border-[#DDE5DF] bg-[#F9FBFA] p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${providerStatusClass(
                        link.status
                      )}`}
                    >
                      {condominiumProviderStatusLabel(link.status)}
                    </span>

                    {link.isPreferred && (
                      <span className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-800">
                        Preferencial
                      </span>
                    )}
                  </div>

                  <h3 className="mt-3 text-lg font-semibold text-[#17211B]">
                    {link.condominium?.name || "Condomínio"}
                  </h3>

                  <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                    Categoria: {link.category || "-"} • Tipo De Vínculo:{" "}
                    {condominiumProviderLinkTypeLabel(link.linkType)}
                  </p>

                  <p className="mt-2 text-xs text-[#7A877F]">
                    Início: {formatDate(link.startDate)} • Fim:{" "}
                    {formatDate(link.endDate)}
                  </p>

                  {link.notes && (
                    <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#5E6B63]">
                      {link.notes}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {!link.isPreferred && (
                      <button
                        type="button"
                        onClick={() => void setPreferredLink(link)}
                        disabled={savingLink}
                        className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-xs font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-60"
                      >
                        Tornar Preferencial
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void unlinkCondominium(link)}
                      disabled={savingLink}
                      className="inline-flex h-10 items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-4 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                    >
                      Desvincular
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {inactiveCondominiumLinks.length > 0 && (
            <details className="group mt-5 rounded-[24px] border border-[#DDE5DF] bg-[#F9FBFA]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-[#17211B]">
                <span>Histórico De Vínculos</span>
                <span className="text-[#7A877F] transition group-open:rotate-180">
                  ▾
                </span>
              </summary>

              <div className="border-t border-[#DDE5DF] p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  {inactiveCondominiumLinks.map((link) => (
                    <article
                      key={link.id}
                      className="rounded-[20px] border border-[#DDE5DF] bg-white p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${providerStatusClass(
                            link.status
                          )}`}
                        >
                          {condominiumProviderStatusLabel(link.status)}
                        </span>

                        {link.isPreferred && (
                          <span className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-800">
                            Preferencial
                          </span>
                        )}
                      </div>

                      <h3 className="mt-3 text-base font-semibold text-[#17211B]">
                        {link.condominium?.name || "Condomínio"}
                      </h3>

                      <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                        Categoria: {link.category || "-"} • Tipo De Vínculo:{" "}
                        {condominiumProviderLinkTypeLabel(link.linkType)}
                      </p>

                      <p className="mt-2 text-xs text-[#7A877F]">
                        Início: {formatDate(link.startDate)} • Fim:{" "}
                        {formatDate(link.endDate)}
                      </p>

                      {link.notes && (
                        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#5E6B63]">
                          {link.notes}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            </details>
          )}
        </section>
      </div>

      <style jsx global>{`
        .form-input {
          width: 100%;
          border-radius: 1rem;
          border: 1px solid #dde5df;
          background: #ffffff;
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          color: #17211b;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease,
            background-color 0.15s ease;
        }

        .form-input:focus {
          border-color: #256d3c;
          background: #ffffff;
          box-shadow: 0 0 0 4px rgba(37, 109, 60, 0.1);
        }

        .form-input::placeholder {
          color: #9aa7a0;
        }
      `}</style>
    </AdminShell>
  );
}



/* =========================================================
   COMPONENTES VISUAIS
   ========================================================= */

function CondominiumLinkForm({
  form,
  setForm,
  availableCondominiums,
  loading,
  saving,
  defaultCategory,
  onSubmit,
}: {
  form: LinkFormState;
  setForm: Dispatch<SetStateAction<LinkFormState>>;
  availableCondominiums: AvailableCondominium[];
  loading: boolean;
  saving: boolean;
  defaultCategory: string;
  onSubmit: () => void;
}) {
  const selectableCondominiums = availableCondominiums.filter(
    (condominium) => !condominium.alreadyLinked
  );

  return (
    <div className="mt-6 rounded-[28px] border border-[#DDE5DF] bg-[#F9FBFA] p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[#17211B]">
            Vincular Condomínio
          </h3>

          <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
            Escolha um condomínio da carteira e defina como este fornecedor será
            usado na operação.
          </p>
        </div>

        {loading && (
          <span className="rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-semibold text-[#5E6B63]">
            Carregando Condomínios...
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <FormBlock label="Condomínio">
          <select
            value={form.condominiumId}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                condominiumId: event.target.value,
              }))
            }
            className="form-input"
            disabled={saving || loading}
          >
            <option value="">Selecione...</option>
            {selectableCondominiums.map((condominium) => (
              <option key={condominium.id} value={condominium.id}>
                {condominium.name}
                {condominium.city || condominium.state
                  ? ` - ${[condominium.city, condominium.state].filter(Boolean).join(" / ")}`
                  : ""}
              </option>
            ))}
          </select>
        </FormBlock>

        <FormBlock label="Categoria Atendida">
          <input
            value={form.category}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                category: event.target.value,
              }))
            }
            className="form-input"
            placeholder={defaultCategory || "Ex.: Elétrica"}
            disabled={saving}
          />
        </FormBlock>

        <FormBlock label="Tipo De Vínculo">
          <select
            value={form.linkType}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                linkType: event.target.value as CondominiumProviderLinkType,
              }))
            }
            className="form-input"
            disabled={saving}
          >
            <option value="ON_DEMAND">Sob Demanda</option>
            <option value="CONTRACT">Contrato</option>
            <option value="RECURRING">Recorrente</option>
            <option value="INDICATED">Indicado</option>
            <option value="PREFERRED">Preferencial</option>
            <option value="OTHER">Outro</option>
          </select>
        </FormBlock>

        <FormBlock label="Status Do Vínculo">
          <select
            value={form.status}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                status: event.target.value as CondominiumProviderStatus,
              }))
            }
            className="form-input"
            disabled={saving}
          >
            <option value="ACTIVE">Ativo</option>
            <option value="SUSPENDED">Suspenso</option>
            <option value="ENDED">Encerrado</option>
            <option value="INACTIVE">Inativo</option>
          </select>
        </FormBlock>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_2fr]">
        <FormBlock label="Início Do Vínculo">
          <input
            type="date"
            value={form.startDate}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                startDate: event.target.value,
              }))
            }
            className="form-input"
            disabled={saving}
          />
        </FormBlock>

        <FormBlock label="Fim Do Vínculo">
          <input
            type="date"
            value={form.endDate}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                endDate: event.target.value,
              }))
            }
            className="form-input"
            disabled={saving}
          />
        </FormBlock>

        <FormBlock label="Observações Internas">
          <input
            value={form.notes}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                notes: event.target.value,
              }))
            }
            className="form-input"
            placeholder="Ex.: fornecedor padrão para manutenção preventiva."
            disabled={saving}
          />
        </FormBlock>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="inline-flex items-center gap-3 text-sm font-semibold text-[#17211B]">
          <input
            type="checkbox"
            checked={form.isPreferred}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                isPreferred: event.target.checked,
              }))
            }
            className="h-4 w-4 rounded border-[#DDE5DF] text-[#256D3C]"
            disabled={saving}
          />
          Marcar Como Fornecedor Preferencial Nesta Categoria
        </label>

        <button
          type="button"
          onClick={onSubmit}
          disabled={saving || loading || !form.condominiumId}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:cursor-not-allowed disabled:bg-[#9AA7A0]"
        >
          {saving ? "Vinculando..." : "Vincular Condomínio"}
        </button>
      </div>

      {!loading && selectableCondominiums.length === 0 && (
        <p className="mt-3 text-sm leading-6 text-[#5E6B63]">
          Todos os condomínios ativos da carteira já possuem vínculo com este
          fornecedor ou ainda não há condomínios cadastrados.
        </p>
      )}
    </div>
  );
}



function FormBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
        {label}
      </span>

      <div className="mt-1">{children}</div>
    </label>
  );
}



function HeaderMiniMetric({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
        {label}
      </p>

      <p className="mt-2 break-words text-lg font-semibold text-white">
        {value}
      </p>
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
  value: ReactNode;
  description: string;
  tone?: "default" | "green" | "yellow";
}) {
  const toneClass =
    tone === "green"
      ? "border-[#CFE6D4] bg-[#EAF7EE]"
      : tone === "yellow"
        ? "border-yellow-200 bg-yellow-50"
        : "border-[#DDE5DF] bg-white";

  return (
    <article className={`rounded-[28px] border p-5 shadow-sm ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
        {title}
      </p>

      <p className="mt-3 break-words text-2xl font-semibold tracking-tight text-[#17211B]">
        {value}
      </p>

      <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
        {description}
      </p>
    </article>
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
      <h2 className="text-2xl font-semibold tracking-tight text-[#17211B]">
        {title}
      </h2>

      <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
        {description}
      </p>

      <div className="mt-5">{children}</div>
    </section>
  );
}



function InfoGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}



function InfoItem({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
        {label}
      </p>

      <p className="mt-2 break-words text-sm font-semibold leading-6 text-[#17211B]">
        {value}
      </p>
    </div>
  );
}



function InfoLine({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-semibold leading-6 text-[#17211B]">
        {value}
      </p>
    </div>
  );
}
