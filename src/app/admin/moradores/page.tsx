"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

   Ajustes aplicados:
   - padrão brasileiro para tipo de morador:
     PROPRIETARIO, INQUILINO, FAMILIAR, RESPONSAVEL, OUTRO;
   - máscara de CPF;
   - máscara de telefone;
   - validação visual de CPF e e-mail;
   - busca por CPF/telefone com ou sem máscara;
   - mensagens de sucesso após criar/editar/inativar/reativar;
   - botões e estados de envio melhorados;
   - reset mais seguro dos formulários;
   - alinhamento visual com o cadastro de condomínios.

   ETAPA 39.9 — NOVO VISUAL COM ADMINSHELL

   Atualização:
   - Página passa a usar AdminShell.
   - Removido AdminTopActions da própria página.
   - Topbar, sidebar, sino, logout e footer ficam no shell.
   - Layout migrado do tema escuro antigo para o padrão claro EloGest.
   - Cards, filtros, listagem, modais e formulários recebem visual novo.
   - Mantida toda a lógica funcional já existente.

   ETAPA 39.17.10 — PADRONIZAÇÃO DO CARREGAMENTO

   Atualização:
   - Loading inicial passa a usar EloGestLoadingScreen.
   - Evita montar AdminShell durante carregamento inicial.
   - Mantém AdminShell apenas após os dados principais carregarem.
   - Mantidas listagem, filtros, métricas, modais e ações existentes.

   ETAPA 41 — REFINAMENTO PREMIUM DOS CADASTROS

   Ajustes desta revisão:
   - Página segue o mesmo padrão visual aprovado em Condomínios e Unidades.
   - Título principal fica fora do card de visão.
   - Card superior passa a ser "Visão da Carteira".
   - Métricas ficam mais neutras e menos coloridas.
   - Lista de moradores fica mais compacta.
   - Informações secundárias ficam dentro de "Mais Informações".
   - Mantida toda a lógica funcional de filtros, criação, edição, status e acesso.
   ========================================================= */

interface Condominio {
  id: string;
  name: string;
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
  status: string;
}

const emptyForm: MoradorFormState = {
  condominiumId: "",
  unitId: "",
  name: "",
  cpf: "",
  email: "",
  phone: "",
  residentType: "PROPRIETARIO",
  status: "ACTIVE",
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
    9,
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

  return "";
}

function buildPayload(form: MoradorFormState) {
  return {
    unitId: form.unitId,
    name: form.name.trim(),
    cpf: form.cpf ? onlyDigits(form.cpf) : null,
    email: form.email.trim().toLowerCase() || null,
    phone: form.phone ? onlyDigits(form.phone) : null,
    residentType: form.residentType || null,
    status: form.status || "ACTIVE",
  };
}

/* =========================================================
   PÁGINA
   ========================================================= */

