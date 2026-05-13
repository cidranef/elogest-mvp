"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/AdminShell";
import ResponsiveSection from "@/components/ui/ResponsiveSection";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";



/* =========================================================
   CONDOMÍNIOS - PÁGINA ADMINISTRATIVA

   ETAPA 15.1:
   - Listagem de condomínios
   - Busca
   - KPIs
   - Cadastro via modal

   ETAPA 15.5.1:
   - Edição de condomínio
   - Ativar / inativar condomínio

   ETAPA 15.6.4:
   - Busca automática de endereço pelo CEP
   - Preenche endereço, bairro, cidade e UF

   ETAPA 35.1:
   Refinamento do cadastro base de condomínios.

   ETAPA 39.7 — NOVO VISUAL COM ADMINSHELL

   Atualização:
   - Página passa a usar AdminShell.
   - Removido AdminTopActions da própria página.
   - Topbar, sidebar, sino, logout e footer ficam no shell.
   - Layout migrado do tema escuro antigo para o padrão claro EloGest.
   - Cards, busca, listagem, modais e formulários recebem visual novo.
   - Mantida toda a lógica funcional já existente.

   ETAPA 39.17.8 — PADRONIZAÇÃO DO CARREGAMENTO

   Atualização:
   - Loading inicial passa a usar EloGestLoadingScreen.
   - Evita montar AdminShell durante carregamento inicial.
   - Mantém AdminShell apenas após os dados principais carregarem.
   - Mantidas listagem, filtros, métricas, modais e ações existentes.
   ========================================================= */



interface Administradora {
  id: string;
  name: string;
}

interface Condominio {
  id: string;
  administratorId: string;
  administrator?: Administradora | null;

  name: string;
  cnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  cep?: string | null;
  address?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  status: string;
  createdAt: string;

  totalUnits?: number;
  activeUnits?: number;

  totalResidents?: number;
  activeResidents?: number;

  totalTickets?: number;
  openTickets?: number;
}

interface CondominioFormState {
  name: string;
  cnpj: string;
  email: string;
  phone: string;
  cep: string;
  address: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  status: string;
}



const emptyForm: CondominioFormState = {
  name: "",
  cnpj: "",
  email: "",
  phone: "",
  cep: "",
  address: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "SP",
  status: "ACTIVE",
};



/* =========================================================
   HELPERS GERAIS
   ========================================================= */

function onlyDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}



