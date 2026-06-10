"use client";

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
import { useRouter, useSearchParams } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import ResponsiveSection from "@/components/ui/ResponsiveSection";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";



/* =========================================================
   MORADORES - PÁGINA ADMINISTRATIVA

   ETAPA 15.3:
   - Listagem de moradores
   - Busca
   - Filtro por condomínio
   - Filtro por unidade
   - KPIs
   - Cadastro via modal

   ETAPA 15.5.3:
   - Edição de morador
   - Ativar / inativar morador

   ETAPA 15.6.5:
   - Botão rápido:
     Morador sem usuário  -> Criar acesso
     Morador com usuário  -> Editar acesso

   ETAPA 35.3:
   Refinamento do cadastro base de moradores.

   ETAPA 39.9 — NOVO VISUAL COM ADMINSHELL

   ETAPA 39.17.10 — PADRONIZAÇÃO DO CARREGAMENTO

   ETAPA 41 — REFINAMENTO PREMIUM DOS CADASTROS

   ETAPA 45.4 — FILTRO AUTOMÁTICO POR CONDOMÍNIO

   ETAPA 51.5.3 — SANEAMENTO CADASTRAL DE VÍNCULOS
   - Cadastro passa a manter vínculo formal com a unidade.
   - Adicionados tipo de vínculo, direito a voto, chamados,
     comunicados e vínculo principal.
   - Resident continua preservado para compatibilidade.
   - UnitPersonLink passa a ser a fonte formal para assembleias.

   ETAPA 45.6 — PAGINAÇÃO SERVER-SIDE
   - Página passa a consumir /api/admin/moradores?page=1&limit=50.
   - Quando houver condomínio filtrado, consome:
     /api/admin/moradores?condominio=ID&page=1&limit=50.
   - Lista deixa de depender de carregar toda a carteira de uma vez.
   - Adicionados controles de página anterior/próxima.
   - Mantida busca local sobre a página atual.
   - Mantido filtro por unidade sobre a página atual.
   - Mantido cadastro com condomínio pré-selecionado quando aplicável.
   - Compatível com API retornando array ou objeto paginado.
   - Mantido padrão sem any.
   ========================================================= */



/* =========================================================
   TYPES
   ========================================================= */

interface Condominio {
  id: string;
  name: string;
  status?: string | null;
}



interface Unidade {
  id: string;
  condominiumId: string;
  block?: string | null;
  unitNumber: string;
  unitType?: string | null;
  condominium?: Condominio | null;
}



interface UsuarioVinculado {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}



interface Morador {
  id: string;
  condominiumId: string;
  unitId: string;
  userId?: string | null;

  condominium?: Condominio | null;
  unit?: Unidade | null;
  user?: UsuarioVinculado | null;

  name: string;
  cpf?: string | null;
  email?: string | null;
  phone?: string | null;
  residentType?: string | null;
  status: string;

  formalUnitLink?: {
    id: string;
    linkType: string;
    isPrimary: boolean;
    canVote: boolean;
    canOpenTickets: boolean;
    receivesNotifications: boolean;
    notes?: string | null;
  } | null;
  linkType?: string | null;
  isPrimary?: boolean;
  canVote?: boolean;
  canOpenTickets?: boolean;
  receivesNotifications?: boolean;
  formalLinkNotes?: string | null;

  createdAt: string;

  totalTickets?: number;
  openTickets?: number;
  hasUser?: boolean;
}



interface MoradorFormState {
  condominiumId: string;
  unitId: string;
  name: string;
  cpf: string;
  email: string;
  phone: string;
  residentType: string;
  linkType: string;
  isPrimary: boolean;
  canVote: boolean;
  canOpenTickets: boolean;
  receivesNotifications: boolean;
  formalLinkNotes: string;
  status: string;
}



interface ApiErrorResponse {
  error?: string;
}



interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}



interface PaginatedMoradoresResponse {
  items?: Morador[];
  pagination?: Partial<PaginationState>;
}



interface PaginatedUnidadesResponse {
  items?: Unidade[];
  pagination?: Partial<PaginationState>;
}



type ApiMoradoresResponse = Morador[] | PaginatedMoradoresResponse;

type ApiUnidadesResponse = Unidade[] | PaginatedUnidadesResponse;



const emptyForm: MoradorFormState = {
  condominiumId: "",
  unitId: "",
  name: "",
  cpf: "",
  email: "",
  phone: "",
  residentType: "PROPRIETARIO",
  linkType: "OWNER",
  isPrimary: true,
  canVote: true,
  canOpenTickets: true,
  receivesNotifications: true,
  formalLinkNotes: "",
  status: "ACTIVE",
};



const DEFAULT_PAGE_SIZE = 50;

const UNITS_SELECT_LIMIT = 500;



const emptyPagination: PaginationState = {
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
  total: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};



/* =========================================================
   HELPERS GERAIS
   ========================================================= */

function onlyDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}



