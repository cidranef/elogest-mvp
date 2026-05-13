"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AdminShell from "@/components/AdminShell";
import ResponsiveSection from "@/components/ui/ResponsiveSection";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";



/* =========================================================
   USUÁRIOS - PÁGINA ADMINISTRATIVA

   ETAPA 15.6.8

   Ajustes anteriores:
   - SÍNDICO pode ter morador vinculado opcional
   - MORADOR continua exigindo morador vinculado
   - Ao selecionar morador, nome/e-mail são preenchidos automaticamente
   - Edição mantém o morador atualmente vinculado no select
   - Lê parâmetros vindos de /admin/moradores:
     /admin/usuarios?action=create&role=MORADOR&residentId=...
     /admin/usuarios?action=edit&userId=...
     /admin/usuarios?action=edit&userId=...&residentId=...
   - Ao cancelar/salvar vindo de /admin/moradores, volta para /admin/moradores
   - Remove IDs técnicos dos cards
   - Mostra vínculo do acesso de forma amigável

   ETAPA 35.4:
   Refinamento do fluxo morador x acesso ao portal.

   ETAPA 39.12 — NOVO VISUAL COM ADMINSHELL

   Atualização:
   - Página passa a usar AdminShell.
   - Página passa a usar current="usuarios".
   - Removido AdminTopActions da própria página.
   - Topbar, sidebar, sino, perfil ativo, logout e footer ficam no shell.
   - Layout migrado do tema escuro antigo para o padrão claro EloGest.
   - Cards, filtros, listagem, modais e formulários recebem visual novo.
   - Mantida toda a lógica funcional já existente.

   ETAPA 39.17.11 — PADRONIZAÇÃO DO CARREGAMENTO

   Atualização:
   - Loading inicial passa a usar EloGestLoadingScreen.
   - Evita montar AdminShell durante carregamento inicial.
   - Mantém AdminShell apenas após os dados principais carregarem.
   - Mantidas listagem, filtros, métricas, modais e ações existentes.

   ETAPA 41 — REFINAMENTO PREMIUM DOS CADASTROS

   Ajustes desta revisão:
   - Título principal fora do card.
   - Card de Visão da Carteira no topo.
   - Lista de usuários mais compacta.
   - Dados secundários agrupados em Mais Informações.
   - Métricas mais neutras, seguindo Condomínios, Unidades e Moradores.
   - Mantida toda a lógica funcional existente.
   ========================================================= */



type UserRole = "SUPER_ADMIN" | "ADMINISTRADORA" | "SINDICO" | "MORADOR";

interface Administradora {
  id: string;
  name: string;
  status?: string;
}

interface Condominio {
  id: string;
  name: string;
  administratorId?: string;
  status?: string;
}

interface Unidade {
  id: string;
  block?: string | null;
  unitNumber: string;
}

interface Morador {
  id: string;
  name: string;
  email?: string | null;
  cpf?: string | null;
  condominiumId: string;
  unitId: string;
  condominium?: Condominio | null;
  unit?: Unidade | null;
}

interface Usuario {
  id: string;
  name: string;
  email: string;
  role: UserRole | string;
  isActive: boolean;

  administratorId?: string | null;
  condominiumId?: string | null;
  residentId?: string | null;

  administrator?: {
    id: string;
    name: string;
  } | null;

  condominium?: {
    id: string;
    name: string;
  } | null;

  resident?: {
    id: string;
    name: string;
    email?: string | null;
    condominium?: {
      id: string;
      name: string;
    } | null;
    unit?: {
      id: string;
      block?: string | null;
      unitNumber: string;
    } | null;
  } | null;

  createdAt?: string;
}

interface UserFormState {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  administratorId: string;
  condominiumId: string;
  residentId: string;
  isActive: boolean;
}



const emptyCreateForm: UserFormState = {
  name: "",
  email: "",
  password: "123456",
  role: "MORADOR",
  administratorId: "",
  condominiumId: "",
  residentId: "",
  isActive: true,
};



const emptyEditForm: UserFormState = {
  name: "",
  email: "",
  password: "",
  role: "MORADOR",
  administratorId: "",
  condominiumId: "",
  residentId: "",
  isActive: true,
};



/* =========================================================
   HELPERS GERAIS
   ========================================================= */

function isValidEmail(email: string) {
  const value = email.trim();

  if (!value) return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}



function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}