export default function MoradoresPage() {
  const router = useRouter();

  const [moradores, setMoradores] = useState<Morador[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [managingAccessId, setManagingAccessId] = useState<string | null>(null);

  const [selectedMorador, setSelectedMorador] = useState<Morador | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [condominioFilter, setCondominioFilter] = useState("ALL");
  const [unidadeFilter, setUnidadeFilter] = useState("ALL");

  const [form, setForm] = useState<MoradorFormState>(emptyForm);
  const [editForm, setEditForm] = useState<MoradorFormState>(emptyForm);

  /* =========================================================
     MENSAGENS
     ========================================================= */

  function showSuccess(message: string) {
    setSuccess(message);
    setError("");

    window.setTimeout(() => {
      setSuccess("");
    }, 4500);
  }

  function showError(message: string) {
    setError(message);
    setSuccess("");
  }

  /* =========================================================
     CARREGAR MORADORES
     ========================================================= */

  async function loadMoradores() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/admin/moradores", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        showError(data?.error || "Erro ao carregar moradores.");
        setMoradores([]);
        return;
      }

      if (!Array.isArray(data)) {
        showError("Resposta inválida da API.");
        setMoradores([]);
        return;
      }

      setMoradores(data);
    } catch (err) {
      console.error(err);
      showError("Erro ao carregar moradores.");
      setMoradores([]);
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     CARREGAR CONDOMÍNIOS PARA SELECT
     ========================================================= */

  async function loadCondominios() {
    try {
      const res = await fetch("/api/admin/condominios", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok || !Array.isArray(data)) {
        setCondominios([]);
        return;
      }

      setCondominios(
        data.map((condominio: any) => ({
          id: condominio.id,
          name: condominio.name,
        })),
      );
    } catch (err) {
      console.error(err);
      setCondominios([]);
    }
  }

  /* =========================================================
     CARREGAR UNIDADES PARA SELECT
     ========================================================= */

  async function loadUnidades() {
    try {
      const res = await fetch("/api/admin/unidades", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok || !Array.isArray(data)) {
        setUnidades([]);
        return;
      }

      setUnidades(
        data.map((unidade: any) => ({
          id: unidade.id,
          condominiumId: unidade.condominiumId,
          block: unidade.block,
          unitNumber: unidade.unitNumber,
          unitType: unidade.unitType,
          condominium: unidade.condominium,
        })),
      );
    } catch (err) {
      console.error(err);
      setUnidades([]);
    }
  }

  /* =========================================================
     CRIAR MORADOR
     ========================================================= */

  async function createMorador(e: React.FormEvent) {
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

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Erro ao criar morador.");
        return;
      }

      setForm(emptyForm);
      setModalOpen(false);

      await loadMoradores();

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
      residentType: morador.residentType || "PROPRIETARIO",
      status: morador.status || "ACTIVE",
    });

    setEditModalOpen(true);
  }

  /* =========================================================
     FECHAR MODAIS
     ========================================================= */

  function closeCreateModal() {
    if (creating) return;

    setForm(emptyForm);
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

  async function updateMorador(e: React.FormEvent) {
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

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Erro ao atualizar morador.");
        return;
      }

      setSelectedMorador(null);
      setEditModalOpen(false);
      setEditForm(emptyForm);

      await loadMoradores();

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

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Erro ao atualizar status.");
        return;
      }

      await loadMoradores();

      showSuccess(
        nextStatus === "INACTIVE"
          ? "Morador inativado com sucesso."
          : "Morador reativado com sucesso.",
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

     Decide automaticamente:
     - editar usuário vinculado
     - editar usuário existente por e-mail
     - criar novo usuário
     ========================================================= */

  async function manageAccess(morador: Morador) {
    try {
      setManagingAccessId(morador.id);

      const res = await fetch(`/api/admin/moradores/${morador.id}/acesso`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Erro ao gerenciar acesso do morador.");
        return;
      }

      if (!data?.url) {
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
     INIT
     ========================================================= */

  useEffect(() => {
    loadMoradores();
    loadCondominios();
    loadUnidades();
  }, []);

  /* =========================================================
     HELPERS
     ========================================================= */

  const statusLabel = (status?: string | null) =>
    ({
      ACTIVE: "Ativo",
      INACTIVE: "Inativo",
    })[status || ""] ||
    status ||
    "-";

  const statusClass = (status?: string | null) =>
    status === "ACTIVE"
      ? "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]"
      : "border-red-200 bg-red-50 text-red-700";

  const residentTypeLabel = (type?: string | null) =>
    ({
      PROPRIETARIO: "Proprietário",
      INQUILINO: "Inquilino",
      FAMILIAR: "Familiar",
      RESPONSAVEL: "Responsável",
      OUTRO: "Outro",
    })[type || ""] ||
    type ||
    "-";

  function getUnitLabel(unidade?: Unidade | null) {
    if (!unidade) return "-";

    return `${unidade.block ? `Bloco ${unidade.block} - ` : ""}Unidade ${
      unidade.unitNumber
    }`;
  }

  /* =========================================================
     UNIDADES FILTRADAS PARA O FORMULÁRIO DE CRIAÇÃO
     ========================================================= */

  const unidadesDoFormulario = useMemo(() => {
    if (!form.condominiumId) return [];

    return unidades.filter(
      (unidade) => unidade.condominiumId === form.condominiumId,
    );
  }, [unidades, form.condominiumId]);

  /* =========================================================
     UNIDADES FILTRADAS PARA O FORMULÁRIO DE EDIÇÃO
     ========================================================= */

  const unidadesDoEditFormulario = useMemo(() => {
    if (!editForm.condominiumId) return [];

    return unidades.filter(
      (unidade) => unidade.condominiumId === editForm.condominiumId,
    );
  }, [unidades, editForm.condominiumId]);

  /* =========================================================
     UNIDADES FILTRADAS PARA FILTRO DA LISTAGEM
     ========================================================= */

  const unidadesDoFiltro = useMemo(() => {
    if (condominioFilter === "ALL") return unidades;

    return unidades.filter(
      (unidade) => unidade.condominiumId === condominioFilter,
    );
  }, [unidades, condominioFilter]);

  /* =========================================================
     MÉTRICAS
     ========================================================= */

  const metrics = useMemo(() => {
    return {
      total: moradores.length,
      active: moradores.filter((item) => item.status === "ACTIVE").length,
      inactive: moradores.filter((item) => item.status === "INACTIVE").length,
      withUser: moradores.filter((item) => item.hasUser).length,
      withoutUser: moradores.filter((item) => !item.hasUser).length,
      tickets: moradores.reduce(
        (sum, item) => sum + Number(item.totalTickets || 0),
        0,
      ),
      openTickets: moradores.reduce(
        (sum, item) => sum + Number(item.openTickets || 0),
        0,
      ),
    };
  }, [moradores]);

  /* =========================================================
     FILTROS
     ========================================================= */

  const filteredMoradores = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const termDigits = onlyDigits(searchTerm);

    return moradores.filter((morador) => {
      const matchesCondominio =
        condominioFilter === "ALL" ||
        morador.condominiumId === condominioFilter;

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

      return matchesCondominio && matchesUnidade && matchesSearch;
    });
  }, [moradores, searchTerm, condominioFilter, unidadeFilter]);

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
        {/* =====================================================
            TÍTULO DA PÁGINA
            ===================================================== */}

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
              setForm(emptyForm);
              setModalOpen(true);
            }}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32] focus:outline-none focus:ring-4 focus:ring-[#256D3C]/20"
          >
            Novo Morador
          </button>
        </header>

        {/* =====================================================
            MENSAGENS
            ===================================================== */}

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
            MODAL - NOVO MORADOR
            ===================================================== */}

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

        {/* =====================================================
            MODAL - EDITAR MORADOR
            ===================================================== */}

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

        {/* =====================================================
            VISÃO DA CARTEIRA
            ===================================================== */}

        <section className="overflow-hidden rounded-[32px] border border-[#DDE5DF] bg-white shadow-sm">
          <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_62%,#EAF7EE_135%)] p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-[#17211B] md:text-3xl">
                  Visão da Carteira
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                  Resumo dos moradores cadastrados, vínculos de acesso ao
                  portal, chamados e pendências principais da base residencial.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:min-w-[620px] xl:grid-cols-4">
                <MetricCard title="Total" value={metrics.total} highlighted />
                <MetricCard title="Ativos" value={metrics.active} highlighted />
                <MetricCard title="Com Acesso" value={metrics.withUser} />
                <MetricCard title="Sem Acesso" value={metrics.withoutUser} />
              </div>
            </div>
          </div>

          <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Moradores Inativos
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                {metrics.inactive > 0
                  ? `${metrics.inactive} cadastro(s) inativo(s) na carteira.`
                  : "Todos os moradores listados estão ativos."}
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Chamados Vinculados
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                {metrics.tickets > 0
                  ? `${metrics.tickets} chamado(s) vinculados aos moradores cadastrados.`
                  : "Nenhum chamado vinculado aos moradores cadastrados."}
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Resultado Atual
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                Exibindo{" "}
                <strong className="text-[#17211B]">
                  {filteredMoradores.length}
                </strong>{" "}
                morador(es) conforme filtros aplicados.
              </p>
            </div>
          </div>
        </section>

        {/* =====================================================
            BUSCA E FILTROS
            ===================================================== */}

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
                  Refine a carteira por texto, condomínio ou unidade.
                </p>
              </div>

              {(searchTerm ||
                condominioFilter !== "ALL" ||
                unidadeFilter !== "ALL") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setCondominioFilter("ALL");
                    setUnidadeFilter("ALL");
                  }}
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
                  placeholder="Buscar por nome, CPF, e-mail, telefone, unidade..."
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-[#17211B]">
                  Condomínio
                </label>

                <select
                  value={condominioFilter}
                  onChange={(e) => {
                    setCondominioFilter(e.target.value);
                    setUnidadeFilter("ALL");
                  }}
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

            <p className="mt-4 text-sm text-[#5E6B63]">
              Exibindo{" "}
              <strong className="text-[#17211B]">
                {filteredMoradores.length}
              </strong>{" "}
              de <strong className="text-[#17211B]">{moradores.length}</strong>{" "}
              morador(es).
            </p>
          </section>
        </ResponsiveSection>

        {/* =====================================================
            LISTAGEM
            ===================================================== */}

        <ResponsiveSection
          title="Moradores da Carteira"
          description="Lista compacta dos moradores conforme filtros aplicados."
          defaultOpenMobile
        >
          {filteredMoradores.length === 0 ? (
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-8 text-center shadow-sm">
              <h2 className="mb-2 text-2xl font-semibold text-[#17211B]">
                Nenhum Morador Encontrado
              </h2>

              <p className="mx-auto max-w-2xl text-sm leading-6 text-[#5E6B63]">
                Não encontramos moradores com os filtros atuais. Tente limpar os
                filtros ou cadastrar um novo morador.
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
                            morador.status,
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
                            "pt-BR",
                          )}
                        />
                      </div>
                    </div>
                  </details>
                </article>
              ))}
            </div>
          )}
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
      `}</style>
    </AdminShell>
  );
}

/* =========================================================
   COMPONENTE REUTILIZÁVEL DOS CAMPOS DO FORMULÁRIO

   Usado tanto no cadastro quanto na edição.
   ========================================================= */

function MoradorFormFields({
  form,
  setForm,
  condominios,
  unidadesFiltradas,
  getUnitLabel,
}: {
  form: MoradorFormState;
  setForm: React.Dispatch<React.SetStateAction<MoradorFormState>>;
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

        <FormField label="Tipo de morador">
          <select
            value={form.residentType}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                residentType: e.target.value,
              }))
            }
            className="form-input"
          >
            <option value="PROPRIETARIO">Proprietário</option>
            <option value="INQUILINO">Inquilino</option>
            <option value="FAMILIAR">Familiar</option>
            <option value="RESPONSAVEL">Responsável</option>
            <option value="OUTRO">Outro</option>
          </select>
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
  tone?: "default" | "green" | "red" | "blue" | "yellow" | "purple";
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
   MINI CARD
   ========================================================= */

function InfoMiniCard({
  label,
  value,
  footer,
  tone = "default",
}: {
  label: string;
  value: number | string;
  footer?: string;
  tone?: "default" | "yellow";
}) {
  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-3">
      <p className="text-xs text-[#7A877F]">{label}</p>

      <strong
        className={
          tone === "yellow"
            ? "text-lg font-semibold text-yellow-700"
            : "text-lg font-semibold text-[#17211B]"
        }
      >
        {value}
      </strong>

      {footer && <p className="text-xs text-[#9AA7A0]">{footer}</p>}
    </div>
  );
}

/* =========================================================
   LINHA DE INFORMAÇÃO DO MENU SUSPENSO
   ========================================================= */

function InfoLine({ label, value }: { label: string; value: string | number }) {
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
   BOX DE INFORMAÇÃO
   ========================================================= */

function InfoBox({
  label,
  value,
  description,
}: {
  label: string;
  value: string | number;
  description?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-4">
      <p className="text-sm text-[#7A877F]">{label}</p>

      <strong className="break-words text-[#17211B]">{value}</strong>

      {description && (
        <p className="mt-1 text-xs text-[#7A877F]">{description}</p>
      )}
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
  children: React.ReactNode;
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