function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  }

  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(
    6,
    9
  )}-${digits.slice(9)}`;
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



function isValidResidentType(type: string) {
  return [
    "PROPRIETARIO",
    "INQUILINO",
    "FAMILIAR",
    "RESPONSAVEL",
    "OUTRO",
  ].includes(type);
}



function isValidLinkType(type: string) {
  return ["OWNER", "RESIDENT", "TENANT", "DEPENDENT", "AUTHORIZED"].includes(
    type
  );
}



function linkTypeToResidentType(linkType: string) {
  if (linkType === "OWNER") return "PROPRIETARIO";
  if (linkType === "TENANT") return "INQUILINO";
  if (linkType === "DEPENDENT") return "FAMILIAR";
  if (linkType === "AUTHORIZED") return "OUTRO";

  return "RESPONSAVEL";
}



function residentTypeToLinkType(residentType?: string | null) {
  if (residentType === "PROPRIETARIO") return "OWNER";
  if (residentType === "INQUILINO") return "TENANT";
  if (residentType === "FAMILIAR") return "DEPENDENT";
  if (residentType === "OUTRO") return "AUTHORIZED";

  return "RESIDENT";
}



function getDefaultPermissionsForLinkType(linkType: string) {
  return {
    canVote: linkType === "OWNER",
    canOpenTickets: true,
    receivesNotifications: true,
    isPrimary: true,
  };
}



function validateMoradorForm(form: MoradorFormState) {
  if (!form.condominiumId) {
    return "Selecione o condomínio.";
  }

  if (!form.unitId) {
    return "Selecione a unidade.";
  }

  if (!form.name.trim()) {
    return "Informe o nome do morador.";
  }

  if (form.cpf && onlyDigits(form.cpf).length !== 11) {
    return "Informe um CPF válido com 11 dígitos.";
  }

  if (form.email && !isValidEmail(form.email)) {
    return "Informe um e-mail válido.";
  }

  if (!isValidResidentType(form.residentType)) {
    return "Selecione um tipo de morador válido.";
  }

  if (!isValidLinkType(form.linkType)) {
    return "Selecione um tipo de vínculo válido.";
  }

  return "";
}



function buildPayload(form: MoradorFormState) {
  return {
    unitId: form.unitId,
    name: form.name.trim(),
    cpf: form.cpf ? onlyDigits(form.cpf) : null,
    email: form.email.trim().toLowerCase() || null,
    phone: form.phone ? onlyDigits(form.phone) : null,
    residentType: linkTypeToResidentType(form.linkType),
    linkType: form.linkType,
    isPrimary: form.isPrimary,
    canVote: form.canVote,
    canOpenTickets: form.canOpenTickets,
    receivesNotifications: form.receivesNotifications,
    formalLinkNotes: form.formalLinkNotes.trim() || null,
    status: form.status || "ACTIVE",
  };
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



function residentTypeLabel(type?: string | null) {
  return (
    {
      PROPRIETARIO: "Proprietário",
      INQUILINO: "Inquilino",
      FAMILIAR: "Familiar",
      RESPONSAVEL: "Responsável",
      OUTRO: "Outro",
    }[type || ""] ||
    type ||
    "-"
  );
}



function getUnitLabel(unidade?: Unidade | null) {
  if (!unidade) return "-";

  return `${unidade.block ? `Bloco ${unidade.block} - ` : ""}Unidade ${
    unidade.unitNumber
  }`;
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



function isValidCondominioFilter(value: string, condominios: Condominio[]) {
  if (value === "ALL") {
    return true;
  }

  return condominios.some((condominio) => condominio.id === value);
}



function isPaginatedMoradoresResponse(
  data: unknown
): data is PaginatedMoradoresResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    "items" in data &&
    Array.isArray((data as PaginatedMoradoresResponse).items)
  );
}



function isPaginatedUnidadesResponse(
  data: unknown
): data is PaginatedUnidadesResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    "items" in data &&
    Array.isArray((data as PaginatedUnidadesResponse).items)
  );
}



function normalizePagination(
  pagination?: Partial<PaginationState>
): PaginationState {
  return {
    page: Number(pagination?.page || 1),
    limit: Number(pagination?.limit || DEFAULT_PAGE_SIZE),
    total: Number(pagination?.total || 0),
    totalPages: Math.max(1, Number(pagination?.totalPages || 1)),
    hasNextPage: Boolean(pagination?.hasNextPage),
    hasPreviousPage: Boolean(pagination?.hasPreviousPage),
  };
}



function buildMoradoresUrl({
  condominioFilter,
  page,
  limit,
}: {
  condominioFilter: string;
  page: number;
  limit: number;
}) {
  const params = new URLSearchParams();

  if (condominioFilter !== "ALL") {
    params.set("condominio", condominioFilter);
  }

  params.set("page", String(page));
  params.set("limit", String(limit));

  return `/api/admin/moradores?${params.toString()}`;
}



function buildUnidadesUrl({
  condominioFilter,
  limit,
}: {
  condominioFilter: string;
  limit: number;
}) {
  const params = new URLSearchParams();

  if (condominioFilter !== "ALL") {
    params.set("condominio", condominioFilter);
  }

  params.set("page", "1");
  params.set("limit", String(limit));

  return `/api/admin/unidades?${params.toString()}`;
}



function buildCleanAdminMoradoresUrl(condominioFilter: string) {
  if (condominioFilter === "ALL") {
    return "/admin/moradores";
  }

  return `/admin/moradores?condominio=${encodeURIComponent(
    condominioFilter
  )}`;
}



/* =========================================================
   PÁGINA
   ========================================================= */

export default function MoradoresPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialCondominioFilter = searchParams.get("condominio") || "ALL";

  const [moradores, setMoradores] = useState<Morador[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);

  const [pagination, setPagination] =
    useState<PaginationState>(emptyPagination);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [managingAccessId, setManagingAccessId] = useState<string | null>(null);

  const [selectedMorador, setSelectedMorador] = useState<Morador | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [condominioFilter, setCondominioFilter] = useState(
    initialCondominioFilter
  );
  const [unidadeFilter, setUnidadeFilter] = useState("ALL");

  const [form, setForm] = useState<MoradorFormState>({
    ...emptyForm,
    condominiumId:
      initialCondominioFilter !== "ALL" ? initialCondominioFilter : "",
  });

  const [editForm, setEditForm] = useState<MoradorFormState>(emptyForm);



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
     APLICAR RESPOSTA DE MORADORES

     Compatibilidade:
     - Se a API retornar array, mantém funcionamento legado.
     - Se retornar { items, pagination }, usa paginação server-side.
     ========================================================= */

  const applyMoradoresResponse = useCallback(
    (data: ApiMoradoresResponse | unknown) => {
      if (Array.isArray(data)) {
        setMoradores(data);
        setPagination({
          page: 1,
          limit: data.length || DEFAULT_PAGE_SIZE,
          total: data.length,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        });
        return;
      }

      if (isPaginatedMoradoresResponse(data)) {
        const items = data.items || [];

        setMoradores(items);
        setPagination(normalizePagination(data.pagination));
        return;
      }

      showError("Resposta inválida da API.");
      setMoradores([]);
      setPagination(emptyPagination);
    },
    [showError]
  );



  /* =========================================================
     NORMALIZAR UNIDADES

     Compatibilidade:
     - API pode retornar array puro ou { items, pagination }.
     ========================================================= */

  const applyUnidadesResponse = useCallback((data: ApiUnidadesResponse | unknown) => {
    const source = Array.isArray(data)
      ? data
      : isPaginatedUnidadesResponse(data)
        ? data.items || []
        : [];

    const unidadesResult = source.map((unidade) => ({
      id: unidade.id,
      condominiumId: unidade.condominiumId,
      block: unidade.block,
      unitNumber: unidade.unitNumber,
      unitType: unidade.unitType,
      condominium: unidade.condominium,
    }));

    setUnidades(unidadesResult);
  }, []);



  /* =========================================================
     CARREGAR MORADORES
     ========================================================= */

  const loadMoradores = useCallback(
    async ({
      showLoading = true,
      targetPage = page,
      targetCondominioFilter = condominioFilter,
    }: {
      showLoading?: boolean;
      targetPage?: number;
      targetCondominioFilter?: string;
    } = {}) => {
      try {
        if (showLoading) {
          setListLoading(true);
        }

        setError("");

        const res = await fetch(
          buildMoradoresUrl({
            condominioFilter: targetCondominioFilter,
            page: targetPage,
            limit: pageSize,
          }),
          {
            cache: "no-store",
          }
        );

        const data: unknown = await res.json();

        if (!res.ok) {
          showError(getApiErrorMessage(data, "Erro ao carregar moradores."));
          setMoradores([]);
          setPagination(emptyPagination);
          return;
        }

        applyMoradoresResponse(data);
      } catch (err) {
        console.error(err);
        showError("Erro ao carregar moradores.");
        setMoradores([]);
        setPagination(emptyPagination);
      } finally {
        if (showLoading) {
          setListLoading(false);
        }
      }
    },
    [
      applyMoradoresResponse,
      condominioFilter,
      page,
      pageSize,
      showError,
    ]
  );



  /* =========================================================
     CRIAR MORADOR
     ========================================================= */

  async function createMorador(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const validationMessage = validateMoradorForm(form);

    if (validationMessage) {
      alert(validationMessage);
      return;
    }

    try {
      setCreating(true);

      const res = await fetch("/api/admin/moradores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload(form)),
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao criar morador."));
        return;
      }

      setForm({
        ...emptyForm,
        condominiumId: condominioFilter !== "ALL" ? condominioFilter : "",
      });

      setModalOpen(false);

      setPage(1);

      await loadMoradores({
        showLoading: false,
        targetPage: 1,
      });

      showSuccess("Morador cadastrado com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao criar morador.");
    } finally {
      setCreating(false);
    }
  }



  /* =========================================================
     ABRIR MODAL DE EDIÇÃO
     ========================================================= */

  function openEditModal(morador: Morador) {
    setSelectedMorador(morador);

    setEditForm({
      condominiumId: morador.condominiumId || "",
      unitId: morador.unitId || "",
      name: morador.name || "",
      cpf: morador.cpf ? formatCpf(morador.cpf) : "",
      email: morador.email || "",
      phone: morador.phone ? formatPhone(morador.phone) : "",
      residentType:
        morador.residentType ||
        linkTypeToResidentType(
          morador.linkType || residentTypeToLinkType(morador.residentType)
        ),
      linkType:
        morador.linkType || residentTypeToLinkType(morador.residentType),
      isPrimary: morador.isPrimary ?? true,
      canVote:
        morador.canVote ??
        residentTypeToLinkType(morador.residentType) === "OWNER",
      canOpenTickets: morador.canOpenTickets ?? true,
      receivesNotifications: morador.receivesNotifications ?? true,
      formalLinkNotes: morador.formalLinkNotes || "",
      status: morador.status || "ACTIVE",
    });

    setEditModalOpen(true);
  }



  /* =========================================================
     FECHAR MODAIS
     ========================================================= */

  function closeCreateModal() {
    if (creating) return;

    setForm({
      ...emptyForm,
      condominiumId: condominioFilter !== "ALL" ? condominioFilter : "",
    });

    setModalOpen(false);
  }



  function closeEditModal() {
    if (updating) return;

    setSelectedMorador(null);
    setEditForm(emptyForm);
    setEditModalOpen(false);
  }



  /* =========================================================
     ATUALIZAR MORADOR
     ========================================================= */

  async function updateMorador(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedMorador) return;

    const validationMessage = validateMoradorForm(editForm);

    if (validationMessage) {
      alert(validationMessage);
      return;
    }

    try {
      setUpdating(true);

      const res = await fetch(`/api/admin/moradores/${selectedMorador.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload(editForm)),
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao atualizar morador."));
        return;
      }

      setSelectedMorador(null);
      setEditModalOpen(false);
      setEditForm(emptyForm);

      await loadMoradores({ showLoading: false });

      showSuccess("Morador atualizado com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar morador.");
    } finally {
      setUpdating(false);
    }
  }



  /* =========================================================
     ATIVAR / INATIVAR
     ========================================================= */

  async function toggleStatus(morador: Morador) {
    const nextStatus = morador.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

    const confirmMessage =
      nextStatus === "INACTIVE"
        ? `Deseja inativar o morador "${morador.name}"?`
        : `Deseja reativar o morador "${morador.name}"?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      setUpdatingId(morador.id);

      const res = await fetch(`/api/admin/moradores/${morador.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: nextStatus,
        }),
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao atualizar status."));
        return;
      }

      await loadMoradores({ showLoading: false });

      showSuccess(
        nextStatus === "INACTIVE"
          ? "Morador inativado com sucesso."
          : "Morador reativado com sucesso."
      );
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar status.");
    } finally {
      setUpdatingId(null);
    }
  }



  /* =========================================================
     GERENCIAR ACESSO DO MORADOR
     ========================================================= */

  async function manageAccess(morador: Morador) {
    try {
      setManagingAccessId(morador.id);

      const res = await fetch(`/api/admin/moradores/${morador.id}/acesso`, {
        cache: "no-store",
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao gerenciar acesso do morador."));
        return;
      }

      if (
        typeof data !== "object" ||
        data === null ||
        !("url" in data) ||
        typeof data.url !== "string"
      ) {
        alert("Não foi possível definir a rota de acesso.");
        return;
      }

      router.push(data.url);
    } catch (err) {
      console.error(err);
      alert("Erro ao gerenciar acesso do morador.");
    } finally {
      setManagingAccessId(null);
    }
  }



  /* =========================================================
     ALTERAR FILTRO DE CONDOMÍNIO
     ========================================================= */

  function handleCondominioFilterChange(value: string) {
    setCondominioFilter(value);
    setUnidadeFilter("ALL");
    setSearchTerm("");
    setPage(1);

    if (value !== "ALL") {
      setForm((prev) => ({
        ...prev,
        condominiumId: value,
        unitId: "",
      }));
    }

    router.replace(buildCleanAdminMoradoresUrl(value));
  }



  function clearAllFilters() {
    setSearchTerm("");
    setCondominioFilter("ALL");
    setUnidadeFilter("ALL");
    setPage(1);

    setForm((prev) => ({
      ...prev,
      condominiumId: "",
      unitId: "",
    }));

    router.replace("/admin/moradores");
  }



  /* =========================================================
     PAGINAÇÃO
     ========================================================= */

  function goToPreviousPage() {
    if (!pagination.hasPreviousPage || listLoading) return;

    setPage((current) => Math.max(1, current - 1));
  }



  function goToNextPage() {
    if (!pagination.hasNextPage || listLoading) return;

    setPage((current) => current + 1);
  }



  /* =========================================================
     INIT / RECARREGAMENTO SERVER-SIDE

     Ajuste:
     - Carrega moradores, condomínios e unidades em Promise.all.
     - Não chama função com setState diretamente no corpo do effect.
     - Filtro por condomínio e paginação são aplicados na API.
     ========================================================= */

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      fetch(
        buildMoradoresUrl({
          condominioFilter,
          page,
          limit: pageSize,
        }),
        {
          cache: "no-store",
        }
      ).then(async (res) => {
        const data: unknown = await res.json();

        return {
          ok: res.ok,
          data,
        };
      }),

      fetch("/api/admin/condominios", {
        cache: "no-store",
      }).then(async (res) => {
        const data: unknown = await res.json();

        return {
          ok: res.ok,
          data,
        };
      }),

      fetch(
        buildUnidadesUrl({
          condominioFilter,
          limit: UNITS_SELECT_LIMIT,
        }),
        {
          cache: "no-store",
        }
      ).then(async (res) => {
        const data: unknown = await res.json();

        return {
          ok: res.ok,
          data,
        };
      }),
    ])
      .then(([moradoresResponse, condominiosResponse, unidadesResponse]) => {
        if (!isMounted) {
          return;
        }

        if (!moradoresResponse.ok) {
          showError(
            getApiErrorMessage(
              moradoresResponse.data,
              "Erro ao carregar moradores."
            )
          );
          setMoradores([]);
          setPagination(emptyPagination);
        } else {
          applyMoradoresResponse(moradoresResponse.data);
        }

        if (!condominiosResponse.ok || !Array.isArray(condominiosResponse.data)) {
          setCondominios([]);
        } else {
          const condominiosResult = (condominiosResponse.data as Condominio[]).map(
            (condominio) => ({
              id: condominio.id,
              name: condominio.name,
              status: condominio.status,
            })
          );

          setCondominios(condominiosResult);

          if (
            condominioFilter !== "ALL" &&
            !isValidCondominioFilter(condominioFilter, condominiosResult)
          ) {
            setCondominioFilter("ALL");
            setUnidadeFilter("ALL");
            setPage(1);
            setForm((prev) => ({
              ...prev,
              condominiumId: "",
              unitId: "",
            }));

            router.replace("/admin/moradores");

            showError(
              "O condomínio informado no filtro não foi encontrado nesta carteira."
            );
          }
        }

        if (!unidadesResponse.ok) {
          setUnidades([]);
        } else {
          applyUnidadesResponse(unidadesResponse.data);
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) {
          return;
        }

        console.error(err);
        showError("Erro ao carregar moradores.");
        setMoradores([]);
        setCondominios([]);
        setUnidades([]);
        setPagination(emptyPagination);
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
          setListLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [
    applyMoradoresResponse,
    applyUnidadesResponse,
    condominioFilter,
    page,
    pageSize,
    router,
    showError,
  ]);



  /* =========================================================
     CONDOMÍNIO SELECIONADO PELO FILTRO
     ========================================================= */

  const selectedCondominioFilter = useMemo(() => {
    if (condominioFilter === "ALL") {
      return null;
    }

    return (
      condominios.find((condominio) => condominio.id === condominioFilter) ||
      null
    );
  }, [condominioFilter, condominios]);



  /* =========================================================
     UNIDADES FILTRADAS PARA O FORMULÁRIO DE CRIAÇÃO
     ========================================================= */

  const unidadesDoFormulario = useMemo(() => {
    if (!form.condominiumId) return [];

    return unidades.filter(
      (unidade) => unidade.condominiumId === form.condominiumId
    );
  }, [unidades, form.condominiumId]);



  /* =========================================================
     UNIDADES FILTRADAS PARA O FORMULÁRIO DE EDIÇÃO
     ========================================================= */

  const unidadesDoEditFormulario = useMemo(() => {
    if (!editForm.condominiumId) return [];

    return unidades.filter(
      (unidade) => unidade.condominiumId === editForm.condominiumId
    );
  }, [unidades, editForm.condominiumId]);



  /* =========================================================
     UNIDADES FILTRADAS PARA FILTRO DA LISTAGEM
     ========================================================= */

  const unidadesDoFiltro = useMemo(() => {
    if (condominioFilter === "ALL") return unidades;

    return unidades.filter(
      (unidade) => unidade.condominiumId === condominioFilter
    );
  }, [unidades, condominioFilter]);



  /* =========================================================
     MÉTRICAS

     Observação:
     - O total principal vem da paginação server-side.
     - Métricas de status/acesso/chamados são calculadas sobre
       a página atual carregada.
     ========================================================= */

  const metrics = useMemo(() => {
    return {
      total: pagination.total || moradores.length,
      pageTotal: moradores.length,
      active: moradores.filter((item) => item.status === "ACTIVE").length,
      inactive: moradores.filter((item) => item.status === "INACTIVE").length,
      withUser: moradores.filter((item) => item.hasUser).length,
      withoutUser: moradores.filter((item) => !item.hasUser).length,
      tickets: moradores.reduce(
        (sum, item) => sum + Number(item.totalTickets || 0),
        0
      ),
      openTickets: moradores.reduce(
        (sum, item) => sum + Number(item.openTickets || 0),
        0
      ),
    };
  }, [moradores, pagination.total]);



  /* =========================================================
     FILTROS LOCAIS DA PÁGINA ATUAL
     ========================================================= */

  const filteredMoradores = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const termDigits = onlyDigits(searchTerm);

    return moradores.filter((morador) => {
      const matchesUnidade =
        unidadeFilter === "ALL" || morador.unitId === unidadeFilter;

      const searchable = [
        morador.name,
        morador.cpf,
        morador.cpf ? formatCpf(morador.cpf) : "",
        morador.email,
        morador.phone,
        morador.phone ? formatPhone(morador.phone) : "",
        morador.residentType,
        residentTypeLabel(morador.residentType),
        statusLabel(morador.status),
        morador.condominium?.name,
        morador.unit?.block,
        morador.unit?.unitNumber,
        morador.user?.email,
        morador.user?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const searchableDigits = onlyDigits(searchable);

      const matchesSearch =
        !term ||
        searchable.includes(term) ||
        (!!termDigits && searchableDigits.includes(termDigits));

      return matchesUnidade && matchesSearch;
    });
  }, [moradores, searchTerm, unidadeFilter]);



  /* =========================================================
     CARREGAMENTO
     ========================================================= */

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando moradores..."
        description="Aguarde enquanto identificamos seu perfil de acesso e carregamos os moradores da carteira administrativa."
      />
    );
  }



  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <AdminShell
      current="moradores"
      title="Moradores"
      description="Gerencie moradores vinculados às unidades dos condomínios."
    >
      <div className="space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
              Cadastros
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
              Moradores
            </h1>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
              Gerencie moradores e proprietários vinculados às unidades,
              mantendo dados cadastrais, acesso ao portal e histórico
              operacional organizados.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setForm({
                ...emptyForm,
                condominiumId:
                  condominioFilter !== "ALL" ? condominioFilter : "",
              });
              setModalOpen(true);
            }}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32] focus:outline-none focus:ring-4 focus:ring-[#256D3C]/20"
          >
            Novo Morador
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



        {selectedCondominioFilter && (
          <section className="rounded-[28px] border border-[#CFE6D4] bg-[#EAF7EE] p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#256D3C]">
                  Filtro aplicado
                </p>

                <h2 className="mt-1 text-xl font-semibold text-[#17211B]">
                  {selectedCondominioFilter.name}
                </h2>

                <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                  Exibindo apenas moradores deste condomínio. A consulta já está
                  filtrada no servidor para manter a página leve em bases grandes.
                </p>
              </div>

              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex h-11 w-fit items-center justify-center rounded-2xl border border-[#CFE6D4] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
              >
                Limpar filtro
              </button>
            </div>
          </section>
        )}



        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#17211B]/65 p-4 backdrop-blur-sm">
            <div className="my-6 max-h-[calc(100vh-3rem)] w-full max-w-3xl overflow-y-auto rounded-[32px] border border-[#DDE5DF] bg-white p-6 shadow-2xl">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-[#17211B]">
                    Novo Morador
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                    Cadastre um morador e vincule à unidade correspondente.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={creating}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-[#5E6B63] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={createMorador} className="space-y-4">
                <MoradorFormFields
                  form={form}
                  setForm={setForm}
                  condominios={condominios}
                  unidadesFiltradas={unidadesDoFormulario}
                  getUnitLabel={getUnitLabel}
                />

                <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-4 text-sm leading-6 text-[#5E6B63]">
                  O CPF é opcional, mas quando informado precisa conter 11
                  dígitos e ser único no sistema.
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    disabled={creating}
                    className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={creating}
                    className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                  >
                    {creating ? "Criando..." : "Criar Morador"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}



        {editModalOpen && selectedMorador && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#17211B]/65 p-4 backdrop-blur-sm">
            <div className="my-6 max-h-[calc(100vh-3rem)] w-full max-w-3xl overflow-y-auto rounded-[32px] border border-[#DDE5DF] bg-white p-6 shadow-2xl">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-[#17211B]">
                    Editar Morador
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                    Atualize os dados cadastrais, unidade, tipo ou status do
                    morador.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={updating}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-[#5E6B63] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={updateMorador} className="space-y-4">
                <MoradorFormFields
                  form={editForm}
                  setForm={setEditForm}
                  condominios={condominios}
                  unidadesFiltradas={unidadesDoEditFormulario}
                  getUnitLabel={getUnitLabel}
                />

                <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-4 text-sm leading-6 text-[#5E6B63]">
                  Ao alterar a unidade, o vínculo do condomínio será atualizado
                  automaticamente conforme a unidade selecionada.
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={closeEditModal}
                    disabled={updating}
                    className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={updating}
                    className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                  >
                    {updating ? "Salvando..." : "Salvar alterações"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}



        <section className="overflow-hidden rounded-[32px] border border-[#DDE5DF] bg-white shadow-sm">
          <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_62%,#EAF7EE_135%)] p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-[#17211B] md:text-3xl">
                  Visão da Seleção
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                  Resumo dos moradores retornados pela consulta atual. A
                  listagem usa paginação server-side para manter a página leve
                  mesmo em carteiras grandes.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:min-w-[620px] xl:grid-cols-4">
                <MetricCard title="Total" value={metrics.total} highlighted />
                <MetricCard
                  title="Nesta página"
                  value={metrics.pageTotal}
                  highlighted
                />
                <MetricCard title="Com Acesso" value={metrics.withUser} />
                <MetricCard title="Sem Acesso" value={metrics.withoutUser} />
              </div>
            </div>
          </div>

          <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Página atual
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                Página{" "}
                <strong className="text-[#17211B]">{pagination.page}</strong>{" "}
                de{" "}
                <strong className="text-[#17211B]">
                  {pagination.totalPages}
                </strong>
                .
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Chamados Vinculados
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                {metrics.tickets > 0
                  ? `${metrics.tickets} chamado(s) vinculados aos moradores desta página.`
                  : "Nenhum chamado vinculado aos moradores desta página."}
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Resultado local
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                Exibindo{" "}
                <strong className="text-[#17211B]">
                  {filteredMoradores.length}
                </strong>{" "}
                morador(es) após busca local nesta página.
              </p>
            </div>
          </div>
        </section>



        <ResponsiveSection
          title="Busca e Filtros"
          description="Localize moradores por nome, CPF, e-mail, telefone, condomínio ou unidade."
          defaultOpenMobile
        >
          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
            <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#17211B]">
                  Busca e Filtros
                </h2>

                <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                  Refine a carteira por texto, condomínio ou unidade. O filtro
                  por condomínio é aplicado no servidor; busca e unidade filtram
                  a página atual.
                </p>
              </div>

              {(searchTerm ||
                condominioFilter !== "ALL" ||
                unidadeFilter !== "ALL") && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                >
                  Limpar filtros
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label className="text-sm font-semibold text-[#17211B]">
                  Buscar morador
                </label>

                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="form-input mt-1"
                  placeholder="Buscar na página atual por nome, CPF, e-mail, telefone, unidade..."
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-[#17211B]">
                  Condomínio
                </label>

                <select
                  value={condominioFilter}
                  onChange={(e) => handleCondominioFilterChange(e.target.value)}
                  className="form-input mt-1"
                >
                  <option value="ALL">Todos</option>

                  {condominios.map((condominio) => (
                    <option key={condominio.id} value={condominio.id}>
                      {condominio.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold text-[#17211B]">
                  Unidade
                </label>

                <select
                  value={unidadeFilter}
                  onChange={(e) => setUnidadeFilter(e.target.value)}
                  className="form-input mt-1"
                >
                  <option value="ALL">Todas</option>

                  {unidadesDoFiltro.map((unidade) => (
                    <option key={unidade.id} value={unidade.id}>
                      {getUnitLabel(unidade)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 text-sm text-[#5E6B63] lg:flex-row lg:items-center lg:justify-between">
              <p>
                Exibindo{" "}
                <strong className="text-[#17211B]">
                  {filteredMoradores.length}
                </strong>{" "}
                de{" "}
                <strong className="text-[#17211B]">{moradores.length}</strong>{" "}
                morador(es) carregados nesta página. Total da seleção:{" "}
                <strong className="text-[#17211B]">{pagination.total}</strong>.
              </p>

              {listLoading && (
                <span className="font-semibold text-[#256D3C]">
                  Atualizando lista...
                </span>
              )}
            </div>
          </section>
        </ResponsiveSection>



        <ResponsiveSection
          title="Moradores da Carteira"
          description="Lista compacta dos moradores conforme filtros e paginação aplicados."
          defaultOpenMobile
        >
          {filteredMoradores.length === 0 ? (
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-8 text-center shadow-sm">
              <h2 className="mb-2 text-2xl font-semibold text-[#17211B]">
                Nenhum Morador Encontrado
              </h2>

              <p className="mx-auto max-w-2xl text-sm leading-6 text-[#5E6B63]">
                Não encontramos moradores com os filtros atuais. Tente limpar os
                filtros, trocar a página ou cadastrar um novo morador.
              </p>
            </section>
          ) : (
            <div className="space-y-3">
              {filteredMoradores.map((morador) => (
                <article
                  key={morador.id}
                  className="rounded-[24px] border border-[#DDE5DF] bg-white p-5 shadow-sm transition hover:border-[#256D3C]/30 hover:shadow-[0_14px_38px_rgba(23,33,27,0.07)]"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                            morador.status
                          )}`}
                        >
                          {statusLabel(morador.status)}
                        </span>

                        <span className="rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-semibold text-[#5E6B63]">
                          {residentTypeLabel(morador.residentType)}
                        </span>

                        {morador.hasUser ? (
                          <span className="rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-semibold text-[#5E6B63]">
                            Acesso criado
                          </span>
                        ) : (
                          <span className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700">
                            Sem acesso
                          </span>
                        )}
                      </div>

                      <h2 className="break-words text-xl font-semibold tracking-tight text-[#17211B] md:text-2xl">
                        {morador.name}
                      </h2>

                      <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                        {morador.condominium?.name || "-"} •{" "}
                        {getUnitLabel(morador.unit)}
                      </p>

                      <p className="mt-2 text-xs text-[#7A877F]">
                        {morador.email || "E-mail não informado"}
                        {morador.phone
                          ? ` • ${formatPhone(morador.phone)}`
                          : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-start gap-2 xl:w-[190px] xl:flex-col">
                      <button
                        type="button"
                        onClick={() => openEditModal(morador)}
                        className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => manageAccess(morador)}
                        disabled={managingAccessId === morador.id}
                        className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                      >
                        {managingAccessId === morador.id
                          ? "Verificando..."
                          : "Gerenciar Acesso"}
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleStatus(morador)}
                        disabled={updatingId === morador.id}
                        className={
                          morador.status === "ACTIVE"
                            ? "inline-flex h-11 w-full items-center justify-center rounded-2xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                            : "inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                        }
                      >
                        {updatingId === morador.id
                          ? "Atualizando..."
                          : morador.status === "ACTIVE"
                            ? "Inativar"
                            : "Reativar"}
                      </button>
                    </div>
                  </div>

                  <details className="mt-4 group rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#17211B]">
                      <span>Mais Informações</span>
                      <span className="text-[#7A877F] transition group-open:rotate-180">
                        ▾
                      </span>
                    </summary>

                    <div className="border-t border-[#DDE5DF] p-4">
                      <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-4">
                        <InfoLine
                          label="CPF"
                          value={morador.cpf ? formatCpf(morador.cpf) : "-"}
                        />

                        <InfoLine
                          label="Tipo"
                          value={residentTypeLabel(morador.residentType)}
                        />

                        <InfoLine
                          label="Condomínio"
                          value={morador.condominium?.name || "-"}
                        />

                        <InfoLine
                          label="Unidade"
                          value={getUnitLabel(morador.unit)}
                        />

                        <InfoLine
                          label="Acesso ao Portal"
                          value={
                            morador.user?.email ||
                            (morador.hasUser
                              ? "Usuário vinculado"
                              : "Ainda não criado")
                          }
                        />

                        <InfoLine
                          label="Status do Acesso"
                          value={
                            morador.user?.isActive
                              ? "Acesso ativo"
                              : morador.user
                                ? "Acesso inativo"
                                : "Pendente de criação"
                          }
                        />

                        <InfoLine
                          label="Chamados"
                          value={morador.totalTickets || 0}
                        />

                        <InfoLine
                          label="Em Aberto"
                          value={morador.openTickets || 0}
                        />

                        <InfoLine
                          label="Criado em"
                          value={new Date(morador.createdAt).toLocaleString(
                            "pt-BR"
                          )}
                        />
                      </div>
                    </div>
                  </details>
                </article>
              ))}
            </div>
          )}

          <PaginationControls
            pagination={pagination}
            loading={listLoading}
            onPrevious={goToPreviousPage}
            onNext={goToNextPage}
          />
        </ResponsiveSection>
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
          transition:
            border-color 0.15s ease,
            box-shadow 0.15s ease,
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
   COMPONENTE REUTILIZÁVEL DOS CAMPOS DO FORMULÁRIO
   ========================================================= */

function MoradorFormFields({
  form,
  setForm,
  condominios,
  unidadesFiltradas,
  getUnitLabel,
}: {
  form: MoradorFormState;
  setForm: Dispatch<SetStateAction<MoradorFormState>>;
  condominios: Condominio[];
  unidadesFiltradas: Unidade[];
  getUnitLabel: (unidade?: Unidade | null) => string;
}) {
  return (
    <>
      <FormField label="Condomínio" required>
        <select
          value={form.condominiumId}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              condominiumId: e.target.value,
              unitId: "",
            }))
          }
          className="form-input"
        >
          <option value="">Selecione um condomínio</option>

          {condominios.map((condominio) => (
            <option key={condominio.id} value={condominio.id}>
              {condominio.name}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Unidade" required>
        <select
          value={form.unitId}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              unitId: e.target.value,
            }))
          }
          disabled={!form.condominiumId}
          className="form-input disabled:opacity-60"
        >
          <option value="">
            {form.condominiumId
              ? "Selecione uma unidade"
              : "Selecione primeiro o condomínio"}
          </option>

          {unidadesFiltradas.map((unidade) => (
            <option key={unidade.id} value={unidade.id}>
              {getUnitLabel(unidade)}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Nome do morador" required>
        <input
          value={form.name}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, name: e.target.value }))
          }
          className="form-input"
          placeholder="Nome completo"
        />
      </FormField>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="CPF">
          <input
            value={form.cpf}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                cpf: formatCpf(e.target.value),
              }))
            }
            maxLength={14}
            className="form-input"
            placeholder="000.000.000-00"
          />

          {form.cpf && onlyDigits(form.cpf).length !== 11 && (
            <p className="mt-1 text-xs text-yellow-700">
              CPF deve conter 11 dígitos.
            </p>
          )}
        </FormField>

        <FormField label="Tipo De Vínculo Com A Unidade">
          <select
            value={form.linkType}
            onChange={(e) => {
              const linkType = e.target.value;
              const defaults = getDefaultPermissionsForLinkType(linkType);

              setForm((prev) => ({
                ...prev,
                linkType,
                residentType: linkTypeToResidentType(linkType),
                ...defaults,
              }));
            }}
            className="form-input"
          >
            <option value="OWNER">Proprietário</option>
            <option value="RESIDENT">Morador</option>
            <option value="TENANT">Locatário</option>
            <option value="DEPENDENT">Dependente</option>
            <option value="AUTHORIZED">Autorizado</option>
          </select>

          <p className="mt-1 text-xs leading-5 text-[#7A877F]">
            Este vínculo formal define as permissões da pessoa na unidade e
            alimenta assembleias, procurações, comunicados e portal.
          </p>
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="E-mail">
          <input
            type="email"
            value={form.email}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, email: e.target.value }))
            }
            className="form-input"
            placeholder="morador@email.com"
          />

          {form.email && !isValidEmail(form.email) && (
            <p className="mt-1 text-xs text-yellow-700">
              Verifique o formato do e-mail.
            </p>
          )}
        </FormField>

        <FormField label="Telefone">
          <input
            value={form.phone}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                phone: formatPhone(e.target.value),
              }))
            }
            maxLength={15}
            className="form-input"
            placeholder="(11) 99999-9999"
          />
        </FormField>
      </div>

      <section className="rounded-3xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
        <div>
          <h3 className="text-sm font-bold text-[#17211B]">
            Permissões Do Vínculo
          </h3>

          <p className="mt-1 text-xs leading-5 text-[#7A877F]">
            Proprietários recebem direito de voto por padrão. Os demais
            vínculos podem ser ajustados manualmente quando houver autorização
            formal.
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex items-start gap-3 rounded-2xl border border-[#DDE5DF] bg-white p-3">
            <input
              type="checkbox"
              checked={form.canVote}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, canVote: e.target.checked }))
              }
              className="mt-1 h-4 w-4"
            />
            <span>
              <strong className="block text-sm text-[#17211B]">
                Pode Votar
              </strong>
              <small className="mt-1 block text-xs leading-5 text-[#7A877F]">
                Habilita a pessoa como concedente ou votante quando a regra da
                assembleia permitir.
              </small>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-[#DDE5DF] bg-white p-3">
            <input
              type="checkbox"
              checked={form.canOpenTickets}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  canOpenTickets: e.target.checked,
                }))
              }
              className="mt-1 h-4 w-4"
            />
            <span>
              <strong className="block text-sm text-[#17211B]">
                Pode Abrir Chamados
              </strong>
              <small className="mt-1 block text-xs leading-5 text-[#7A877F]">
                Permite solicitações vinculadas a esta unidade.
              </small>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-[#DDE5DF] bg-white p-3">
            <input
              type="checkbox"
              checked={form.receivesNotifications}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  receivesNotifications: e.target.checked,
                }))
              }
              className="mt-1 h-4 w-4"
            />
            <span>
              <strong className="block text-sm text-[#17211B]">
                Recebe Comunicados
              </strong>
              <small className="mt-1 block text-xs leading-5 text-[#7A877F]">
                Inclui notificações e comunicados direcionados à unidade.
              </small>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-[#DDE5DF] bg-white p-3">
            <input
              type="checkbox"
              checked={form.isPrimary}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, isPrimary: e.target.checked }))
              }
              className="mt-1 h-4 w-4"
            />
            <span>
              <strong className="block text-sm text-[#17211B]">
                Vínculo Principal
              </strong>
              <small className="mt-1 block text-xs leading-5 text-[#7A877F]">
                Destaca este vínculo como referência principal da pessoa na
                unidade.
              </small>
            </span>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="text-sm font-semibold text-[#17211B]">
            Observações Do Vínculo
          </span>
          <textarea
            value={form.formalLinkNotes}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                formalLinkNotes: e.target.value,
              }))
            }
            className="form-input mt-2 min-h-20 py-3"
            placeholder="Ex.: coproprietário autorizado, responsável por comunicações ou observação documental."
          />
        </label>
      </section>

      <FormField label="Status">
        <select
          value={form.status}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              status: e.target.value,
            }))
          }
          className="form-input"
        >
          <option value="ACTIVE">Ativo</option>
          <option value="INACTIVE">Inativo</option>
        </select>
      </FormField>
    </>
  );
}



/* =========================================================
   CARD DE MÉTRICA
   ========================================================= */

function MetricCard({
  title,
  value,
  highlighted = false,
}: {
  title: string;
  value: number;
  highlighted?: boolean;
}) {
  return (
    <div
      className={[
        "h-full rounded-2xl border bg-white p-4 text-left shadow-sm transition",
        highlighted ? "border-[#CFE6D4]" : "border-[#DDE5DF]",
      ].join(" ")}
    >
      <p
        className={[
          "text-xs font-semibold uppercase tracking-[0.12em]",
          highlighted ? "text-[#256D3C]" : "text-[#7A877F]",
        ].join(" ")}
      >
        {title}
      </p>

      <strong
        className={[
          "mt-2 block text-3xl font-semibold",
          highlighted ? "text-[#256D3C]" : "text-[#17211B]",
        ].join(" ")}
      >
        {value}
      </strong>
    </div>
  );
}



/* =========================================================
   CONTROLES DE PAGINAÇÃO
   ========================================================= */

function PaginationControls({
  pagination,
  loading,
  onPrevious,
  onNext,
}: {
  pagination: PaginationState;
  loading: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-5 rounded-[24px] border border-[#DDE5DF] bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#17211B]">
            Página {pagination.page} de {pagination.totalPages}
          </p>

          <p className="mt-1 text-xs text-[#5E6B63]">
            Total de {pagination.total} morador(es) na seleção atual. Exibindo
            até {pagination.limit} por página.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPrevious}
            disabled={!pagination.hasPreviousPage || loading}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:cursor-not-allowed disabled:bg-[#F6F8F7] disabled:text-[#9AA7A0]"
          >
            Anterior
          </button>

          <button
            type="button"
            onClick={onNext}
            disabled={!pagination.hasNextPage || loading}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}



/* =========================================================
   LINHA DE INFORMAÇÃO DO MENU SUSPENSO
   ========================================================= */

function InfoLine({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-semibold text-[#17211B]">
        {value}
      </p>
    </div>
  );
}



/* =========================================================
   CAMPO DE FORMULÁRIO
   ========================================================= */

function FormField({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-[#17211B]">
        {label} {required && <span className="text-red-600">*</span>}
      </label>

      <div className="mt-1">{children}</div>
    </div>
  );
}