/* =========================================================
   PÁGINA
   ========================================================= */

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [administradoras, setAdministradoras] = useState<Administradora[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [moradores, setMoradores] = useState<Morador[]>([]);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [loading, setLoading] = useState(true);
  const [metaLoaded, setMetaLoaded] = useState(false);

  const queryProcessedRef = useRef(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [selectedUsuario, setSelectedUsuario] = useState<Usuario | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | UserRole>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">(
    "ALL"
  );

  const [form, setForm] = useState<UserFormState>(emptyCreateForm);
  const [editForm, setEditForm] = useState<UserFormState>(emptyEditForm);



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
     CARREGAR USUÁRIOS
     ========================================================= */

  async function loadUsuarios() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/admin/usuarios", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        showError(data?.error || "Erro ao carregar usuários.");
        setUsuarios([]);
        return;
      }

      if (!Array.isArray(data)) {
        showError("Resposta inválida da API.");
        setUsuarios([]);
        return;
      }

      setUsuarios(data);
    } catch (err) {
      console.error(err);
      showError("Erro ao carregar usuários.");
      setUsuarios([]);
    } finally {
      setLoading(false);
    }
  }



  /* =========================================================
     CARREGAR META DADOS
     ========================================================= */

  async function loadMeta() {
    try {
      setMetaLoaded(false);

      const res = await fetch("/api/admin/usuarios/meta", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setAdministradoras([]);
        setCondominios([]);
        setMoradores([]);
        return;
      }

      setAdministradoras(
        Array.isArray(data.administrators) ? data.administrators : []
      );

      setCondominios(
        Array.isArray(data.condominiums) ? data.condominiums : []
      );

      setMoradores(Array.isArray(data.residents) ? data.residents : []);
    } catch (err) {
      console.error(err);
      setAdministradoras([]);
      setCondominios([]);
      setMoradores([]);
    } finally {
      setMetaLoaded(true);
    }
  }



  /* =========================================================
     FECHAMENTO INTELIGENTE DOS MODAIS
     ========================================================= */

  function isAccessFlowFromMoradores() {
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");

    return action === "create" || action === "edit";
  }



  function closeUserModal() {
    if (creating || updating) return;

    setModalOpen(false);
    setSelectedUsuario(null);
    setEditModalOpen(false);

    if (isAccessFlowFromMoradores()) {
      window.location.href = "/admin/moradores";
      return;
    }

    window.history.replaceState(null, "", "/admin/usuarios");
  }



  function finishUserModalAfterSave() {
    setModalOpen(false);
    setSelectedUsuario(null);
    setEditModalOpen(false);

    if (isAccessFlowFromMoradores()) {
      window.location.href = "/admin/moradores";
      return;
    }

    window.history.replaceState(null, "", "/admin/usuarios");
  }



  /* =========================================================
     ABRIR MODAL DE NOVO USUÁRIO
     ========================================================= */

  function openCreateModal() {
    setForm(emptyCreateForm);
    setModalOpen(true);
  }



  /* =========================================================
     CRIAR USUÁRIO
     ========================================================= */

  async function createUsuario(e: React.FormEvent) {
    e.preventDefault();

    const availableResidents =
      form.role === "SINDICO"
        ? moradoresDoSindicoFormulario
        : moradoresDoMoradorFormulario;

    const validation = validateUserForm(form, availableResidents, false);

    if (validation) {
      alert(validation);
      return;
    }

    try {
      setCreating(true);

      const payload = buildUserPayload(form, true);

      const res = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Erro ao criar usuário.");
        return;
      }

      setForm(emptyCreateForm);

      await loadUsuarios();
      await loadMeta();

      finishUserModalAfterSave();

      showSuccess("Usuário criado com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao criar usuário.");
    } finally {
      setCreating(false);
    }
  }



  /* =========================================================
     ABRIR MODAL DE EDIÇÃO
     ========================================================= */

  function openEditModal(usuario: Usuario) {
    setSelectedUsuario(usuario);

    setEditForm({
      name: usuario.name || "",
      email: usuario.email || "",
      password: "",
      role: usuario.role as UserRole,
      administratorId: usuario.administratorId || "",
      condominiumId: usuario.condominiumId || "",
      residentId: usuario.residentId || "",
      isActive: usuario.isActive,
    });

    setEditModalOpen(true);
  }



  /* =========================================================
     ATUALIZAR USUÁRIO
     ========================================================= */

  async function updateUsuario(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedUsuario) return;

    const availableResidents =
      editForm.role === "SINDICO"
        ? moradoresDoSindicoEditFormulario
        : moradoresDoMoradorEditFormulario;

    const validation = validateUserForm(editForm, availableResidents, true);

    if (validation) {
      alert(validation);
      return;
    }

    try {
      setUpdating(true);

      const payload = buildUserPayload(editForm, false);

      const res = await fetch(`/api/admin/usuarios/${selectedUsuario.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Erro ao atualizar usuário.");
        return;
      }

      setSelectedUsuario(null);
      setEditForm(emptyEditForm);

      await loadUsuarios();
      await loadMeta();

      finishUserModalAfterSave();

      showSuccess("Usuário atualizado com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar usuário.");
    } finally {
      setUpdating(false);
    }
  }



  /* =========================================================
     ATIVAR / INATIVAR
     ========================================================= */

  async function toggleStatus(usuario: Usuario) {
    const nextStatus = !usuario.isActive;

    const confirmMessage = nextStatus
      ? `Deseja reativar o usuário "${usuario.name}"?`
      : `Deseja inativar o usuário "${usuario.name}"?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      setUpdatingId(usuario.id);

      const res = await fetch(`/api/admin/usuarios/${usuario.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isActive: nextStatus,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Erro ao atualizar status.");
        return;
      }

      await loadUsuarios();
      await loadMeta();

      showSuccess(
        nextStatus
          ? "Usuário reativado com sucesso."
          : "Usuário inativado com sucesso."
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
    loadUsuarios();
    loadMeta();
  }, []);



  /* =========================================================
     LER PARÂMETROS VINDOS DE /ADMIN/MORADORES
     ========================================================= */

  useEffect(() => {
    if (queryProcessedRef.current) return;
    if (loading || !metaLoaded) return;

    const params = new URLSearchParams(window.location.search);

    const action = params.get("action");
    const role = params.get("role") as UserRole | null;
    const residentId = params.get("residentId");
    const userId = params.get("userId");

    if (!action) return;

    queryProcessedRef.current = true;



    /* =========================================================
       CRIAR ACESSO MORADOR
       ========================================================= */

    if (action === "create" && role === "MORADOR" && residentId) {
      const selectedResident = moradores.find(
        (morador) => morador.id === residentId
      );

      if (!selectedResident) {
        showError("Morador não encontrado para criação de acesso.");
        return;
      }

      const residentEmail = normalizeEmail(selectedResident.email || "");

      const existingUserByEmail = residentEmail
        ? usuarios.find(
            (usuario) => normalizeEmail(usuario.email) === residentEmail
          )
        : null;

      if (existingUserByEmail) {
        setSelectedUsuario(existingUserByEmail);

        const nextRole =
          existingUserByEmail.role === "SINDICO" ||
          existingUserByEmail.role === "MORADOR"
            ? (existingUserByEmail.role as UserRole)
            : ("MORADOR" as UserRole);

        setEditForm({
          name: existingUserByEmail.name || selectedResident.name || "",
          email: existingUserByEmail.email || selectedResident.email || "",
          password: "",
          role: nextRole,
          administratorId: existingUserByEmail.administratorId || "",
          condominiumId:
            nextRole === "SINDICO" || nextRole === "MORADOR"
              ? selectedResident.condominiumId ||
                existingUserByEmail.condominiumId ||
                ""
              : existingUserByEmail.condominiumId || "",
          residentId: selectedResident.id,
          isActive: existingUserByEmail.isActive,
        });

        setRoleFilter(nextRole);
        setSearchTerm(existingUserByEmail.name || selectedResident.name || "");
        setEditModalOpen(true);

        showError(
          "Já existe um usuário com o e-mail deste morador. Abrimos o cadastro existente para você revisar ou vincular o morador a esse acesso."
        );

        return;
      }

      setForm({
        name: selectedResident.name || "",
        email: selectedResident.email || "",
        password: "123456",
        role: "MORADOR",
        administratorId: "",
        condominiumId: selectedResident.condominiumId || "",
        residentId,
        isActive: true,
      });

      setRoleFilter("MORADOR");
      setSearchTerm(selectedResident.name || "");
      setModalOpen(true);
      return;
    }



    /* =========================================================
       EDITAR ACESSO
       ========================================================= */

    if (action === "edit" && userId) {
      const usuario = usuarios.find((item) => item.id === userId);
      const residentIdFromUrl = params.get("residentId");

      if (!usuario) {
        showError("Usuário não encontrado para edição.");
        return;
      }

      const selectedResident = residentIdFromUrl
        ? moradores.find((morador) => morador.id === residentIdFromUrl)
        : null;

      setSelectedUsuario(usuario);

      const nextRole =
        usuario.role === "SINDICO" || usuario.role === "MORADOR"
          ? (usuario.role as UserRole)
          : ("MORADOR" as UserRole);

      setEditForm({
        name: usuario.name || selectedResident?.name || "",
        email: usuario.email || selectedResident?.email || "",
        password: "",
        role: nextRole,
        administratorId: usuario.administratorId || "",
        condominiumId:
          selectedResident?.condominiumId || usuario.condominiumId || "",
        residentId: selectedResident?.id || usuario.residentId || "",
        isActive: usuario.isActive,
      });

      setRoleFilter(nextRole);
      setSearchTerm(usuario.name || selectedResident?.name || usuario.email || "");
      setEditModalOpen(true);
      return;
    }
  }, [loading, metaLoaded, usuarios, moradores]);



  /* =========================================================
     HELPERS
     ========================================================= */

  const roleLabel = (role?: string | null) =>
    ({
      SUPER_ADMIN: "Admin global EloGest",
      ADMINISTRADORA: "Administradora",
      SINDICO: "Síndico",
      MORADOR: "Morador",
    }[role || ""] || role || "-");

  const roleClass = (role?: string | null) =>
    role === "SUPER_ADMIN"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-[#DDE5DF] bg-white text-[#5E6B63]";

  const statusLabel = (active: boolean) => (active ? "Ativo" : "Inativo");

  const statusClass = (active: boolean) =>
    active
      ? "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]"
      : "border-red-200 bg-red-50 text-red-700";

  function getUnitLabel(unit?: Unidade | null) {
    if (!unit) return "-";

    return `${unit.block ? `Bloco ${unit.block} - ` : ""}Unidade ${
      unit.unitNumber
    }`;
  }

  function getAccessMainLabel(usuario: Usuario) {
    if (usuario.role === "SUPER_ADMIN") {
      return "Acesso global da plataforma";
    }

    if (usuario.role === "ADMINISTRADORA") {
      return usuario.administrator?.name || "Administradora não vinculada";
    }

    if (usuario.role === "SINDICO") {
      return usuario.condominium?.name || "Condomínio não vinculado";
    }

    if (usuario.role === "MORADOR") {
      return usuario.resident?.name || "Morador não vinculado";
    }

    return "-";
  }

  function getAccessDetailLabel(usuario: Usuario) {
    if (usuario.role === "SUPER_ADMIN") {
      return "Pode administrar toda a plataforma.";
    }

    if (usuario.role === "ADMINISTRADORA") {
      return "Acesso administrativo da carteira da administradora.";
    }

    if (usuario.role === "SINDICO") {
      if (usuario.resident) {
        return `Também vinculado como morador: ${
          usuario.resident.name
        } • ${getUnitLabel(usuario.resident.unit)}`;
      }

      return "Acesso de gestão do condomínio.";
    }

    if (usuario.role === "MORADOR") {
      const condominiumName = usuario.resident?.condominium?.name || "-";
      const unitLabel = getUnitLabel(usuario.resident?.unit);

      return `${condominiumName} • ${unitLabel}`;
    }

    return "-";
  }

  function getUserLinkLabel(usuario: Usuario) {
    const main = getAccessMainLabel(usuario);
    const detail = getAccessDetailLabel(usuario);

    if (!detail || detail === "-") return main;

    return `${main} • ${detail}`;
  }

  function buildUserPayload(
    source: UserFormState,
    includePasswordRequired: boolean
  ) {
    const payload: any = {
      name: source.name.trim(),
      email: normalizeEmail(source.email),
      role: source.role,
      isActive: source.isActive,
    };

    if (includePasswordRequired || source.password.trim()) {
      payload.password = source.password;
    }

    if (source.role === "ADMINISTRADORA") {
      payload.administratorId = source.administratorId;
    }

    if (source.role === "SINDICO") {
      payload.condominiumId = source.condominiumId;

      if (source.residentId) {
        payload.residentId = source.residentId;
      }
    }

    if (source.role === "MORADOR") {
      payload.residentId = source.residentId;
    }

    return payload;
  }

  function validateUserForm(
    source: UserFormState,
    availableResidents: Morador[],
    editing = false
  ) {
    if (!source.name.trim()) {
      return "Informe o nome do usuário.";
    }

    if (!source.email.trim()) {
      return "Informe o e-mail do usuário.";
    }

    if (!isValidEmail(source.email)) {
      return "Informe um e-mail válido.";
    }

    if (!editing && (!source.password || source.password.length < 6)) {
      return "A senha inicial deve ter pelo menos 6 caracteres.";
    }

    if (editing && source.password && source.password.length < 6) {
      return "A nova senha deve ter pelo menos 6 caracteres.";
    }

    if (source.role === "ADMINISTRADORA" && !source.administratorId) {
      return "Selecione a administradora.";
    }

    if (source.role === "SINDICO" && !source.condominiumId) {
      return "Selecione o condomínio do síndico.";
    }

    if (source.role === "MORADOR" && !source.residentId) {
      if (availableResidents.length === 0) {
        return "Não há moradores sem usuário disponível para este filtro. Cadastre primeiro um novo morador ou verifique se o morador já possui usuário vinculado.";
      }

      return "Selecione o morador vinculado.";
    }

    return "";
  }



  /* =========================================================
     SELEÇÃO DE MORADOR COM AUTOPREENCHIMENTO
     ========================================================= */

  function applyResidentToForm(
    residentId: string,
    availableResidents: Morador[],
    target: "create" | "edit"
  ) {
    const selectedResident = availableResidents.find(
      (morador) => morador.id === residentId
    );

    const setter = target === "create" ? setForm : setEditForm;

    setter((prev) => ({
      ...prev,
      residentId,
      condominiumId:
        prev.role === "MORADOR" || prev.role === "SINDICO"
          ? selectedResident?.condominiumId || prev.condominiumId
          : prev.condominiumId,
      name: selectedResident?.name || prev.name,
      email: selectedResident?.email || prev.email,
    }));
  }



  /* =========================================================
     MÉTRICAS
     ========================================================= */

  const metrics = useMemo(() => {
    return {
      total: usuarios.length,
      active: usuarios.filter((item) => item.isActive).length,
      inactive: usuarios.filter((item) => !item.isActive).length,
      superAdmin: usuarios.filter((item) => item.role === "SUPER_ADMIN").length,
      administradora: usuarios.filter((item) => item.role === "ADMINISTRADORA")
        .length,
      sindico: usuarios.filter((item) => item.role === "SINDICO").length,
      morador: usuarios.filter((item) => item.role === "MORADOR").length,
    };
  }, [usuarios]);



  /* =========================================================
     MORADORES DISPONÍVEIS
     ========================================================= */

  const moradoresComAtualSelecionado = useMemo(() => {
    let list = moradores;

    if (selectedUsuario?.residentId && selectedUsuario.resident) {
      const exists = list.some((item) => item.id === selectedUsuario.residentId);

      if (!exists) {
        list = [
          ...list,
          {
            id: selectedUsuario.resident.id,
            name: selectedUsuario.resident.name,
            email: selectedUsuario.resident.email || null,
            cpf: null,
            condominiumId: selectedUsuario.resident.condominium?.id || "",
            unitId: selectedUsuario.resident.unit?.id || "",
            condominium: selectedUsuario.resident.condominium || null,
            unit: selectedUsuario.resident.unit || null,
          },
        ];
      }
    }

    return list;
  }, [moradores, selectedUsuario]);

  const moradoresDoMoradorFormulario = useMemo(() => {
    if (!form.condominiumId) return moradores;

    return moradores.filter(
      (morador) => morador.condominiumId === form.condominiumId
    );
  }, [moradores, form.condominiumId]);

  const moradoresDoSindicoFormulario = useMemo(() => {
    if (!form.condominiumId) return [];

    return moradores.filter(
      (morador) => morador.condominiumId === form.condominiumId
    );
  }, [moradores, form.condominiumId]);

  const moradoresDoMoradorEditFormulario = useMemo(() => {
    if (!editForm.condominiumId) return moradoresComAtualSelecionado;

    return moradoresComAtualSelecionado.filter(
      (morador) => morador.condominiumId === editForm.condominiumId
    );
  }, [moradoresComAtualSelecionado, editForm.condominiumId]);

  const moradoresDoSindicoEditFormulario = useMemo(() => {
    if (!editForm.condominiumId) return [];

    return moradoresComAtualSelecionado.filter(
      (morador) => morador.condominiumId === editForm.condominiumId
    );
  }, [moradoresComAtualSelecionado, editForm.condominiumId]);



  /* =========================================================
     FILTROS DA LISTAGEM
     ========================================================= */

  const filteredUsuarios = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return usuarios.filter((usuario) => {
      const matchesRole = roleFilter === "ALL" || usuario.role === roleFilter;

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && usuario.isActive) ||
        (statusFilter === "INACTIVE" && !usuario.isActive);

      const searchable = [
        usuario.name,
        usuario.email,
        usuario.role,
        usuario.administrator?.name,
        usuario.condominium?.name,
        usuario.resident?.name,
        usuario.resident?.condominium?.name,
        usuario.resident?.unit?.block,
        usuario.resident?.unit?.unitNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !term || searchable.includes(term);

      return matchesRole && matchesStatus && matchesSearch;
    });
  }, [usuarios, searchTerm, roleFilter, statusFilter]);



  /* =========================================================
     CARREGAMENTO
     ========================================================= */

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando usuários..."
        description="Aguarde enquanto identificamos seu perfil de acesso e carregamos os usuários e perfis de acesso."
      />
    );
  }



  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <AdminShell
      current="usuarios"
      title="Usuários"
      description="Gerencie acessos administrativos, síndicos e moradores."
    >
      <div className="space-y-6">
        {/* =====================================================
            TÍTULO DA PÁGINA
            ===================================================== */}

        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
              Acessos
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
              Usuários
            </h1>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
              Gerencie acessos administrativos, síndicos, moradores e usuários
              globais da plataforma EloGest.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32] focus:outline-none focus:ring-4 focus:ring-[#256D3C]/20"
          >
            Novo Usuário
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
            MODAIS
            ===================================================== */}

        {modalOpen && (
          <UserModal
            title="Novo usuário"
            description="Crie um usuário e vincule ao perfil correto."
            form={form}
            setForm={setForm}
            administradoras={administradoras}
            condominios={condominios}
            moradoresMorador={moradoresDoMoradorFormulario}
            moradoresSindico={moradoresDoSindicoFormulario}
            getUnitLabel={getUnitLabel}
            applyResident={(residentId, availableResidents) =>
              applyResidentToForm(residentId, availableResidents, "create")
            }
            onClose={closeUserModal}
            onSubmit={createUsuario}
            saving={creating}
            submitLabel="Criar usuário"
            passwordHint="Senha provisória obrigatória para novo usuário."
            isEditing={false}
          />
        )}



        {editModalOpen && selectedUsuario && (
          <UserModal
            title="Editar usuário"
            description="Atualize dados, vínculo, perfil, status ou senha do usuário."
            form={editForm}
            setForm={setEditForm}
            administradoras={administradoras}
            condominios={condominios}
            moradoresMorador={moradoresDoMoradorEditFormulario}
            moradoresSindico={moradoresDoSindicoEditFormulario}
            getUnitLabel={getUnitLabel}
            applyResident={(residentId, availableResidents) =>
              applyResidentToForm(residentId, availableResidents, "edit")
            }
            onClose={closeUserModal}
            onSubmit={updateUsuario}
            saving={updating}
            submitLabel="Salvar alterações"
            passwordHint="Preencha somente se desejar alterar a senha."
            isEditing={true}
          />
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
                  Resumo dos acessos cadastrados, com foco em usuários ativos,
                  perfis administrativos e perfis do portal.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:min-w-[620px] xl:grid-cols-4">
                <PortfolioMetricBox title="Total" value={metrics.total} description="Usuários cadastrados." highlighted />
                <PortfolioMetricBox title="Ativos" value={metrics.active} description="Com acesso ativo." highlighted />
                <PortfolioMetricBox title="Administradora" value={metrics.administradora} description="Perfis administrativos." />
                <PortfolioMetricBox title="Portal" value={metrics.sindico + metrics.morador} description="Síndicos e moradores." />
              </div>
            </div>
          </div>

          <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">Status dos acessos</p>
              <p className="mt-2 text-sm leading-6 text-[#5E6B63]"><strong className="text-[#17211B]">{metrics.active}</strong> ativo(s) e <strong className="text-[#17211B]">{metrics.inactive}</strong> inativo(s).</p>
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">Perfis administrativos</p>
              <p className="mt-2 text-sm leading-6 text-[#5E6B63]"><strong className="text-[#17211B]">{metrics.superAdmin}</strong> admin global e <strong className="text-[#17211B]">{metrics.administradora}</strong> administradora(s).</p>
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">Perfis do portal</p>
              <p className="mt-2 text-sm leading-6 text-[#5E6B63]"><strong className="text-[#17211B]">{metrics.sindico}</strong> síndico(s) e <strong className="text-[#17211B]">{metrics.morador}</strong> morador(es).</p>
            </div>
          </div>
        </section>



        {/* =====================================================
            FILTROS
            ===================================================== */}

        <ResponsiveSection
          title="Busca e Filtros"
          description="Localize usuários por nome, e-mail, perfil, condomínio ou vínculo."
          defaultOpenMobile
        >
          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label className="text-sm font-semibold text-[#17211B]">
                  Buscar usuário
                </label>

                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="form-input mt-1"
                  placeholder="Buscar por nome, e-mail, perfil, condomínio, morador..."
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-[#17211B]">
                  Perfil
                </label>

                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as any)}
                  className="form-input mt-1"
                >
                  <option value="ALL">Todos</option>
                  <option value="SUPER_ADMIN">Admin global EloGest</option>
                  <option value="ADMINISTRADORA">Administradora</option>
                  <option value="SINDICO">Síndico</option>
                  <option value="MORADOR">Morador</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold text-[#17211B]">
                  Status
                </label>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="form-input mt-1"
                >
                  <option value="ALL">Todos</option>
                  <option value="ACTIVE">Ativos</option>
                  <option value="INACTIVE">Inativos</option>
                </select>
              </div>
            </div>

            <p className="mt-3 text-sm text-[#5E6B63]">
              Exibindo{" "}
              <strong className="text-[#17211B]">
                {filteredUsuarios.length}
              </strong>{" "}
              de{" "}
              <strong className="text-[#17211B]">{usuarios.length}</strong>{" "}
              usuário(s).
            </p>
          </section>
        </ResponsiveSection>



        {/* =====================================================
            LISTAGEM COMPACTA
            ===================================================== */}

        {filteredUsuarios.length === 0 ? (
          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-8 text-center shadow-sm">
            <h2 className="mb-2 text-2xl font-semibold text-[#17211B]">Nenhum Usuário Encontrado</h2>
            <p className="mx-auto max-w-2xl text-sm leading-6 text-[#5E6B63]">Não encontramos usuários com os filtros atuais. Tente limpar os filtros ou cadastrar um novo usuário.</p>
          </section>
        ) : (
          <div className="space-y-3">
            {filteredUsuarios.map((usuario) => (
              <article key={usuario.id} className="rounded-[24px] border border-[#DDE5DF] bg-white p-5 shadow-sm transition hover:border-[#256D3C]/30 hover:shadow-[0_14px_38px_rgba(23,33,27,0.07)]">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${roleClass(usuario.role)}`}>{roleLabel(usuario.role)}</span>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(usuario.isActive)}`}>{statusLabel(usuario.isActive)}</span>
                    </div>

                    <h2 className="break-words text-xl font-semibold tracking-tight text-[#17211B] md:text-2xl">{usuario.name}</h2>
                    <p className="mt-2 text-sm leading-6 text-[#5E6B63]">{usuario.email}</p>
                    <p className="mt-2 text-xs text-[#7A877F]">Acesso vinculado a: {getUserLinkLabel(usuario)}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-start gap-2 xl:w-[170px] xl:flex-col">
                    <button type="button" onClick={() => openEditModal(usuario)} className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]">Editar</button>
                    <button type="button" onClick={() => toggleStatus(usuario)} disabled={updatingId === usuario.id} className={usuario.isActive ? "inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60" : "inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"}>
                      {updatingId === usuario.id ? "Atualizando..." : usuario.isActive ? "Inativar" : "Reativar"}
                    </button>
                  </div>
                </div>

                <details className="mt-4 group rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#17211B]">
                    <span>Mais Informações</span>
                    <span className="text-[#7A877F] transition group-open:rotate-180">▾</span>
                  </summary>

                  <div className="border-t border-[#DDE5DF] p-4">
                    <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-4">
                      <InfoLine label="Perfil" value={roleLabel(usuario.role)} />
                      <InfoLine label="Status" value={statusLabel(usuario.isActive)} />
                      <InfoLine label="Principal" value={getAccessMainLabel(usuario)} />
                      <InfoLine label="Detalhe" value={getAccessDetailLabel(usuario)} />
                      <InfoLine label="Administradora" value={usuario.administrator?.name || "-"} />
                      <InfoLine label="Condomínio" value={usuario.condominium?.name || usuario.resident?.condominium?.name || "-"} />
                      <InfoLine label="Morador" value={usuario.resident?.name || "-"} />
                      <InfoLine label="Criado em" value={usuario.createdAt ? new Date(usuario.createdAt).toLocaleString("pt-BR") : "-"} />
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
      `}</style>
    </AdminShell>
  );
}