function formatCnpj(value: string) {
  const digits = onlyDigits(value).slice(0, 14);

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



function validateCondominioForm(form: CondominioFormState) {
  if (!form.name.trim()) {
    return "Informe o nome do condomínio.";
  }

  if (form.cnpj && onlyDigits(form.cnpj).length !== 14) {
    return "Informe um CNPJ válido com 14 dígitos.";
  }

  if (form.email && !isValidEmail(form.email)) {
    return "Informe um e-mail válido.";
  }

  if (form.cep && onlyDigits(form.cep).length !== 8) {
    return "Informe um CEP válido com 8 dígitos.";
  }

  if (form.state && form.state.trim().length !== 2) {
    return "Informe a UF com 2 letras. Exemplo: SP.";
  }

  return "";
}



function buildPayload(form: CondominioFormState) {
  return {
    name: form.name.trim(),
    cnpj: form.cnpj ? formatCnpj(form.cnpj) : null,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    cep: form.cep.trim() || null,
    address: form.address.trim() || null,
    number: form.number.trim() || null,
    complement: form.complement.trim() || null,
    district: form.district.trim() || null,
    city: form.city.trim() || null,
    state: form.state.trim().toUpperCase() || null,
    status: form.status || "ACTIVE",
  };
}



/* =========================================================
   PÁGINA
   ========================================================= */

export default function CondominiosPage() {
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [selectedCondominio, setSelectedCondominio] =
    useState<Condominio | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  const [form, setForm] = useState<CondominioFormState>(emptyForm);
  const [editForm, setEditForm] = useState<CondominioFormState>(emptyForm);



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
     CARREGAR CONDOMÍNIOS
     ========================================================= */

  async function loadCondominios() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/admin/condominios", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        showError(data?.error || "Erro ao carregar condomínios.");
        setCondominios([]);
        return;
      }

      if (!Array.isArray(data)) {
        showError("Resposta inválida da API.");
        setCondominios([]);
        return;
      }

      setCondominios(data);
    } catch (err) {
      console.error(err);
      showError("Erro ao carregar condomínios.");
      setCondominios([]);
    } finally {
      setLoading(false);
    }
  }



  /* =========================================================
     CRIAR CONDOMÍNIO
     ========================================================= */

  async function createCondominio(e: React.FormEvent) {
    e.preventDefault();

    const validationMessage = validateCondominioForm(form);

    if (validationMessage) {
      alert(validationMessage);
      return;
    }

    try {
      setCreating(true);

      const res = await fetch("/api/admin/condominios", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload(form)),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Erro ao criar condomínio.");
        return;
      }

      setForm(emptyForm);
      setModalOpen(false);

      await loadCondominios();

      showSuccess("Condomínio criado com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao criar condomínio.");
    } finally {
      setCreating(false);
    }
  }



  /* =========================================================
     ABRIR MODAL DE EDIÇÃO
     ========================================================= */

  function openEditModal(condominio: Condominio) {
    setSelectedCondominio(condominio);

    setEditForm({
      name: condominio.name || "",
      cnpj: condominio.cnpj || "",
      email: condominio.email || "",
      phone: condominio.phone || "",
      cep: condominio.cep || "",
      address: condominio.address || "",
      number: condominio.number || "",
      complement: condominio.complement || "",
      district: condominio.district || "",
      city: condominio.city || "",
      state: condominio.state || "SP",
      status: condominio.status || "ACTIVE",
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

    setSelectedCondominio(null);
    setEditForm(emptyForm);
    setEditModalOpen(false);
  }



  /* =========================================================
     ATUALIZAR CONDOMÍNIO
     ========================================================= */

  async function updateCondominio(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedCondominio) return;

    const validationMessage = validateCondominioForm(editForm);

    if (validationMessage) {
      alert(validationMessage);
      return;
    }

    try {
      setUpdating(true);

      const res = await fetch(
        `/api/admin/condominios/${selectedCondominio.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildPayload(editForm)),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Erro ao atualizar condomínio.");
        return;
      }

      setSelectedCondominio(null);
      setEditModalOpen(false);
      setEditForm(emptyForm);

      await loadCondominios();

      showSuccess("Condomínio atualizado com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar condomínio.");
    } finally {
      setUpdating(false);
    }
  }



  /* =========================================================
     ATIVAR / INATIVAR
     ========================================================= */

  async function toggleStatus(condominio: Condominio) {
    const nextStatus = condominio.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

    const confirmMessage =
      nextStatus === "INACTIVE"
        ? `Deseja inativar o condomínio "${condominio.name}"?`
        : `Deseja reativar o condomínio "${condominio.name}"?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      setUpdatingId(condominio.id);

      const res = await fetch(`/api/admin/condominios/${condominio.id}`, {
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

      await loadCondominios();

      showSuccess(
        nextStatus === "INACTIVE"
          ? "Condomínio inativado com sucesso."
          : "Condomínio reativado com sucesso."
      );
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
    loadCondominios();
  }, []);



  /* =========================================================
     HELPERS
     ========================================================= */

  const statusLabel = (status?: string | null) =>
    ({
      ACTIVE: "Ativo",
      INACTIVE: "Inativo",
    }[status || ""] || status || "-");

  const statusClass = (status?: string | null) =>
    status === "ACTIVE"
      ? "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]"
      : "border-red-200 bg-red-50 text-red-700";

  function getAddressLabel(condominio: Condominio) {
    const parts = [
      condominio.address,
      condominio.number,
      condominio.district,
      condominio.city,
      condominio.state,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(", ") : "-";
  }



  /* =========================================================
     MÉTRICAS
     ========================================================= */

  const metrics = useMemo(() => {
    return {
      total: condominios.length,
      active: condominios.filter((item) => item.status === "ACTIVE").length,
      inactive: condominios.filter((item) => item.status === "INACTIVE").length,

      unitsTotal: condominios.reduce(
        (sum, item) => sum + Number(item.totalUnits || 0),
        0
      ),

      unitsActive: condominios.reduce(
        (sum, item) =>
          sum + Number(item.activeUnits ?? item.totalUnits ?? 0),
        0
      ),

      residentsTotal: condominios.reduce(
        (sum, item) => sum + Number(item.totalResidents || 0),
        0
      ),

      residentsActive: condominios.reduce(
        (sum, item) =>
          sum + Number(item.activeResidents ?? item.totalResidents ?? 0),
        0
      ),

      tickets: condominios.reduce(
        (sum, item) => sum + Number(item.totalTickets || 0),
        0
      ),

      openTickets: condominios.reduce(
        (sum, item) => sum + Number(item.openTickets || 0),
        0
      ),
    };
  }, [condominios]);



  /* =========================================================
     FILTRO
     ========================================================= */

  const filteredCondominios = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) return condominios;

    return condominios.filter((condominio) => {
      const searchable = [
        condominio.name,
        condominio.cnpj,
        condominio.email,
        condominio.phone,
        condominio.cep,
        condominio.address,
        condominio.district,
        condominio.city,
        condominio.state,
        condominio.administrator?.name,
        statusLabel(condominio.status),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(term);
    });
  }, [condominios, searchTerm]);



  /* =========================================================
     CARREGAMENTO
     ========================================================= */

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando condomínios..."
        description="Aguarde enquanto identificamos seu perfil de acesso e carregamos os condomínios da carteira administrativa."
      />
    );
  }



  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <AdminShell
      current="condominios"
      title="Condomínios"
      description="Gerencie os condomínios da carteira da administradora."
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
              Condomínios
            </h1>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
              Gerencie a carteira de condomínios, dados cadastrais, endereços,
              unidades, moradores e indicadores operacionais.
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
            Novo Condomínio
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
            MODAL - NOVO CONDOMÍNIO
            ===================================================== */}

        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#17211B]/65 p-4 backdrop-blur-sm">
            <div className="my-6 max-h-[calc(100vh-3rem)] w-full max-w-3xl overflow-y-auto rounded-[32px] border border-[#DDE5DF] bg-white p-6 shadow-2xl">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-[#17211B]">
                    Novo Condomínio
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                    Cadastre um novo condomínio na carteira. Informe o CEP para
                    preencher o endereço automaticamente.
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

              <form onSubmit={createCondominio} className="space-y-4">
                <CondominioFormFields form={form} setForm={setForm} />

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
                    {creating ? "Criando..." : "Criar Condomínio"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}



        {/* =====================================================
            MODAL - EDITAR CONDOMÍNIO
            ===================================================== */}

        {editModalOpen && selectedCondominio && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#17211B]/65 p-4 backdrop-blur-sm">
            <div className="my-6 max-h-[calc(100vh-3rem)] w-full max-w-3xl overflow-y-auto rounded-[32px] border border-[#DDE5DF] bg-white p-6 shadow-2xl">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-[#17211B]">
                    Editar Condomínio
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                    Atualize os dados cadastrais, endereço e status do condomínio.
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

              <form onSubmit={updateCondominio} className="space-y-4">
                <CondominioFormFields form={editForm} setForm={setEditForm} />

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
                    {updating ? "Salvando..." : "Salvar Alterações"}
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
                  Resumo da base administrada, com foco em condomínios ativos,
                  unidades, moradores e chamados em aberto.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:min-w-[620px] xl:grid-cols-4">
                <PortfolioMetricBox
                  title="Total"
                  value={metrics.total}
                  description="Condomínios cadastrados."
                  highlighted
                />

                <PortfolioMetricBox
                  title="Ativos"
                  value={metrics.active}
                  description="Em operação."
                  highlighted
                />

                <PortfolioMetricBox
                  title="Unidades"
                  value={metrics.unitsActive}
                  description="Unidades ativas."
                />

                <PortfolioMetricBox
                  title="Moradores"
                  value={metrics.residentsActive}
                  description="Moradores ativos."
                />
              </div>
            </div>
          </div>

          <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Status da carteira
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                <strong className="text-[#17211B]">{metrics.active}</strong> ativo(s) e{" "}
                <strong className="text-[#17211B]">{metrics.inactive}</strong> inativo(s).
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Base operacional
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                <strong className="text-[#17211B]">{metrics.unitsActive}</strong> unidade(s) ativa(s) e{" "}
                <strong className="text-[#17211B]">{metrics.residentsActive}</strong> morador(es) ativo(s).
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Chamados em aberto
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                <strong className="text-[#17211B]">{metrics.openTickets}</strong> chamado(s) ainda em aberto
                na carteira.
              </p>
            </div>
          </div>
        </section>



        {/* =====================================================
            BUSCA
            ===================================================== */}

        <ResponsiveSection
          title="Busca e Filtros"
          description="Localize condomínios por nome, CNPJ, CEP, cidade, bairro, e-mail ou status."
          defaultOpenMobile
        >
          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
            <label className="text-sm font-semibold text-[#17211B]">
              Buscar condomínio
            </label>

            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input mt-1"
              placeholder="Buscar por nome, CNPJ, CEP, cidade, bairro, e-mail, status..."
            />

            <p className="mt-3 text-sm text-[#5E6B63]">
              Exibindo{" "}
              <strong className="text-[#17211B]">
                {filteredCondominios.length}
              </strong>{" "}
              de{" "}
              <strong className="text-[#17211B]">{condominios.length}</strong>{" "}
              condomínio(s).
            </p>
          </section>
        </ResponsiveSection>



        {/* =====================================================
            LISTAGEM COMPACTA
            ===================================================== */}

        {filteredCondominios.length === 0 ? (
          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-8 text-center shadow-sm">
            <h2 className="mb-2 text-2xl font-semibold text-[#17211B]">
              Nenhum Condomínio Encontrado
            </h2>

            <p className="mx-auto max-w-2xl text-sm leading-6 text-[#5E6B63]">
              Não encontramos condomínios com a busca atual. Tente limpar o campo
              de busca ou cadastrar um novo condomínio.
            </p>
          </section>
        ) : (
          <div className="space-y-3">
            {filteredCondominios.map((condominio) => (
              <article
                key={condominio.id}
                className="rounded-[24px] border border-[#DDE5DF] bg-white p-5 shadow-sm transition hover:border-[#256D3C]/30 hover:shadow-[0_14px_38px_rgba(23,33,27,0.07)]"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                          condominio.status
                        )}`}
                      >
                        {statusLabel(condominio.status)}
                      </span>

                      {Number(condominio.openTickets || 0) > 0 && (
                        <span className="rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-semibold text-[#5E6B63]">
                          {condominio.openTickets} chamado(s) aberto(s)
                        </span>
                      )}
                    </div>

                    <h2 className="break-words text-xl font-semibold tracking-tight text-[#17211B] md:text-2xl">
                      {condominio.name}
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                      {getAddressLabel(condominio)}
                    </p>

                    <p className="mt-2 text-xs text-[#7A877F]">
                      Administradora: {condominio.administrator?.name || "-"} • CNPJ: {condominio.cnpj || "-"} • CEP: {condominio.cep || "-"}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-start gap-2 xl:w-[170px] xl:flex-col">
                    <button
                      type="button"
                      onClick={() => openEditModal(condominio)}
                      className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                    >
                      Editar
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleStatus(condominio)}
                      disabled={updatingId === condominio.id}
                      className={
                        condominio.status === "ACTIVE"
                          ? "inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                          : "inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                      }
                    >
                      {updatingId === condominio.id
                        ? "Atualizando..."
                        : condominio.status === "ACTIVE"
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
                        label="Unidades"
                        value={`${condominio.activeUnits ?? condominio.totalUnits ?? 0} ativas / ${condominio.totalUnits || 0} total`}
                      />

                      <InfoLine
                        label="Moradores"
                        value={`${condominio.activeResidents ?? condominio.totalResidents ?? 0} ativos / ${condominio.totalResidents || 0} total`}
                      />

                      <InfoLine
                        label="Chamados"
                        value={`${condominio.openTickets || 0} abertos / ${condominio.totalTickets || 0} total`}
                      />

                      <InfoLine
                        label="Criado em"
                        value={new Date(condominio.createdAt).toLocaleString("pt-BR")}
                      />

                      <InfoLine
                        label="Contato"
                        value={`${condominio.email || "-"}${
                          condominio.phone ? ` • ${condominio.phone}` : ""
                        }`}
                      />

                      <InfoLine
                        label="Cidade/UF"
                        value={`${condominio.city || "-"} / ${
                          condominio.state || "-"
                        }`}
                      />

                      <InfoLine
                        label="Bairro"
                        value={condominio.district || "-"}
                      />

                      <InfoLine
                        label="Complemento"
                        value={condominio.complement || "-"}
                      />
                    </div>
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
   COMPONENTE REUTILIZÁVEL DOS CAMPOS DO FORMULÁRIO

   Usado tanto no cadastro quanto na edição.

   CEP:
   - ao sair do campo com 8 dígitos, busca automaticamente.
   - botão "Buscar CEP" permite tentar manualmente.
   ========================================================= */

function CondominioFormFields({
  form,
  setForm,
}: {
  form: CondominioFormState;
  setForm: React.Dispatch<React.SetStateAction<CondominioFormState>>;
}) {
  const [cepLoading, setCepLoading] = useState(false);
  const [cepMessage, setCepMessage] = useState("");



  async function lookupCep(rawCep?: string) {
    const digits = onlyDigits(rawCep || form.cep);

    setCepMessage("");

    if (!digits) {
      return;
    }

    if (digits.length !== 8) {
      setCepMessage("Informe um CEP com 8 dígitos.");
      return;
    }

    try {
      setCepLoading(true);

      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);

      const data = await res.json();

      if (!res.ok || data?.erro) {
        setCepMessage("CEP não encontrado. Preencha o endereço manualmente.");
        return;
      }

      setForm((prev) => ({
        ...prev,
        cep: formatCep(digits),
        address: data.logradouro || prev.address,
        district: data.bairro || prev.district,
        city: data.localidade || prev.city,
        state: data.uf || prev.state,
      }));

      setCepMessage("Endereço preenchido automaticamente pelo CEP.");
    } catch (err) {
      console.error(err);
      setCepMessage("Não foi possível consultar o CEP agora.");
    } finally {
      setCepLoading(false);
    }
  }



  return (
    <>
      <FormField label="Nome do condomínio" required>
        <input
          value={form.name}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, name: e.target.value }))
          }
          className="form-input"
          placeholder="Ex: Condomínio Jardim das Flores"
        />
      </FormField>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="CNPJ">
          <input
            value={form.cnpj}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                cnpj: formatCnpj(e.target.value),
              }))
            }
            maxLength={18}
            className="form-input"
            placeholder="00.000.000/0000-00"
          />

          {form.cnpj && onlyDigits(form.cnpj).length !== 14 && (
            <p className="mt-1 text-xs text-yellow-700">
              CNPJ deve conter 14 dígitos.
            </p>
          )}
        </FormField>

        <FormField label="Status">
          <select
            value={form.status}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, status: e.target.value }))
            }
            className="form-input"
          >
            <option value="ACTIVE">Ativo</option>
            <option value="INACTIVE">Inativo</option>
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
            placeholder="contato@condominio.com"
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



      {/* =========================================================
          ENDEREÇO COM CEP AUTOMÁTICO
          ========================================================= */}

      <div className="space-y-4 rounded-[28px] border border-[#DDE5DF] bg-[#F6F8F7] p-4">
        <div>
          <h3 className="font-semibold text-[#17211B]">
            Endereço
          </h3>

          <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
            Informe o CEP para preencher rua, bairro, cidade e UF
            automaticamente. Número e complemento continuam manuais.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <FormField label="CEP">
            <input
              value={form.cep}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  cep: formatCep(e.target.value),
                }))
              }
              onBlur={() => {
                const digits = onlyDigits(form.cep);

                if (digits.length === 8) {
                  lookupCep(form.cep);
                }
              }}
              maxLength={9}
              className="form-input"
              placeholder="00000-000"
            />
          </FormField>

          <div className="flex items-end md:col-span-3">
            <button
              type="button"
              onClick={() => lookupCep(form.cep)}
              disabled={cepLoading}
              className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:bg-[#F6F8F7] disabled:text-[#9AA7A0] md:w-auto"
            >
              {cepLoading ? "Buscando..." : "Buscar CEP"}
            </button>
          </div>
        </div>

        {cepMessage && (
          <div
            className={
              cepMessage.includes("automaticamente")
                ? "rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] p-3 text-sm text-[#256D3C]"
                : "rounded-2xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800"
            }
          >
            {cepMessage}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="md:col-span-3">
            <FormField label="Endereço">
              <input
                value={form.address}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, address: e.target.value }))
                }
                className="form-input"
                placeholder="Rua / Avenida"
              />
            </FormField>
          </div>

          <FormField label="Número">
            <input
              value={form.number}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, number: e.target.value }))
              }
              className="form-input"
              placeholder="100"
            />
          </FormField>
        </div>

        <FormField label="Complemento">
          <input
            value={form.complement}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, complement: e.target.value }))
            }
            className="form-input"
            placeholder="Bloco, referência, observação..."
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormField label="Bairro">
            <input
              value={form.district}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, district: e.target.value }))
              }
              className="form-input"
              placeholder="Bairro"
            />
          </FormField>

          <FormField label="Cidade">
            <input
              value={form.city}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, city: e.target.value }))
              }
              className="form-input"
              placeholder="São Paulo"
            />
          </FormField>

          <FormField label="UF">
            <input
              value={form.state}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  state: e.target.value.toUpperCase().slice(0, 2),
                }))
              }
              maxLength={2}
              className="form-input uppercase"
              placeholder="SP"
            />
          </FormField>
        </div>
      </div>
    </>
  );
}




/* =========================================================
   CARD DE MÉTRICA DA VISÃO DA CARTEIRA
   ========================================================= */

function PortfolioMetricBox({
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
        "h-full rounded-2xl border bg-white p-4 text-left shadow-sm",
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
   CARD DE MÉTRICA
   ========================================================= */

function MetricCard({
  title,
  value,
  tone = "default",
}: {
  title: string;
  value: number;
  tone?: "default" | "green" | "red" | "blue" | "yellow";
}) {
  const toneClass =
    tone === "green"
      ? "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]"
      : tone === "red"
        ? "border-red-200 bg-red-50 text-red-700"
        : tone === "blue"
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : tone === "yellow"
            ? "border-yellow-200 bg-yellow-50 text-yellow-700"
            : "border-[#DDE5DF] bg-white text-[#17211B]";

  return (
    <div className={`rounded-[24px] border p-4 shadow-sm ${toneClass}`}>
      <p className="text-sm opacity-80">{title}</p>

      <strong className="mt-1 block text-3xl font-semibold">
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

      {footer && (
        <p className="text-xs text-[#9AA7A0]">
          {footer}
        </p>
      )}
    </div>
  );
}



/* =========================================================
   BOX DE INFORMAÇÃO
   ========================================================= */

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-4">
      <p className="text-sm text-[#7A877F]">{label}</p>

      <strong className="break-words text-[#17211B]">
        {value}
      </strong>
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
        {label}{" "}
        {required && <span className="text-red-600">*</span>}
      </label>

      <div className="mt-1">
        {children}
      </div>
    </div>
  );
}