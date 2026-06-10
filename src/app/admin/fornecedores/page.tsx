"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import AdminShell from "@/components/AdminShell";
import ResponsiveSection from "@/components/ui/ResponsiveSection";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";



/* =========================================================
   FORNECEDORES - PÁGINA ADMINISTRATIVA

   Arquivo:
   src/app/admin/fornecedores/page.tsx

   ETAPA 46 — REDE DE FORNECEDORES ELOGEST

   Objetivo:
   - Listar fornecedores homologados pela administradora.
   - Cadastrar fornecedor global da Rede EloGest.
   - Criar automaticamente a homologação da administradora via API.
   - Editar dados principais e regras internas da homologação.
   - Preparar a base para vínculo futuro com condomínios, chamados,
     avaliações, contratos, documentos, leads e monetização.

   Regras consolidadas:
   - /admin é área operacional da ADMINISTRADORA.
   - SUPER_ADMIN não opera fornecedores por esta tela.
   - O isolamento por administradora é feito nas APIs.
   - Administradora INACTIVE é bloqueada por requireActiveAdminApiAccess().
   - Fornecedor é ativo global do EloGest, mas só aparece para a
     administradora quando há vínculo AdministratorProvider.
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

type ProviderOrigin =
  | "ELOGEST"
  | "ADMINISTRATOR"
  | "INDICATION"
  | "IMPORT"
  | "OTHER";

type AdministratorProviderStatus =
  | "IN_REVIEW"
  | "HOMOLOGATED"
  | "ACTIVE"
  | "SUSPENDED"
  | "BLOCKED"
  | "INACTIVE";



interface ApiErrorResponse {
  error?: string;
}



interface PlanLimitValue {
  currentUsage: number;
  limit: number | null;
  remaining: number | null;
  reached: boolean;
}



interface AdminPlanLimitResponse {
  error?: string;
  plan?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  nextPlan?: {
    id: string;
    name: string;
    slug: string;
    maxProviders?: number | null;
  } | null;
  limits?: {
    providers?: PlanLimitValue;
  };
}



interface ViaCepResponse {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}



interface HomologationInfo {
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
  homologatedByUser?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
  createdAt: string;
  updatedAt?: string | null;
}



interface ProviderListItem {
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
  createdByUserId?: string | null;

  homologation: HomologationInfo;

  totalCondominiumLinks: number;
  totalRatings: number;
  condominiumLinksInThisAdministrator: number;

  metadata?: unknown;
  createdAt: string;
  updatedAt?: string | null;
}



interface ProviderFormState {
  tradeName: string;
  legalName: string;
  document: string;
  entityType: ProviderEntityType;

  primaryCategory: string;
  categoriesText: string;
  description: string;
  serviceArea: string;

  email: string;
  phone: string;
  whatsapp: string;
  website: string;

  cep: string;
  address: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;

  globalStatus: ProviderGlobalStatus;
  visibility: ProviderVisibility;
  origin: ProviderOrigin;

  homologationStatus: AdministratorProviderStatus;
  internalName: string;
  internalCategory: string;
  notes: string;
  canBeUsedInTickets: boolean;
  visibleToSyndics: boolean;
  visibleToResidents: boolean;
}



const emptyForm: ProviderFormState = {
  tradeName: "",
  legalName: "",
  document: "",
  entityType: "COMPANY",

  primaryCategory: "",
  categoriesText: "",
  description: "",
  serviceArea: "",

  email: "",
  phone: "",
  whatsapp: "",
  website: "",

  cep: "",
  address: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "SP",

  globalStatus: "ACTIVE",
  visibility: "PRIVATE",
  origin: "ADMINISTRATOR",

  homologationStatus: "IN_REVIEW",
  internalName: "",
  internalCategory: "",
  notes: "",
  canBeUsedInTickets: true,
  visibleToSyndics: false,
  visibleToResidents: false,
};



/* =========================================================
   HELPERS GERAIS
   ========================================================= */

function onlyDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}



function normalizeSpaces(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}



function formatCpfCnpj(value: string) {
  const digits = onlyDigits(value).slice(0, 14);

  if (digits.length <= 11) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) {
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    }

    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(
      6,
      9
    )}-${digits.slice(9)}`;
  }

  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  }
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(
      5,
      8
    )}/${digits.slice(8)}`;
  }

  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(
    5,
    8
  )}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}



function formatCep(value: string) {
  const digits = onlyDigits(value).slice(0, 8);

  if (digits.length <= 5) {
    return digits;
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}



function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 2) {
    return digits ? `(${digits}` : "";
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}



function isValidEmail(email: string) {
  const value = email.trim();

  if (!value) return true;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}



function isValidWebsite(value: string) {
  const text = value.trim();

  if (!text) return true;

  return text.startsWith("http://") || text.startsWith("https://");
}



function getApiErrorMessage(data: unknown, fallback: string) {
  if (typeof data === "object" && data !== null && "error" in data) {
    const error = (data as ApiErrorResponse).error;

    if (error) {
      return error;
    }
  }

  return fallback;
}



function isViaCepResponse(data: unknown): data is ViaCepResponse {
  return typeof data === "object" && data !== null;
}