/* =========================================================
   MODAL DE USUÁRIO
   ========================================================= */

function UserModal({
  title,
  description,
  form,
  setForm,
  administradoras,
  condominios,
  moradoresMorador,
  moradoresSindico,
  getUnitLabel,
  applyResident,
  onClose,
  onSubmit,
  saving,
  submitLabel,
  passwordHint,
  isEditing,
}: {
  title: string;
  description: string;
  form: UserFormState;
  setForm: React.Dispatch<React.SetStateAction<UserFormState>>;
  administradoras: Administradora[];
  condominios: Condominio[];
  moradoresMorador: Morador[];
  moradoresSindico: Morador[];
  getUnitLabel: (unit?: Unidade | null) => string;
  applyResident: (residentId: string, availableResidents: Morador[]) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  submitLabel: string;
  passwordHint: string;
  isEditing: boolean;
}) {
  const emailInvalid = !!form.email && !isValidEmail(form.email);

  const passwordInvalid =
    (!isEditing && !!form.password && form.password.length < 6) ||
    (isEditing && !!form.password && form.password.length < 6);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#17211B]/65 p-4 backdrop-blur-sm">
      <div className="my-6 max-h-[calc(100vh-3rem)] w-full max-w-3xl overflow-y-auto rounded-[32px] border border-[#DDE5DF] bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-[#17211B]">
              {title}
            </h2>

            <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
              {description}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-[#5E6B63] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <FormField label="Perfil" required>
            <select
              value={form.role}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  role: e.target.value as UserRole,
                  administratorId: "",
                  condominiumId: "",
                  residentId: "",
                }))
              }
              className="form-input"
            >
              <option value="ADMINISTRADORA">Administradora</option>
              <option value="SINDICO">Síndico</option>
              <option value="MORADOR">Morador</option>
              <option value="SUPER_ADMIN">Admin global EloGest</option>
            </select>
          </FormField>

          {form.role === "ADMINISTRADORA" && (
            <FormField label="Administradora" required>
              <select
                value={form.administratorId}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    administratorId: e.target.value,
                  }))
                }
                className="form-input"
              >
                <option value="">Selecione a administradora</option>

                {administradoras.map((administradora) => (
                  <option key={administradora.id} value={administradora.id}>
                    {administradora.name}
                  </option>
                ))}
              </select>
            </FormField>
          )}

          {form.role === "SINDICO" && (
            <>
              <FormField label="Condomínio do síndico" required>
                <select
                  value={form.condominiumId}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      condominiumId: e.target.value,
                      residentId: "",
                    }))
                  }
                  className="form-input"
                >
                  <option value="">Selecione o condomínio</option>

                  {condominios.map((condominio) => (
                    <option key={condominio.id} value={condominio.id}>
                      {condominio.name}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Morador vinculado ao síndico">
                <select
                  value={form.residentId}
                  onChange={(e) =>
                    applyResident(e.target.value, moradoresSindico)
                  }
                  disabled={!form.condominiumId || moradoresSindico.length === 0}
                  className="form-input disabled:opacity-60"
                >
                  <option value="">
                    {!form.condominiumId
                      ? "Selecione primeiro o condomínio"
                      : moradoresSindico.length === 0
                        ? "Nenhum morador disponível neste condomínio"
                        : "Opcional: selecione o morador"}
                  </option>

                  {moradoresSindico.map((morador) => (
                    <option key={morador.id} value={morador.id}>
                      {morador.name} • {getUnitLabel(morador.unit)}
                    </option>
                  ))}
                </select>

                <p className="mt-1 text-xs text-[#7A877F]">
                  Se o síndico também for morador, selecione o cadastro dele para
                  vincular sua unidade pessoal.
                </p>
              </FormField>
            </>
          )}

          {form.role === "MORADOR" && (
            <>
              <FormField label="Filtrar morador por condomínio">
                <select
                  value={form.condominiumId}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      condominiumId: e.target.value,
                      residentId: "",
                    }))
                  }
                  className="form-input"
                >
                  <option value="">Todos os condomínios</option>

                  {condominios.map((condominio) => (
                    <option key={condominio.id} value={condominio.id}>
                      {condominio.name}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Morador vinculado" required>
                <select
                  value={form.residentId}
                  onChange={(e) =>
                    applyResident(e.target.value, moradoresMorador)
                  }
                  disabled={moradoresMorador.length === 0}
                  className="form-input disabled:opacity-60"
                >
                  <option value="">
                    {moradoresMorador.length === 0
                      ? "Nenhum morador disponível"
                      : "Selecione o morador"}
                  </option>

                  {moradoresMorador.map((morador) => (
                    <option key={morador.id} value={morador.id}>
                      {morador.name} • {morador.condominium?.name || "-"} •{" "}
                      {getUnitLabel(morador.unit)}
                    </option>
                  ))}
                </select>

                {moradoresMorador.length === 0 ? (
                  <div className="mt-2 rounded-2xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                    Não há moradores disponíveis para este filtro. Cadastre
                    primeiro um novo morador ou verifique se ele já possui
                    usuário vinculado.
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-[#7A877F]">
                    {isEditing
                      ? "Na edição, o morador atual também aparece na lista."
                      : "Apenas moradores sem usuário vinculado aparecem nesta lista."}
                  </p>
                )}
              </FormField>
            </>
          )}

          <FormField label="Nome" required>
            <input
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  name: e.target.value,
                }))
              }
              className="form-input"
              placeholder="Nome do usuário"
            />
          </FormField>

          <FormField label="E-mail" required>
            <input
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  email: e.target.value,
                }))
              }
              className="form-input"
              placeholder="usuario@email.com"
            />

            {emailInvalid && (
              <p className="mt-1 text-xs text-yellow-700">
                Verifique o formato do e-mail.
              </p>
            )}
          </FormField>

          <FormField
            label={isEditing ? "Nova senha opcional" : "Senha inicial"}
            required={!isEditing}
          >
            <input
              type="text"
              value={form.password}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  password: e.target.value,
                }))
              }
              className="form-input"
              placeholder={
                isEditing ? "Deixe em branco para manter" : "Mínimo 6 caracteres"
              }
            />

            <p className="mt-1 text-xs text-[#7A877F]">
              {passwordHint}
            </p>

            {passwordInvalid && (
              <p className="mt-1 text-xs text-yellow-700">
                A senha deve conter pelo menos 6 caracteres.
              </p>
            )}
          </FormField>

          <FormField label="Status">
            <select
              value={form.isActive ? "ACTIVE" : "INACTIVE"}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  isActive: e.target.value === "ACTIVE",
                }))
              }
              className="form-input"
            >
              <option value="ACTIVE">Ativo</option>
              <option value="INACTIVE">Inativo</option>
            </select>
          </FormField>

          <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-4 text-sm leading-6 text-[#5E6B63]">
            Síndico precisa estar vinculado a um condomínio. Se ele também for
            morador, o vínculo com o morador é opcional e identifica a unidade
            pessoal dele. Morador comum exige vínculo obrigatório com morador.
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
            >
              {saving ? "Salvando..." : submitLabel}
            </button>
          </div>
        </form>
      </div>
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
  tone?: "default" | "green" | "red" | "blue" | "purple";
}) {
  const toneClass =
    tone === "green"
      ? "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]"
      : tone === "red"
        ? "border-red-200 bg-red-50 text-red-700"
        : tone === "blue"
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : tone === "purple"
            ? "border-purple-200 bg-purple-50 text-purple-700"
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
   CARD PRINCIPAL DA VISÃO DA CARTEIRA
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

      {description && <p className="mt-1 text-xs text-[#5E6B63]">{description}</p>}
    </div>
  );
}



/* =========================================================
   LINHA DE INFORMAÇÃO DO MENU SUSPENSO
   ========================================================= */

function InfoLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-[#17211B]">{value}</p>
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