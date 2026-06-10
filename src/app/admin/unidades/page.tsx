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
import { useSearchParams } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import ResponsiveSection from "@/components/ui/ResponsiveSection";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";



/* =========================================================
   UNIDADES - PÁGINA ADMINISTRATIVA

   ETAPA 15.2:
   - Listagem de unidades
   - Busca
   - Filtro por condomínio
   - KPIs
   - Cadastro via modal

   ETAPA 15.5.2:
   - Edição de unidade
   - Ativar / inativar unidade

   ETAPA 35.2:
   Refinamento do cadastro base de unidades.

   ETAPA 39.8 — NOVO VISUAL COM ADMINSHELL

   ETAPA 39.17.9 — PADRONIZAÇÃO DO CARREGAMENTO

   ETAPA 45.4 — FILTRO AUTOMÁTICO POR CONDOMÍNIO
   - Página passa a ler /admin/unidades?condominio=ID.
   - O filtro de condomínio é aplicado automaticamente ao abrir a tela.
   - O botão Nova unidade já pré-seleciona o condomínio filtrado.
   - Adicionado aviso visual de filtro vindo do detalhe do condomínio.
   - Adicionado botão para limpar filtro.

   ETAPA 45.6 — PAGINAÇÃO SERVER-SIDE
   - Página passa a consumir /api/admin/unidades?page=1&limit=50.
   - Quando houver condomínio filtrado, consome:
     /api/admin/unidades?condominio=ID&page=1&limit=50.
   - Lista deixa de depender de carregar toda a carteira de uma vez.
   - Adicionados controles de página anterior/próxima.
   - Mantido filtro de busca local sobre a página atual.
   - Mantido cadastro com condomínio pré-selecionado quando aplicável.
   - Mantido padrão sem any.

   CORREÇÃO LINT / REACT COMPILER
   - Removido setState síncrono de listLoading dentro do useEffect.
   - listLoading passa a ser ativado em eventos de usuário:
     troca de filtro, página anterior/próxima e recarregamentos manuais.
   - useEffect fica responsável apenas por sincronizar dados externos
     via callbacks assíncronas.
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
  condominium?: Condominio | null;

  block?: string | null;
  unitNumber: string;
  unitType?: string | null;
  status: string;

  createdAt: string;

  totalResidents?: number;
  activeResidents?: number;

  totalTickets?: number;
  openTickets?: number;
}



interface UnidadeFormState {
  condominiumId: string;
  block: string;
  unitNumber: string;
  unitType: string;
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



interface PaginatedUnidadesResponse {
  items?: Unidade[];
  pagination?: Partial<PaginationState>;
}



type ApiListResponse = Unidade[] | PaginatedUnidadesResponse;



const emptyForm: UnidadeFormState = {
  condominiumId: "",
  block: "",
  unitNumber: "",
  unitType: "Apartamento",
  status: "ACTIVE",
};



const DEFAULT_PAGE_SIZE = 50;



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

function cleanText(value: string) {
  return String(value || "").trim();
}



function normalizeBlock(value: string) {
  return cleanText(value).toUpperCase();
}



function normalizeUnitNumber(value: string) {
  return cleanText(value).toUpperCase();
}



function validateUnidadeForm(form: UnidadeFormState) {
  if (!form.condominiumId) {
    return "Selecione o condomínio.";
  }

  if (!cleanText(form.unitNumber)) {
    return "Informe o número da unidade.";
  }

  if (!form.status || !["ACTIVE", "INACTIVE"].includes(form.status)) {
    return "Status inválido.";
  }

  return "";
}



function buildPayload(form: UnidadeFormState) {
  return {
    condominiumId: form.condominiumId,
    block: normalizeBlock(form.block) || null,
    unitNumber: normalizeUnitNumber(form.unitNumber),
    unitType: cleanText(form.unitType) || null,
    status: form.status || "ACTIVE",
  };
}



function statusLabel(status?: string | null) {
  return (
    {
      ACTIVE: "Ativa",
      INACTIVE: "Inativa",
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



function getUnitLabel(unidade: Unidade) {
  return `${unidade.block ? `Bloco ${unidade.block} - ` : ""}Unidade ${
    unidade.unitNumber
  }`;
}



function getUnitContextLine(unidade: Unidade) {
  const condominiumName =
    unidade.condominium?.name || "Condomínio não informado";

  return `${condominiumName} • ${getUnitLabel(unidade)}`;
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



function buildUnidadesUrl({
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

  return `/api/admin/unidades?${params.toString()}`;
}



function buildCleanAdminUnidadesUrl(condominioFilter: string) {
  if (condominioFilter === "ALL") {
    return "/admin/unidades";
  }

  return `/admin/unidades?condominio=${encodeURIComponent(condominioFilter)}`;
}



/* =========================================================
   PÁGINA
   ========================================================= */