function entityTypeLabel(type?: string | null) {
  return (
    {
      COMPANY: "Empresa",
      INDIVIDUAL: "Autônomo",
      PROFESSIONAL: "Profissional liberal",
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
      IN_REVIEW: "Em análise",
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
      IN_REVIEW: "Em análise",
      HOMOLOGATED: "Homologado",
      ACTIVE: "Ativo na carteira",
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
      PRIVATE: "Privado da administradora",
      ELOGEST_NETWORK: "Rede EloGest",
      PUBLIC_FUTURE: "Público futuro",
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



function homologationStatusClass(status?: string | null) {
  if (status === "HOMOLOGATED" || status === "ACTIVE") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  if (status === "IN_REVIEW") {
    return "border-yellow-200 bg-yellow-50 text-yellow-800";
  }

  if (status === "BLOCKED" || status === "SUSPENDED") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]";
}



function visibilityClass(visibility?: string | null) {
  if (visibility === "ELOGEST_NETWORK") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  if (visibility === "PUBLIC_FUTURE") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  return "border-[#DDE5DF] bg-white text-[#5E6B63]";
}



function getSafeDate(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}



function formatDateTime(value?: string | null) {
  const date = getSafeDate(value);

  if (!date) return "-";

  return date.toLocaleString("pt-BR");
}



function formatLimitValue(value?: number | null) {
  if (value === null || value === undefined) {
    return "Ilimitado";
  }

  return new Intl.NumberFormat("pt-BR").format(value);
}



function getProviderLimitFromResponse(data: AdminPlanLimitResponse | null) {
  return data?.limits?.providers || null;
}



function getProviderDisplayName(provider: ProviderListItem) {
  return provider.homologation.internalName || provider.tradeName || "-";
}



function getProviderCategory(provider: ProviderListItem) {
  return provider.homologation.internalCategory || provider.primaryCategory || "-";
}



function getLocationLabel(provider: ProviderListItem) {
  const cityState = [provider.city, provider.state]
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .join(" / ");

  return cityState || provider.serviceArea || "-";
}



function getAddressLabel(provider: ProviderListItem) {
  const main = [provider.address, provider.number]
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .join(", ");

  const district = provider.district || "";

  const cityState = [provider.city, provider.state]
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .join(" / ");

  const lines = [main, district, cityState, provider.cep]
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .map((item) => item.trim());

  return lines.length > 0 ? lines.join(" • ") : "-";
}



function normalizeCategoriesText(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join(", ");
  }

  if (typeof value === "string") {
    return value;
  }

  return "";
}



function categoriesTextToArray(value: string) {
  return value
    .split(",")
    .map((item) => normalizeSpaces(item))
    .filter(Boolean);
}



function validateProviderForm(form: ProviderFormState) {
  if (!form.tradeName.trim()) {
    return "Informe o nome do fornecedor ou prestador.";
  }

  const documentDigits = onlyDigits(form.document);

  if (form.document && documentDigits.length !== 11 && documentDigits.length !== 14) {
    return "Informe um CPF ou CNPJ válido, ou deixe o documento em branco.";
  }

  if (form.email && !isValidEmail(form.email)) {
    return "Informe um e-mail válido.";
  }

  if (form.website && !isValidWebsite(form.website)) {
    return "Informe o site começando com http:// ou https://.";
  }

  if (form.cep && onlyDigits(form.cep).length !== 8) {
    return "Informe um CEP válido com 8 dígitos.";
  }

  if (form.state && form.state.trim().length !== 2) {
    return "Informe a UF com 2 letras. Exemplo: SP.";
  }

  return "";
}



function buildPayload(form: ProviderFormState) {
  return {
    tradeName: normalizeSpaces(form.tradeName),
    legalName: normalizeSpaces(form.legalName) || null,
    document: form.document ? formatCpfCnpj(form.document) : null,
    entityType: form.entityType,

    primaryCategory: normalizeSpaces(form.primaryCategory) || null,
    categories: categoriesTextToArray(form.categoriesText),
    description: form.description.trim() || null,
    serviceArea: normalizeSpaces(form.serviceArea) || null,

    email: normalizeSpaces(form.email) || null,
    phone: normalizeSpaces(form.phone) || null,
    whatsapp: normalizeSpaces(form.whatsapp) || null,
    website: normalizeSpaces(form.website) || null,

    cep: normalizeSpaces(form.cep) || null,
    address: normalizeSpaces(form.address) || null,
    number: normalizeSpaces(form.number) || null,
    complement: normalizeSpaces(form.complement) || null,
    district: normalizeSpaces(form.district) || null,
    city: normalizeSpaces(form.city) || null,
    state: form.state.trim().toUpperCase() || null,

    globalStatus: form.globalStatus,
    visibility: form.visibility,
    origin: form.origin,

    homologationStatus: form.homologationStatus,
    internalName: normalizeSpaces(form.internalName) || null,
    internalCategory: normalizeSpaces(form.internalCategory) || null,
    notes: form.notes.trim() || null,
    canBeUsedInTickets: form.canBeUsedInTickets,
    visibleToSyndics: form.visibleToSyndics,
    visibleToResidents: form.visibleToResidents,
  };
}



function buildEditForm(provider: ProviderListItem): ProviderFormState {
  return {
    tradeName: provider.tradeName || "",
    legalName: provider.legalName || "",
    document: provider.document || "",
    entityType:
      provider.entityType === "INDIVIDUAL" ||
      provider.entityType === "PROFESSIONAL" ||
      provider.entityType === "OTHER"
        ? provider.entityType
        : "COMPANY",

    primaryCategory: provider.primaryCategory || "",
    categoriesText: normalizeCategoriesText(provider.categories),
    description: provider.description || "",
    serviceArea: provider.serviceArea || "",

    email: provider.email || "",
    phone: provider.phone || "",
    whatsapp: provider.whatsapp || "",
    website: provider.website || "",

    cep: provider.cep || "",
    address: provider.address || "",
    number: provider.number || "",
    complement: provider.complement || "",
    district: provider.district || "",
    city: provider.city || "",
    state: provider.state || "SP",

    globalStatus:
      provider.globalStatus === "DRAFT" ||
      provider.globalStatus === "IN_REVIEW" ||
      provider.globalStatus === "SUSPENDED" ||
      provider.globalStatus === "BLOCKED" ||
      provider.globalStatus === "INACTIVE"
        ? provider.globalStatus
        : "ACTIVE",
    visibility:
      provider.visibility === "ELOGEST_NETWORK" || provider.visibility === "PUBLIC_FUTURE"
        ? provider.visibility
        : "PRIVATE",
    origin:
      provider.origin === "ELOGEST" ||
      provider.origin === "INDICATION" ||
      provider.origin === "IMPORT" ||
      provider.origin === "OTHER"
        ? provider.origin
        : "ADMINISTRATOR",

    homologationStatus:
      provider.homologation.status === "HOMOLOGATED" ||
      provider.homologation.status === "ACTIVE" ||
      provider.homologation.status === "SUSPENDED" ||
      provider.homologation.status === "BLOCKED" ||
      provider.homologation.status === "INACTIVE"
        ? provider.homologation.status
        : "IN_REVIEW",
    internalName: provider.homologation.internalName || "",
    internalCategory: provider.homologation.internalCategory || "",
    notes: provider.homologation.notes || "",
    canBeUsedInTickets: provider.homologation.canBeUsedInTickets,
    visibleToSyndics: provider.homologation.visibleToSyndics,
    visibleToResidents: provider.homologation.visibleToResidents,
  };
}



/* =========================================================
   PÁGINA
   ========================================================= */

export default function FornecedoresPage() {
  const [fornecedores, setFornecedores] = useState<ProviderListItem[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const [planLimitData, setPlanLimitData] = useState<AdminPlanLimitResponse | null>(null);
  const [checkingLimit, setCheckingLimit] = useState(false);

  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [selectedProvider, setSelectedProvider] = useState<ProviderListItem | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [visibilityFilter, setVisibilityFilter] = useState("ALL");
  const [ticketFilter, setTicketFilter] = useState("ALL");

  const [form, setForm] = useState<ProviderFormState>(emptyForm);
  const [editForm, setEditForm] = useState<ProviderFormState>(emptyForm);



  /* =========================================================
     MENSAGENS
     ========================================================= */

  const showSuccess = useCallback((message: string) => {
    setSuccess(message);
    setError("");

    window.setTimeout(() => {
      setSuccess("");
    }, 4500);
  }, []);



  const showError = useCallback((message: string) => {
    setError(message);
    setSuccess("");
  }, []);



  /* =========================================================
     CARREGAR FORNECEDORES
     ========================================================= */

  const loadFornecedores = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      try {
        if (showLoading) {
          setLoading(true);
        }

        setError("");

        const res = await fetch("/api/admin/fornecedores", {
          cache: "no-store",
        });

        const data: unknown = await res.json();

        if (!res.ok) {
          showError(getApiErrorMessage(data, "Erro ao carregar fornecedores."));
          setFornecedores([]);
          return;
        }

        if (!Array.isArray(data)) {
          showError("Resposta inválida da API.");
          setFornecedores([]);
          return;
        }

        setFornecedores(data as ProviderListItem[]);
      } catch (err) {
        console.error(err);
        showError("Erro ao carregar fornecedores.");
        setFornecedores([]);
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [showError]
  );



  /* =========================================================
     LIMITES DO PLANO
     ========================================================= */

  const loadPlanLimits = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/limites", {
        cache: "no-store",
      });

      const data = (await res.json()) as AdminPlanLimitResponse;

      if (!res.ok) {
        return null;
      }

      setPlanLimitData(data);

      return data;
    } catch (err) {
      console.error(err);
      return null;
    }
  }, []);



  async function openCreateModal() {
    if (checkingLimit) {
      return;
    }

    try {
      setCheckingLimit(true);
      setError("");
      setSuccess("");

      const data = await loadPlanLimits();
      const providerLimit = getProviderLimitFromResponse(data);

      if (providerLimit?.reached) {
        setLimitModalOpen(true);
        return;
      }

      setForm(emptyForm);
      setModalOpen(true);
    } finally {
      setCheckingLimit(false);
    }
  }



  /* =========================================================
     CRIAR FORNECEDOR
     ========================================================= */

  async function createFornecedor(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const validationMessage = validateProviderForm(form);

    if (validationMessage) {
      alert(validationMessage);
      return;
    }

    try {
      setCreating(true);

      const res = await fetch("/api/admin/fornecedores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload(form)),
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        const message = getApiErrorMessage(data, "Erro ao criar fornecedor.");

        if (
          message.toLowerCase().includes("limite de fornecedores") ||
          message.toLowerCase().includes("plano atual foi atingido")
        ) {
          await loadPlanLimits();
          setLimitModalOpen(true);
          return;
        }

        showError(message);
        return;
      }

      setForm(emptyForm);
      setModalOpen(false);

      await loadFornecedores({ showLoading: false });

      showSuccess("Fornecedor cadastrado e vinculado à carteira com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao criar fornecedor.");
    } finally {
      setCreating(false);
    }
  }



  /* =========================================================
     ABRIR / FECHAR MODAIS
     ========================================================= */

  function openEditModal(provider: ProviderListItem) {
    setSelectedProvider(provider);
    setEditForm(buildEditForm(provider));
    setEditModalOpen(true);
  }



  function closeCreateModal() {
    if (creating) return;

    setForm(emptyForm);
    setModalOpen(false);
  }



  function closeEditModal() {
    if (updating) return;

    setSelectedProvider(null);
    setEditForm(emptyForm);
    setEditModalOpen(false);
  }



  /* =========================================================
     ATUALIZAR FORNECEDOR
     ========================================================= */

  async function updateFornecedor(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedProvider) return;

    const validationMessage = validateProviderForm(editForm);

    if (validationMessage) {
      alert(validationMessage);
      return;
    }

    try {
      setUpdating(true);

      const res = await fetch(`/api/admin/fornecedores/${selectedProvider.providerId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload(editForm)),
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao atualizar fornecedor."));
        return;
      }

      setSelectedProvider(null);
      setEditModalOpen(false);
      setEditForm(emptyForm);

      await loadFornecedores({ showLoading: false });

      showSuccess("Fornecedor atualizado com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar fornecedor.");
    } finally {
      setUpdating(false);
    }
  }



  /* =========================================================
     ALTERAÇÃO RÁPIDA DE STATUS DA HOMOLOGAÇÃO
     ========================================================= */

  async function updateHomologationStatus(
    provider: ProviderListItem,
    nextStatus: AdministratorProviderStatus
  ) {
    const currentLabel = homologationStatusLabel(provider.homologation.status);
    const nextLabel = homologationStatusLabel(nextStatus);

    if (
      !confirm(
        `Deseja alterar o status de "${getProviderDisplayName(
          provider
        )}" de "${currentLabel}" para "${nextLabel}"?`
      )
    ) {
      return;
    }

    try {
      setUpdatingId(provider.providerId);

      const res = await fetch(`/api/admin/fornecedores/${provider.providerId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          homologationStatus: nextStatus,
        }),
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao atualizar status."));
        return;
      }

      await loadFornecedores({ showLoading: false });

      showSuccess("Status do fornecedor atualizado com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar status.");
    } finally {
      setUpdatingId(null);
    }
  }



  /* =========================================================
     INIT
     ========================================================= */

  useEffect(() => {
    let isMounted = true;

    fetch("/api/admin/fornecedores", {
      cache: "no-store",
    })
      .then(async (res) => {
        const data: unknown = await res.json();

        if (!isMounted) {
          return;
        }

        if (!res.ok) {
          showError(getApiErrorMessage(data, "Erro ao carregar fornecedores."));
          setFornecedores([]);
          return;
        }

        if (!Array.isArray(data)) {
          showError("Resposta inválida da API.");
          setFornecedores([]);
          return;
        }

        setFornecedores(data as ProviderListItem[]);
        void loadPlanLimits();
      })
      .catch((err: unknown) => {
        if (!isMounted) {
          return;
        }

        console.error(err);
        showError("Erro ao carregar fornecedores.");
        setFornecedores([]);
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [loadPlanLimits, showError]);



  /* =========================================================
     MÉTRICAS
     ========================================================= */

  const metrics = useMemo(() => {
    const homologated = fornecedores.filter(
      (item) => item.homologation.status === "HOMOLOGATED" || item.homologation.status === "ACTIVE"
    ).length;

    const inReview = fornecedores.filter(
      (item) => item.homologation.status === "IN_REVIEW"
    ).length;

    const blocked = fornecedores.filter(
      (item) => item.homologation.status === "BLOCKED" || item.homologation.status === "SUSPENDED"
    ).length;

    const network = fornecedores.filter(
      (item) => item.visibility === "ELOGEST_NETWORK"
    ).length;

    const usableInTickets = fornecedores.filter(
      (item) => item.homologation.canBeUsedInTickets
    ).length;

    const linkedCondominiums = fornecedores.reduce(
      (sum, item) => sum + Number(item.condominiumLinksInThisAdministrator || 0),
      0
    );

    return {
      total: fornecedores.length,
      homologated,
      inReview,
      blocked,
      network,
      usableInTickets,
      linkedCondominiums,
    };
  }, [fornecedores]);



  /* =========================================================
     FILTROS
     ========================================================= */

  const filteredFornecedores = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return fornecedores.filter((provider) => {
      if (statusFilter !== "ALL" && provider.homologation.status !== statusFilter) {
        return false;
      }

      if (visibilityFilter !== "ALL" && provider.visibility !== visibilityFilter) {
        return false;
      }

      if (ticketFilter === "YES" && !provider.homologation.canBeUsedInTickets) {
        return false;
      }

      if (ticketFilter === "NO" && provider.homologation.canBeUsedInTickets) {
        return false;
      }

      if (!term) {
        return true;
      }

      const searchable = [
        provider.tradeName,
        provider.legalName,
        provider.document,
        entityTypeLabel(provider.entityType),
        provider.primaryCategory,
        provider.homologation.internalName,
        provider.homologation.internalCategory,
        provider.description,
        provider.serviceArea,
        provider.email,
        provider.phone,
        provider.whatsapp,
        provider.website,
        provider.cep,
        provider.address,
        provider.district,
        provider.city,
        provider.state,
        provider.homologation.notes,
        globalStatusLabel(provider.globalStatus),
        homologationStatusLabel(provider.homologation.status),
        visibilityLabel(provider.visibility),
        originLabel(provider.origin),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(term);
    });
  }, [fornecedores, searchTerm, statusFilter, visibilityFilter, ticketFilter]);



  /* =========================================================
     CARREGAMENTO
     ========================================================= */

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando fornecedores..."
        description="Aguarde enquanto identificamos seu perfil de acesso e carregamos a rede de fornecedores da carteira administrativa."
      />
    );
  }



  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <AdminShell
      current="fornecedores"
      title="Fornecedores"
      description="Rede de fornecedores e prestadores homologados da administradora."
    >
      <div className="space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
              Rede de Fornecedores EloGest
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
              Fornecedores
            </h1>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
              Cadastre, homologue e organize fornecedores e prestadores que poderão atender a carteira da administradora. A base já fica preparada para busca interna, chamados, vínculos por condomínio, avaliações e futuras oportunidades comerciais da Rede EloGest.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void openCreateModal()}
            disabled={checkingLimit}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32] focus:outline-none focus:ring-4 focus:ring-[#256D3C]/20 disabled:cursor-not-allowed disabled:bg-[#9AA7A0]"
          >
            {checkingLimit ? "Verificando Plano..." : "Novo Fornecedor"}
          </button>
        </header>



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



        {limitModalOpen && (
          <PlanLimitModal
            data={planLimitData}
            resourceLabel="Fornecedores"
            onClose={() => setLimitModalOpen(false)}
          />
        )}



        {modalOpen && (
          <ProviderModal
            title="Novo Fornecedor"
            description="Cadastre um fornecedor na base global da Rede EloGest e vincule-o automaticamente à carteira desta administradora."
            form={form}
            setForm={setForm}
            submitting={creating}
            submitLabel="Criar Fornecedor"
            submittingLabel="Criando..."
            onClose={closeCreateModal}
            onSubmit={createFornecedor}
          />
        )}



        {editModalOpen && selectedProvider && (
          <ProviderModal
            title="Editar Fornecedor"
            description="Atualize os dados principais do fornecedor e as regras internas de homologação para esta administradora."
            form={editForm}
            setForm={setEditForm}
            submitting={updating}
            submitLabel="Salvar Alterações"
            submittingLabel="Salvando..."
            onClose={closeEditModal}
            onSubmit={updateFornecedor}
          />
        )}



        <section className="overflow-hidden rounded-[32px] border border-[#DDE5DF] bg-white shadow-sm">
          <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_62%,#EAF7EE_135%)] p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-[#17211B] md:text-3xl">
                  Visão da Rede
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                  Resumo dos fornecedores cadastrados, homologados, em análise, liberados para chamados e preparados para a Rede EloGest.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:min-w-[620px] xl:grid-cols-4">
                <PortfolioMetricBox
                  title="Total"
                  value={metrics.total}
                  description="Fornecedores vinculados."
                  highlighted
                />

                <PortfolioMetricBox
                  title="Homologados"
                  value={metrics.homologated}
                  description="Aprovados na carteira."
                  highlighted
                />

                <PortfolioMetricBox
                  title="Em análise"
                  value={metrics.inReview}
                  description="Aguardando validação."
                />

                <PortfolioMetricBox
                  title="Rede EloGest"
                  value={metrics.network}
                  description="Visibilidade estratégica."
                />
              </div>
            </div>
          </div>

          <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Uso operacional
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                <strong className="text-[#17211B]">{metrics.usableInTickets}</strong>{" "}
                fornecedor(es) liberado(s) para uso futuro em chamados.
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Vínculos com condomínios
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                <strong className="text-[#17211B]">{metrics.linkedCondominiums}</strong>{" "}
                vínculo(s) preparado(s) para atendimento por condomínio.
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Atenção da carteira
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                <strong className="text-[#17211B]">{metrics.blocked}</strong>{" "}
                fornecedor(es) suspenso(s) ou bloqueado(s).
              </p>
            </div>
          </div>
        </section>



        <ResponsiveSection
          title="Busca e Filtros"
          description="Localize fornecedores por nome, documento, categoria, contato, cidade, UF, status, visibilidade ou uso operacional."
          defaultOpenMobile
        >
          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
            <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr]">
              <div>
                <label className="text-sm font-semibold text-[#17211B]">
                  Buscar fornecedor
                </label>

                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="form-input mt-1"
                  placeholder="Buscar por nome, CNPJ/CPF, categoria, contato, cidade, UF..."
                />
              </div>

              <FilterSelect
                label="Status da Homologação"
                value={statusFilter}
                onChange={setStatusFilter}
              >
                <option value="ALL">Todos</option>
                <option value="IN_REVIEW">Em análise</option>
                <option value="HOMOLOGATED">Homologado</option>
                <option value="ACTIVE">Ativo na carteira</option>
                <option value="SUSPENDED">Suspenso</option>
                <option value="BLOCKED">Bloqueado</option>
                <option value="INACTIVE">Inativo</option>
              </FilterSelect>

              <FilterSelect
                label="Visibilidade"
                value={visibilityFilter}
                onChange={setVisibilityFilter}
              >
                <option value="ALL">Todas</option>
                <option value="PRIVATE">Privado</option>
                <option value="ELOGEST_NETWORK">Rede EloGest</option>
                <option value="PUBLIC_FUTURE">Público futuro</option>
              </FilterSelect>

              <FilterSelect
                label="Uso em Chamados"
                value={ticketFilter}
                onChange={setTicketFilter}
              >
                <option value="ALL">Todos</option>
                <option value="YES">Liberados</option>
                <option value="NO">Não liberados</option>
              </FilterSelect>
            </div>

            <p className="mt-3 text-sm text-[#5E6B63]">
              Exibindo{" "}
              <strong className="text-[#17211B]">{filteredFornecedores.length}</strong>{" "}
              de <strong className="text-[#17211B]">{fornecedores.length}</strong>{" "}
              fornecedor(es).
            </p>
          </section>
        </ResponsiveSection>



        {filteredFornecedores.length === 0 ? (
          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-8 text-center shadow-sm">
            <h2 className="mb-2 text-2xl font-semibold text-[#17211B]">
              Nenhum Fornecedor Encontrado
            </h2>

            <p className="mx-auto max-w-2xl text-sm leading-6 text-[#5E6B63]">
              Não encontramos fornecedores com a busca atual. Tente limpar os filtros ou cadastrar um novo fornecedor na carteira.
            </p>
          </section>
        ) : (
          <div className="space-y-3">
            {filteredFornecedores.map((provider) => (
              <article
                key={provider.providerId}
                className="rounded-[24px] border border-[#DDE5DF] bg-white p-5 shadow-sm transition hover:border-[#256D3C]/30 hover:shadow-[0_14px_38px_rgba(23,33,27,0.07)]"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${homologationStatusClass(
                          provider.homologation.status
                        )}`}
                      >
                        {homologationStatusLabel(provider.homologation.status)}
                      </span>

                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${visibilityClass(
                          provider.visibility
                        )}`}
                      >
                        {visibilityLabel(provider.visibility)}
                      </span>

                      <span className="rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-semibold text-[#5E6B63]">
                        {entityTypeLabel(provider.entityType)}
                      </span>

                      {provider.isVerified && (
                        <span className="rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                          Verificado EloGest
                        </span>
                      )}

                      {provider.isFeatured && (
                        <span className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-800">
                          Destaque
                        </span>
                      )}
                    </div>

                    <h2 className="break-words text-xl font-semibold tracking-tight text-[#17211B] md:text-2xl">
                      {getProviderDisplayName(provider)}
                    </h2>

                    {provider.homologation.internalName && provider.homologation.internalName !== provider.tradeName && (
                      <p className="mt-1 text-sm text-[#5E6B63]">
                        Cadastro Global: {provider.tradeName}
                      </p>
                    )}

                    {provider.legalName && (
                      <p className="mt-1 text-sm text-[#5E6B63]">
                        Razão Social: {provider.legalName}
                      </p>
                    )}

                    <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                      {getProviderCategory(provider)} • {getLocationLabel(provider)}
                    </p>

                    <p className="mt-2 text-xs text-[#7A877F]">
                      Documento: {provider.document || "-"} • Telefone: {provider.phone || "-"} • WhatsApp: {provider.whatsapp || "-"}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-start gap-2 xl:w-[190px] xl:flex-col">
                    <Link
                      href={`/admin/fornecedores/${provider.providerId}`}
                      className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#17211B] px-4 text-sm font-semibold text-white transition hover:bg-[#26382D]"
                    >
                      Detalhes
                    </Link>

                    <button
                      type="button"
                      onClick={() => openEditModal(provider)}
                      className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                    >
                      Editar
                    </button>

                    {provider.homologation.status === "IN_REVIEW" ? (
                      <button
                        type="button"
                        onClick={() => updateHomologationStatus(provider, "HOMOLOGATED")}
                        disabled={updatingId === provider.providerId}
                        className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                      >
                        {updatingId === provider.providerId ? "Atualizando..." : "Homologar"}
                      </button>
                    ) : provider.homologation.status === "BLOCKED" ? (
                      <button
                        type="button"
                        onClick={() => updateHomologationStatus(provider, "IN_REVIEW")}
                        disabled={updatingId === provider.providerId}
                        className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                      >
                        {updatingId === provider.providerId ? "Atualizando..." : "Revisar"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateHomologationStatus(provider, "BLOCKED")}
                        disabled={updatingId === provider.providerId}
                        className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                      >
                        {updatingId === provider.providerId ? "Atualizando..." : "Bloquear"}
                      </button>
                    )}
                  </div>
                </div>

                <details className="group mt-4 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#17211B]">
                    <span>Mais Informações</span>
                    <span className="text-[#7A877F] transition group-open:rotate-180">▾</span>
                  </summary>

                  <div className="border-t border-[#DDE5DF] p-4">
                    <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-4">
                      <InfoLine label="Status Global" value={globalStatusLabel(provider.globalStatus)} />
                      <InfoLine label="Origem" value={originLabel(provider.origin)} />
                      <InfoLine label="E-mail" value={provider.email || "-"} />
                      <InfoLine label="Site" value={provider.website || "-"} />
                      <InfoLine label="Endereço" value={getAddressLabel(provider)} wide />
                      <InfoLine label="Área de Atendimento" value={provider.serviceArea || "-"} />
                      <InfoLine
                        label="Uso em Chamados"
                        value={provider.homologation.canBeUsedInTickets ? "Liberado" : "Não liberado"}
                      />
                      <InfoLine
                        label="Visível Para Síndicos"
                        value={provider.homologation.visibleToSyndics ? "Sim" : "Não"}
                      />
                      <InfoLine
                        label="Visível Para Moradores"
                        value={provider.homologation.visibleToResidents ? "Sim" : "Não"}
                      />
                      <InfoLine
                        label="Condomínios Vinculados"
                        value={provider.condominiumLinksInThisAdministrator}
                      />
                      <InfoLine label="Avaliações" value={provider.totalRatings} />
                      <InfoLine label="Criado Em" value={formatDateTime(provider.createdAt)} />
                    </div>

                    {(provider.description || provider.homologation.notes) && (
                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        {provider.description && (
                          <div className="rounded-2xl border border-[#DDE5DF] bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                              Descrição do Fornecedor
                            </p>

                            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#5E6B63]">
                              {provider.description}
                            </p>
                          </div>
                        )}

                        {provider.homologation.notes && (
                          <div className="rounded-2xl border border-[#DDE5DF] bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                              Observações Internas
                            </p>

                            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#5E6B63]">
                              {provider.homologation.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </details>
              </article>
            ))}
          </div>
        )}
      </div>

      <style jsx global>{`
        .form-input {
          width: 100%;
          border-radius: 1rem;
          border: 1px solid #dde5df;
          background: #f9fbfa;
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

        details > summary::-webkit-details-marker {
          display: none;
        }
      `}</style>
    </AdminShell>
  );
}



/* =========================================================
   MODAL DE LIMITE DO PLANO
   ========================================================= */

function PlanLimitModal({
  data,
  resourceLabel,
  onClose,
}: {
  data: AdminPlanLimitResponse | null;
  resourceLabel: string;
  onClose: () => void;
}) {
  const providerLimit = getProviderLimitFromResponse(data);
  const planName = data?.plan?.name || "Plano Atual";
  const nextPlanName = data?.nextPlan?.name || "Plano Superior";
  const currentUsage = providerLimit?.currentUsage ?? 0;
  const limit = providerLimit?.limit ?? null;
  const nextLimit = data?.nextPlan?.maxProviders ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#17211B]/50 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[32px] border border-[#DDE5DF] bg-white shadow-2xl">
        <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_65%,#EAF7EE_135%)] p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
                Plano e limites
              </p>

              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">
                Limite do plano atingido
              </h2>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                Você atingiu o limite de {resourceLabel.toLowerCase()} do plano atual.
                Para continuar cadastrando, altere para um plano superior.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-lg font-semibold text-[#5E6B63] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
        </div>

        <div className="space-y-5 p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                Plano Atual
              </p>
              <p className="mt-2 text-lg font-semibold text-[#17211B]">
                {planName}
              </p>
            </div>

            <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-yellow-800">
                Uso Atual
              </p>
              <p className="mt-2 text-lg font-semibold text-yellow-900">
                {formatLimitValue(currentUsage)} de {formatLimitValue(limit)}
              </p>
            </div>

            <div className="rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#256D3C]">
                Upgrade Sugerido
              </p>
              <p className="mt-2 text-lg font-semibold text-[#17211B]">
                {nextPlanName}
              </p>
            </div>
          </div>

          <div className="rounded-[24px] border border-[#DDE5DF] bg-white p-5">
            <h3 className="text-base font-semibold text-[#17211B]">
              Continue crescendo com a EloGest
            </h3>

            <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
              O upgrade online será conectado na etapa de Cobrança e Assinatura.
              Por enquanto, esta mensagem já deixa o caminho comercial preparado
              para liberar mais recursos sem interromper a operação.
            </p>

            {data?.nextPlan && (
              <p className="mt-3 rounded-2xl border border-[#CFE6D4] bg-[#F7FBF8] px-4 py-3 text-sm font-semibold text-[#256D3C]">
                No plano {nextPlanName}, o limite de fornecedores passa para{" "}
                {formatLimitValue(nextLimit)}.
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
            >
              Entendi
            </button>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32]"
            >
              Ver Planos Disponíveis
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



/* =========================================================
   MODAL REUTILIZÁVEL
   ========================================================= */

function ProviderModal({
  title,
  description,
  form,
  setForm,
  submitting,
  submitLabel,
  submittingLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  form: ProviderFormState;
  setForm: Dispatch<SetStateAction<ProviderFormState>>;
  submitting: boolean;
  submitLabel: string;
  submittingLabel: string;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const [cepLoading, setCepLoading] = useState(false);
  const [cepMessage, setCepMessage] = useState("");



  async function lookupCep() {
    const cepDigits = onlyDigits(form.cep);

    if (!cepDigits) {
      setCepMessage("");
      return;
    }

    if (cepDigits.length !== 8) {
      setCepMessage("Informe um CEP com 8 dígitos para buscar o endereço.");
      return;
    }

    try {
      setCepLoading(true);
      setCepMessage("");

      const res = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
      const data: unknown = await res.json();

      if (!res.ok || !isViaCepResponse(data) || data.erro) {
        setCepMessage("CEP não encontrado. Confira o número ou preencha o endereço manualmente.");
        return;
      }

      setForm((prev) => ({
        ...prev,
        cep: formatCep(data.cep || cepDigits),
        address: data.logradouro || prev.address,
        complement: prev.complement || data.complemento || "",
        district: data.bairro || prev.district,
        city: data.localidade || prev.city,
        state: (data.uf || prev.state || "SP").toUpperCase().slice(0, 2),
      }));

      setCepMessage("Endereço preenchido automaticamente pelo CEP.");
    } catch (err) {
      console.error(err);
      setCepMessage("Não foi possível consultar o CEP agora. Preencha o endereço manualmente.");
    } finally {
      setCepLoading(false);
    }
  }



  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#17211B]/45 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-[32px] border border-[#DDE5DF] bg-white shadow-2xl">
        <div className="flex flex-col gap-4 border-b border-[#DDE5DF] p-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
              Rede de Fornecedores EloGest
            </p>

            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">
              {title}
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
              {description}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-lg font-semibold text-[#5E6B63] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-6 p-6">
          <FormSection
            title="Dados principais"
            description="Informações que identificam o fornecedor na base global da plataforma."
          >
            <FormGrid>
              <TextField
                label="Nome Fantasia / Nome do Prestador"
                value={form.tradeName}
                onChange={(value) => setForm((prev) => ({ ...prev, tradeName: value }))}
                required
                placeholder="Exemplo: Alfa Manutenção Predial"
              />

              <TextField
                label="Razão Social"
                value={form.legalName}
                onChange={(value) => setForm((prev) => ({ ...prev, legalName: value }))}
                placeholder="Opcional"
              />

              <TextField
                label="CPF/CNPJ"
                value={form.document}
                onChange={(value) => setForm((prev) => ({ ...prev, document: formatCpfCnpj(value) }))}
                placeholder="Opcional"
              />

              <SelectField
                label="Tipo"
                value={form.entityType}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, entityType: value as ProviderEntityType }))
                }
              >
                <option value="COMPANY">Empresa</option>
                <option value="INDIVIDUAL">Autônomo</option>
                <option value="PROFESSIONAL">Profissional liberal</option>
                <option value="OTHER">Outro</option>
              </SelectField>
            </FormGrid>
          </FormSection>

          <FormSection
            title="Categoria e atuação"
            description="Classifique o serviço para facilitar busca, chamados e vínculos futuros com condomínios."
          >
            <FormGrid>
              <TextField
                label="Categoria Principal"
                value={form.primaryCategory}
                onChange={(value) => setForm((prev) => ({ ...prev, primaryCategory: value }))}
                placeholder="Exemplo: Elétrica, hidráulica, limpeza, segurança..."
              />

              <TextField
                label="Categorias Adicionais"
                value={form.categoriesText}
                onChange={(value) => setForm((prev) => ({ ...prev, categoriesText: value }))}
                placeholder="Separar por vírgula"
              />

              <TextField
                label="Área de Atendimento"
                value={form.serviceArea}
                onChange={(value) => setForm((prev) => ({ ...prev, serviceArea: value }))}
                placeholder="Exemplo: São Paulo e Grande ABC"
              />

              <TextField
                label="Categoria Interna da Administradora"
                value={form.internalCategory}
                onChange={(value) => setForm((prev) => ({ ...prev, internalCategory: value }))}
                placeholder="Opcional"
              />
            </FormGrid>

            <TextAreaField
              label="Descrição do Fornecedor"
              value={form.description}
              onChange={(value) => setForm((prev) => ({ ...prev, description: value }))}
              placeholder="Descreva especialidades, diferenciais, tipos de serviço e observações relevantes."
            />
          </FormSection>

          <FormSection
            title="Contato"
            description="Canais de atendimento do fornecedor ou prestador."
          >
            <FormGrid>
              <TextField
                label="E-mail"
                value={form.email}
                onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
                placeholder="contato@empresa.com.br"
              />

              <TextField
                label="Telefone"
                value={form.phone}
                onChange={(value) => setForm((prev) => ({ ...prev, phone: formatPhone(value) }))}
                placeholder="(11) 0000-0000"
              />

              <TextField
                label="WhatsApp"
                value={form.whatsapp}
                onChange={(value) => setForm((prev) => ({ ...prev, whatsapp: formatPhone(value) }))}
                placeholder="(11) 90000-0000"
              />

              <TextField
                label="Site"
                value={form.website}
                onChange={(value) => setForm((prev) => ({ ...prev, website: value }))}
                placeholder="https://..."
              />
            </FormGrid>
          </FormSection>

          <FormSection
            title="Endereço"
            description="Localização principal para referência e busca regional."
          >
            <FormGrid>
              <div>
                <TextField
                  label="CEP"
                  value={form.cep}
                  onChange={(value) => {
                    setCepMessage("");
                    setForm((prev) => ({ ...prev, cep: formatCep(value) }));
                  }}
                  onBlur={() => void lookupCep()}
                  placeholder="00000-000"
                />

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void lookupCep()}
                    disabled={cepLoading || onlyDigits(form.cep).length !== 8}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-[#DDE5DF] bg-white px-3 text-xs font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {cepLoading ? "Buscando..." : "Buscar CEP"}
                  </button>

                  {cepMessage && (
                    <span className="text-xs font-medium text-[#5E6B63]">
                      {cepMessage}
                    </span>
                  )}
                </div>
              </div>

              <TextField
                label="Endereço"
                value={form.address}
                onChange={(value) => setForm((prev) => ({ ...prev, address: value }))}
                placeholder="Rua, avenida..."
              />

              <TextField
                label="Número"
                value={form.number}
                onChange={(value) => setForm((prev) => ({ ...prev, number: value }))}
                placeholder="Número"
              />

              <TextField
                label="Complemento"
                value={form.complement}
                onChange={(value) => setForm((prev) => ({ ...prev, complement: value }))}
                placeholder="Opcional"
              />

              <TextField
                label="Bairro"
                value={form.district}
                onChange={(value) => setForm((prev) => ({ ...prev, district: value }))}
                placeholder="Bairro"
              />

              <TextField
                label="Cidade"
                value={form.city}
                onChange={(value) => setForm((prev) => ({ ...prev, city: value }))}
                placeholder="Cidade"
              />

              <TextField
                label="UF"
                value={form.state}
                onChange={(value) => setForm((prev) => ({ ...prev, state: value.toUpperCase().slice(0, 2) }))}
                placeholder="SP"
              />
            </FormGrid>
          </FormSection>

          <FormSection
            title="Homologação e visibilidade"
            description="Defina como este fornecedor será usado dentro da carteira da administradora."
          >
            <FormGrid>
              <SelectField
                label="Status da Homologação"
                value={form.homologationStatus}
                onChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    homologationStatus: value as AdministratorProviderStatus,
                  }))
                }
              >
                <option value="IN_REVIEW">Em análise</option>
                <option value="HOMOLOGATED">Homologado</option>
                <option value="ACTIVE">Ativo na carteira</option>
                <option value="SUSPENDED">Suspenso</option>
                <option value="BLOCKED">Bloqueado</option>
                <option value="INACTIVE">Inativo</option>
              </SelectField>

              <SelectField
                label="Status Global"
                value={form.globalStatus}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, globalStatus: value as ProviderGlobalStatus }))
                }
              >
                <option value="ACTIVE">Ativo</option>
                <option value="IN_REVIEW">Em análise</option>
                <option value="DRAFT">Rascunho</option>
                <option value="SUSPENDED">Suspenso</option>
                <option value="BLOCKED">Bloqueado</option>
                <option value="INACTIVE">Inativo</option>
              </SelectField>

              <SelectField
                label="Visibilidade"
                value={form.visibility}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, visibility: value as ProviderVisibility }))
                }
              >
                <option value="PRIVATE">Privado da administradora</option>
                <option value="ELOGEST_NETWORK">Rede EloGest</option>
                <option value="PUBLIC_FUTURE">Público futuro</option>
              </SelectField>

              <SelectField
                label="Origem"
                value={form.origin}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, origin: value as ProviderOrigin }))
                }
              >
                <option value="ADMINISTRATOR">Administradora</option>
                <option value="ELOGEST">EloGest</option>
                <option value="INDICATION">Indicação</option>
                <option value="IMPORT">Importação</option>
                <option value="OTHER">Outro</option>
              </SelectField>

              <TextField
                label="Nome Interno"
                value={form.internalName}
                onChange={(value) => setForm((prev) => ({ ...prev, internalName: value }))}
                placeholder="Apelido ou nome usado pela administradora"
              />
            </FormGrid>

            <div className="grid gap-3 md:grid-cols-3">
              <CheckboxField
                label="Liberar Para Chamados"
                description="Permite uso futuro como prestador em chamados."
                checked={form.canBeUsedInTickets}
                onChange={(checked) =>
                  setForm((prev) => ({ ...prev, canBeUsedInTickets: checked }))
                }
              />

              <CheckboxField
                label="Visível Para Síndicos"
                description="Preparação para consulta no portal do síndico."
                checked={form.visibleToSyndics}
                onChange={(checked) =>
                  setForm((prev) => ({ ...prev, visibleToSyndics: checked }))
                }
              />

              <CheckboxField
                label="Visível Para Moradores"
                description="Preparação futura para busca pelo morador."
                checked={form.visibleToResidents}
                onChange={(checked) =>
                  setForm((prev) => ({ ...prev, visibleToResidents: checked }))
                }
              />
            </div>

            <TextAreaField
              label="Observações Internas da Homologação"
              value={form.notes}
              onChange={(value) => setForm((prev) => ({ ...prev, notes: value }))}
              placeholder="Inclua observações de homologação, restrições, recomendações ou histórico interno."
            />
          </FormSection>

          <div className="flex flex-col-reverse gap-3 border-t border-[#DDE5DF] pt-6 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-60"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
            >
              {submitting ? submittingLabel : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}



/* =========================================================
   COMPONENTES DE UI
   ========================================================= */

function PortfolioMetricBox({
  title,
  value,
  description,
  highlighted = false,
}: {
  title: string;
  value: ReactNode;
  description: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={
        highlighted
          ? "rounded-3xl border border-[#CFE6D4] bg-white p-4 shadow-sm"
          : "rounded-3xl border border-[#DDE5DF] bg-white/80 p-4"
      }
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
        {title}
      </p>

      <p className="mt-2 text-2xl font-semibold text-[#17211B]">{value}</p>

      <p className="mt-1 text-xs leading-5 text-[#5E6B63]">{description}</p>
    </div>
  );
}



function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-[#17211B]">{label}</label>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="form-input mt-1"
      >
        {children}
      </select>
    </div>
  );
}



function InfoLine({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-medium text-[#17211B]">
        {value}
      </p>
    </div>
  );
}



function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-[#DDE5DF] bg-[#F9FBFA] p-5">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-[#17211B]">{title}</h3>

        <p className="mt-1 text-sm leading-6 text-[#5E6B63]">{description}</p>
      </div>

      <div className="space-y-4">{children}</div>
    </section>
  );
}



function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}



function TextField({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[#17211B]">
        {label}
        {required ? " *" : ""}
      </span>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="form-input mt-1"
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}



function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[#17211B]">{label}</span>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="form-input mt-1 min-h-[110px] resize-y"
        placeholder={placeholder}
      />
    </label>
  );
}



function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[#17211B]">{label}</span>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="form-input mt-1"
      >
        {children}
      </select>
    </label>
  );
}



function CheckboxField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-2xl border border-[#DDE5DF] bg-white p-4 transition hover:border-[#256D3C]/40">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-[#256D3C]"
      />

      <span>
        <span className="block text-sm font-semibold text-[#17211B]">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-[#5E6B63]">{description}</span>
      </span>
    </label>
  );
}