export default function UnidadesPage() {
  const searchParams = useSearchParams();
  const initialCondominioFilter = searchParams.get("condominio") || "ALL";

  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);

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

  const [selectedUnidade, setSelectedUnidade] = useState<Unidade | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [condominioFilter, setCondominioFilter] = useState(
    initialCondominioFilter
  );

  const [form, setForm] = useState<UnidadeFormState>({
    ...emptyForm,
    condominiumId:
      initialCondominioFilter !== "ALL" ? initialCondominioFilter : "",
  });

  const [editForm, setEditForm] = useState<UnidadeFormState>(emptyForm);



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
     APLICAR RESPOSTA DE UNIDADES

     Compatibilidade:
     - Se a API retornar array, mantém funcionamento legado.
     - Se retornar { items, pagination }, usa paginação server-side.
     ========================================================= */

  const applyUnidadesResponse = useCallback(
    (data: ApiListResponse | unknown) => {
      if (Array.isArray(data)) {
        setUnidades(data);
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

      if (isPaginatedUnidadesResponse(data)) {
        const items = data.items || [];

        setUnidades(items);
        setPagination(normalizePagination(data.pagination));
        return;
      }

      showError("Resposta inválida da API.");
      setUnidades([]);
      setPagination(emptyPagination);
    },
    [showError]
  );



  /* =========================================================
     CARREGAR UNIDADES
     ========================================================= */

  const loadUnidades = useCallback(
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
          buildUnidadesUrl({
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
          showError(getApiErrorMessage(data, "Erro ao carregar unidades."));
          setUnidades([]);
          setPagination(emptyPagination);
          return;
        }

        applyUnidadesResponse(data);
      } catch (err) {
        console.error(err);
        showError("Erro ao carregar unidades.");
        setUnidades([]);
        setPagination(emptyPagination);
      } finally {
        if (showLoading) {
          setListLoading(false);
        }
      }
    },
    [
      applyUnidadesResponse,
      condominioFilter,
      page,
      pageSize,
      showError,
    ]
  );



  /* =========================================================
     CRIAR UNIDADE
     ========================================================= */

  async function createUnidade(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const validationMessage = validateUnidadeForm(form);

    if (validationMessage) {
      alert(validationMessage);
      return;
    }

    try {
      setCreating(true);

      const res = await fetch("/api/admin/unidades", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload(form)),
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao criar unidade."));
        return;
      }

      setForm({
        ...emptyForm,
        condominiumId: condominioFilter !== "ALL" ? condominioFilter : "",
      });

      setModalOpen(false);

      setPage(1);
      await loadUnidades({
        showLoading: false,
        targetPage: 1,
      });

      showSuccess("Unidade criada com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao criar unidade.");
    } finally {
      setCreating(false);
    }
  }



  /* =========================================================
     ABRIR MODAL DE EDIÇÃO
     ========================================================= */

  function openEditModal(unidade: Unidade) {
    setSelectedUnidade(unidade);

    setEditForm({
      condominiumId: unidade.condominiumId || "",
      block: unidade.block || "",
      unitNumber: unidade.unitNumber || "",
      unitType: unidade.unitType || "Apartamento",
      status: unidade.status || "ACTIVE",
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

    setSelectedUnidade(null);
    setEditForm(emptyForm);
    setEditModalOpen(false);
  }



  /* =========================================================
     ATUALIZAR UNIDADE
     ========================================================= */

  async function updateUnidade(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedUnidade) return;

    const validationMessage = validateUnidadeForm(editForm);

    if (validationMessage) {
      alert(validationMessage);
      return;
    }

    try {
      setUpdating(true);

      const res = await fetch(`/api/admin/unidades/${selectedUnidade.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload(editForm)),
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao atualizar unidade."));
        return;
      }

      setSelectedUnidade(null);
      setEditForm(emptyForm);
      setEditModalOpen(false);

      await loadUnidades({ showLoading: false });

      showSuccess("Unidade atualizada com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar unidade.");
    } finally {
      setUpdating(false);
    }
  }



  /* =========================================================
     ATIVAR / INATIVAR
     ========================================================= */

  async function toggleStatus(unidade: Unidade) {
    const nextStatus = unidade.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

    const confirmMessage =
      nextStatus === "INACTIVE"
        ? `Deseja inativar a unidade "${getUnitLabel(unidade)}"?`
        : `Deseja reativar a unidade "${getUnitLabel(unidade)}"?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      setUpdatingId(unidade.id);

      const res = await fetch(`/api/admin/unidades/${unidade.id}`, {
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

      await loadUnidades({ showLoading: false });

      showSuccess(
        nextStatus === "INACTIVE"
          ? "Unidade inativada com sucesso."
          : "Unidade reativada com sucesso."
      );
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar status.");
    } finally {
      setUpdatingId(null);
    }
  }



  /* =========================================================
     ALTERAR FILTRO DE CONDOMÍNIO

     Correção React Compiler:
     - listLoading é ativado no evento de usuário, não dentro do useEffect.
     ========================================================= */

  function handleCondominioFilterChange(value: string) {
    setListLoading(true);
    setCondominioFilter(value);
    setPage(1);
    setSearchTerm("");

    if (value !== "ALL") {
      setForm((prev) => ({
        ...prev,
        condominiumId: value,
      }));
    }

    if (typeof window !== "undefined") {
      window.history.replaceState(
        null,
        "",
        buildCleanAdminUnidadesUrl(value)
      );
    }
  }



  function clearCondominioFilter() {
    handleCondominioFilterChange("ALL");

    setForm((prev) => ({
      ...prev,
      condominiumId: "",
    }));
  }



  /* =========================================================
     PAGINAÇÃO

     Correção React Compiler:
     - listLoading é ativado nos cliques de paginação.
     - O useEffect apenas sincroniza a busca quando page muda.
     ========================================================= */

  function goToPreviousPage() {
    if (!pagination.hasPreviousPage || listLoading) return;

    setListLoading(true);
    setPage((current) => Math.max(1, current - 1));
  }



  function goToNextPage() {
    if (!pagination.hasNextPage || listLoading) return;

    setListLoading(true);
    setPage((current) => current + 1);
  }



  /* =========================================================
     INIT / RECARREGAMENTO SERVER-SIDE

     Ajuste de lint:
     - Não chama setListLoading(true) dentro do corpo do useEffect.
     - Fetch fica em promise chain e atualiza estado nas callbacks.
     ========================================================= */

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      fetch(
        buildUnidadesUrl({
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
    ])
      .then(([unidadesResponse, condominiosResponse]) => {
        if (!isMounted) {
          return;
        }

        if (!unidadesResponse.ok) {
          showError(
            getApiErrorMessage(
              unidadesResponse.data,
              "Erro ao carregar unidades."
            )
          );
          setUnidades([]);
          setPagination(emptyPagination);
        } else {
          applyUnidadesResponse(unidadesResponse.data);
        }

        if (!condominiosResponse.ok || !Array.isArray(condominiosResponse.data)) {
          setCondominios([]);
        } else {
          const result = (condominiosResponse.data as Condominio[]).map(
            (condominio) => ({
              id: condominio.id,
              name: condominio.name,
              status: condominio.status,
            })
          );

          setCondominios(result);

          if (
            condominioFilter !== "ALL" &&
            !isValidCondominioFilter(condominioFilter, result)
          ) {
            setCondominioFilter("ALL");
            setPage(1);
            setForm((prev) => ({
              ...prev,
              condominiumId: "",
            }));

            if (typeof window !== "undefined") {
              window.history.replaceState(null, "", "/admin/unidades");
            }

            showError(
              "O condomínio informado no filtro não foi encontrado nesta carteira."
            );
          }
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) {
          return;
        }

        console.error(err);
        showError("Erro ao carregar unidades.");
        setUnidades([]);
        setCondominios([]);
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
    applyUnidadesResponse,
    condominioFilter,
    page,
    pageSize,
    showError,
  ]);



  /* =========================================================
     CONDOMÍNIOS ATIVOS PARA SELECT
     ========================================================= */

  const activeCondominios = useMemo(() => {
    return condominios.filter((condominio) => {
      return !condominio.status || condominio.status === "ACTIVE";
    });
  }, [condominios]);



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
     MÉTRICAS

     Observação:
     - A base das métricas considera a página atual carregada
       via server-side.
     - O total geral da seleção vem da paginação.
     ========================================================= */

  const metrics = useMemo(() => {
    return {
      total: pagination.total || unidades.length,
      pageTotal: unidades.length,
      active: unidades.filter((item) => item.status === "ACTIVE").length,
      inactive: unidades.filter((item) => item.status === "INACTIVE").length,
      condominiums: new Set(unidades.map((item) => item.condominiumId)).size,

      residentsTotal: unidades.reduce(
        (sum, item) => sum + Number(item.totalResidents || 0),
        0
      ),

      residentsActive: unidades.reduce(
        (sum, item) =>
          sum + Number(item.activeResidents ?? item.totalResidents ?? 0),
        0
      ),

      tickets: unidades.reduce(
        (sum, item) => sum + Number(item.totalTickets || 0),
        0
      ),

      openTickets: unidades.reduce(
        (sum, item) => sum + Number(item.openTickets || 0),
        0
      ),
    };
  }, [unidades, pagination.total]);



  /* =========================================================
     FILTRO LOCAL DA PÁGINA ATUAL
     ========================================================= */

  const filteredUnidades = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return unidades.filter((unidade) => {
      const searchable = [
        unidade.condominium?.name,
        unidade.block,
        unidade.unitNumber,
        unidade.unitType,
        unidade.status,
        statusLabel(unidade.status),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !term || searchable.includes(term);

      return matchesSearch;
    });
  }, [unidades, searchTerm]);



  /* =========================================================
     CARREGAMENTO
     ========================================================= */

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando unidades..."
        description="Aguarde enquanto identificamos seu perfil de acesso e carregamos as unidades vinculadas aos condomínios."
      />
    );
  }



  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <AdminShell
      current="unidades"
      title="Unidades"
      description="Gerencie apartamentos, casas ou salas vinculadas aos condomínios."
    >
      <div className="space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
              Cadastros
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
              Unidades
            </h1>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
              Gerencie apartamentos, casas, salas, lojas e demais unidades
              vinculadas aos condomínios da carteira administrativa.
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
            Nova unidade
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
                  Exibindo apenas unidades deste condomínio. A consulta já está
                  filtrada no servidor para evitar listas grandes.
                </p>
              </div>

              <button
                type="button"
                onClick={clearCondominioFilter}
                className="inline-flex h-11 w-fit items-center justify-center rounded-2xl border border-[#CFE6D4] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
              >
                Limpar filtro
              </button>
            </div>
          </section>
        )}



        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#17211B]/65 p-4 backdrop-blur-sm">
            <div className="my-6 max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-[#DDE5DF] bg-white p-6 shadow-2xl">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-[#17211B]">
                    Nova unidade
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                    Cadastre uma nova unidade vinculada a um condomínio ativo.
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

              <form onSubmit={createUnidade} className="space-y-4">
                <UnidadeFormFields
                  form={form}
                  setForm={setForm}
                  condominios={activeCondominios}
                />

                <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-4 text-sm leading-6 text-[#5E6B63]">
                  A combinação de condomínio, bloco e número deve ser única.
                  Exemplo: Condomínio Demo, Bloco A, Unidade 101.
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
                    {creating ? "Criando..." : "Criar unidade"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}



        {editModalOpen && selectedUnidade && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#17211B]/65 p-4 backdrop-blur-sm">
            <div className="my-6 max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-[#DDE5DF] bg-white p-6 shadow-2xl">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-[#17211B]">
                    Editar unidade
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                    Atualize o condomínio, identificação, tipo ou status da
                    unidade.
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

              <form onSubmit={updateUnidade} className="space-y-4">
                <UnidadeFormFields
                  form={editForm}
                  setForm={setEditForm}
                  condominios={activeCondominios}
                />

                <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-4 text-sm leading-6 text-[#5E6B63]">
                  Ao alterar condomínio, bloco ou número, o sistema valida se já
                  existe outra unidade igual no condomínio selecionado.
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
                  Resumo das unidades retornadas pela consulta atual. A listagem
                  usa paginação server-side para manter a página leve mesmo em
                  condomínios grandes.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:min-w-[620px] xl:grid-cols-4">
                <QueueMetricBox
                  title="Total"
                  value={metrics.total}
                  description="Na seleção atual."
                  highlighted
                />

                <QueueMetricBox
                  title="Nesta página"
                  value={metrics.pageTotal}
                  description={`Limite de ${pagination.limit}.`}
                  highlighted
                />

                <QueueMetricBox
                  title="Ativas"
                  value={metrics.active}
                  description="Na página atual."
                />

                <QueueMetricBox
                  title="Moradores"
                  value={metrics.residentsActive}
                  description="Vínculos ativos na página."
                />
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
                Chamados vinculados
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                {metrics.tickets} chamado(s) vinculados às unidades desta página.
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Resultado local
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                Exibindo{" "}
                <strong className="text-[#17211B]">
                  {filteredUnidades.length}
                </strong>{" "}
                unidade(s) após busca local nesta página.
              </p>
            </div>
          </div>
        </section>



        <ResponsiveSection
          title="Busca e Filtros"
          description="Localize unidades por condomínio, bloco, número, tipo ou status."
          defaultOpenMobile
        >
          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <label className="text-sm font-semibold text-[#17211B]">
                  Buscar unidade
                </label>

                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="form-input mt-1"
                  placeholder="Buscar na página atual por condomínio, bloco, número, tipo ou status..."
                />

                <p className="mt-2 text-xs leading-5 text-[#7A877F]">
                  A busca textual filtra os registros já carregados nesta página.
                  O filtro por condomínio é aplicado no servidor.
                </p>
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
                      {condominio.status === "INACTIVE" ? " — Inativo" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 text-sm text-[#5E6B63] lg:flex-row lg:items-center lg:justify-between">
              <p>
                Exibindo{" "}
                <strong className="text-[#17211B]">
                  {filteredUnidades.length}
                </strong>{" "}
                de{" "}
                <strong className="text-[#17211B]">{unidades.length}</strong>{" "}
                unidade(s) carregadas nesta página. Total da seleção:{" "}
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



        {filteredUnidades.length === 0 ? (
          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-8 text-center shadow-sm">
            <h2 className="mb-2 text-2xl font-semibold text-[#17211B]">
              Nenhuma Unidade Encontrada
            </h2>

            <p className="mx-auto max-w-2xl text-sm leading-6 text-[#5E6B63]">
              Não encontramos unidades com os filtros atuais. Tente limpar a
              busca local, trocar o condomínio ou cadastrar uma nova unidade.
            </p>
          </section>
        ) : (
          <ResponsiveSection
            title="Unidades da Carteira"
            description="Lista operacional das unidades conforme filtros e paginação aplicados."
            defaultOpenMobile
          >
            <div className="space-y-3">
              {filteredUnidades.map((unidade) => (
                <article
                  key={unidade.id}
                  className="rounded-[24px] border border-[#DDE5DF] bg-white p-5 shadow-sm transition hover:border-[#256D3C]/30 hover:shadow-[0_14px_38px_rgba(23,33,27,0.07)]"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                            unidade.status
                          )}`}
                        >
                          {statusLabel(unidade.status)}
                        </span>

                        <span className="rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-semibold text-[#5E6B63]">
                          {unidade.unitType || "Unidade"}
                        </span>

                        {Number(unidade.openTickets || 0) > 0 && (
                          <span className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700">
                            {unidade.openTickets} aberto(s)
                          </span>
                        )}
                      </div>

                      <h2 className="break-words text-xl font-semibold tracking-tight text-[#17211B] md:text-2xl">
                        {getUnitLabel(unidade)}
                      </h2>

                      <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                        {getUnitContextLine(unidade)}
                      </p>

                      <p className="mt-2 text-xs text-[#7A877F]">
                        Moradores ativos:{" "}
                        <strong className="text-[#5E6B63]">
                          {unidade.activeResidents ?? unidade.totalResidents ?? 0}
                        </strong>{" "}
                        • Chamados:{" "}
                        <strong className="text-[#5E6B63]">
                          {unidade.totalTickets || 0}
                        </strong>
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-start gap-2 xl:w-[160px] xl:flex-col">
                      <button
                        type="button"
                        onClick={() => openEditModal(unidade)}
                        className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleStatus(unidade)}
                        disabled={updatingId === unidade.id}
                        className={
                          unidade.status === "ACTIVE"
                            ? "inline-flex h-11 w-full items-center justify-center rounded-2xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                            : "inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                        }
                      >
                        {updatingId === unidade.id
                          ? "Atualizando..."
                          : unidade.status === "ACTIVE"
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
                          label="Condomínio"
                          value={unidade.condominium?.name || "-"}
                        />

                        <InfoLine label="Tipo" value={unidade.unitType || "-"} />
                        <InfoLine
                          label="Bloco / Torre"
                          value={unidade.block || "-"}
                        />
                        <InfoLine label="Número" value={unidade.unitNumber} />

                        <InfoLine
                          label="Moradores"
                          value={
                            unidade.activeResidents ?? unidade.totalResidents ?? 0
                          }
                        />

                        <InfoLine
                          label="Total moradores"
                          value={unidade.totalResidents || 0}
                        />

                        <InfoLine
                          label="Chamados"
                          value={unidade.totalTickets || 0}
                        />

                        <InfoLine
                          label="Chamados abertos"
                          value={unidade.openTickets || 0}
                        />

                        <InfoLine
                          label="Criada em"
                          value={new Date(unidade.createdAt).toLocaleString(
                            "pt-BR"
                          )}
                        />

                        <InfoLine label="ID da unidade" value={unidade.id} />
                      </div>
                    </div>
                  </details>
                </article>
              ))}
            </div>



            <PaginationControls
              pagination={pagination}
              loading={listLoading}
              onPrevious={goToPreviousPage}
              onNext={goToNextPage}
            />
          </ResponsiveSection>
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
   COMPONENTE REUTILIZÁVEL DOS CAMPOS DO FORMULÁRIO
   ========================================================= */

function UnidadeFormFields({
  form,
  setForm,
  condominios,
}: {
  form: UnidadeFormState;
  setForm: Dispatch<SetStateAction<UnidadeFormState>>;
  condominios: Condominio[];
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

        {condominios.length === 0 && (
          <p className="mt-2 text-xs text-yellow-700">
            Nenhum condomínio ativo disponível. Cadastre ou reative um
            condomínio antes de criar unidades.
          </p>
        )}
      </FormField>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="Bloco / Torre">
          <input
            value={form.block}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                block: normalizeBlock(e.target.value),
              }))
            }
            className="form-input uppercase"
            placeholder="Ex: A, B, TORRE 1"
          />
        </FormField>

        <FormField label="Número da unidade" required>
          <input
            value={form.unitNumber}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                unitNumber: normalizeUnitNumber(e.target.value),
              }))
            }
            className="form-input uppercase"
            placeholder="Ex: 101, 202, CASA 03"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="Tipo da unidade">
          <select
            value={form.unitType}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                unitType: e.target.value,
              }))
            }
            className="form-input"
          >
            <option value="Apartamento">Apartamento</option>
            <option value="Casa">Casa</option>
            <option value="Sala comercial">Sala comercial</option>
            <option value="Loja">Loja</option>
            <option value="Garagem">Garagem</option>
            <option value="Outro">Outro</option>
          </select>
        </FormField>

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
            <option value="ACTIVE">Ativa</option>
            <option value="INACTIVE">Inativa</option>
          </select>
        </FormField>
      </div>
    </>
  );
}



/* =========================================================
   CARD PRINCIPAL DA VISÃO DA CARTEIRA
   ========================================================= */

function QueueMetricBox({
  title,
  value,
  description,
  highlighted = false,
}: {
  title: string;
  value: number;
  description?: string;
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

      {description && (
        <p className="mt-1 text-xs text-[#5E6B63]">
          {description}
        </p>
      )}
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
            Total de {pagination.total} unidade(s) na seleção atual. Exibindo até{" "}
            {pagination.limit} por página.
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

      <div className="mt-1">
        {children}
      </div>
    </div>
  );
}