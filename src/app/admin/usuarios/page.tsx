"use client";

import {
  useCallback,
  useEffect,
  useRef,
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
   USUÁRIOS - PÁGINA ADMINISTRATIVA

   ETAPA 15.6.8

   Ajustes anteriores:
   - SÍNDICO pode ter morador vinculado opcional.
   - MORADOR continua exigindo morador vinculado.
   - Ao selecionar morador, nome/e-mail são preenchidos automaticamente.
   - Edição mantém o morador atualmente vinculado no select.
   - Lê parâmetros vindos de /admin/moradores:
     /admin/usuarios?action=create&role=MORADOR&residentId=...
     /admin/usuarios?action=edit&userId=...
     /admin/usuarios?action=edit&userId=...&residentId=...
   - Ao cancelar/salvar vindo de /admin/moradores, volta para /admin/moradores.
   - Remove IDs técnicos dos cards.
   - Mostra vínculo do acesso de forma amigável.

   ETAPA 35.4:
   Refinamento do fluxo morador x acesso ao portal.

   ETAPA 39.12 — NOVO VISUAL COM ADMINSHELL

   ETAPA 39.17.11 — PADRONIZAÇÃO DO CARREGAMENTO

   ETAPA 41 — REFINAMENTO PREMIUM DOS CADASTROS

   ETAPA 42.8 — SEGURANÇA DE SENHA

   ETAPA 45 — CADASTRO CONDOMINIAL AVANÇADO / ACESSOS
   - Mantido fluxo morador -> usuário -> portal.
   - Mantidos parâmetros vindos de /admin/moradores/[id]/acesso.
   - Corrigido carregamento inicial para evitar lint
     react-hooks/set-state-in-effect.
   - Removidos tipos any.
   - Removidos componentes não utilizados.
   - Corrigidos casts dos filtros.
   - Mantida política forte de senha no front.
   - Mantida compatibilidade com APIs administrativas existentes.
   ========================================================= */



/* =========================================================
   TYPES
   ========================================================= */

type UserRole = "SUPER_ADMIN" | "ADMINISTRADORA" | "SINDICO" | "MORADOR";

type RoleFilter = "ALL" | UserRole;

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";



interface Administradora {
  id: string;
  name: string;
  status?: string | null;
}



interface Condominio {
  id: string;
  name: string;
  administratorId?: string | null;
  status?: string | null;
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
  phone?: string | null;
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
  phone?: string | null;
  phoneVerifiedAt?: string | null;
  phoneOptInAt?: string | null;
  phoneOptOutAt?: string | null;
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

  userAccesses?: {
    id: string;
    role: string;
    label?: string | null;
    isActive?: boolean | null;
    condominiumId?: string | null;
    condominium?: {
      id: string;
      name: string;
    } | null;
  }[];

  resident?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
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

  createdAt?: string | null;
}



interface UserFormState {
  name: string;
  email: string;
  password: string;
  phone: string;
  role: UserRole;
  administratorId: string;
  condominiumId: string;
  residentId: string;
  councilAccessEnabled: boolean;
  councilAccessTitle: string;
  councilAccessCondominiumId: string;
  isActive: boolean;
}



interface ApiErrorResponse {
  error?: string;
}



interface UsuariosMetaResponse {
  administrators?: Administradora[];
  condominiums?: Condominio[];
  residents?: Morador[];
}



type UserPayload = {
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  password?: string;
  administratorId?: string;
  condominiumId?: string;
  residentId?: string;
  councilAccess?: {
    enabled: boolean;
    title?: string;
    condominiumId?: string;
  };
};



type FetchArrayResult<T> =
  | {
      ok: true;
      items: T[];
    }
  | {
      ok: false;
      items: T[];
      error: string;
    };



const emptyCreateForm: UserFormState = {
  name: "",
  email: "",
  password: "",
  phone: "",
  role: "MORADOR",
  administratorId: "",
  condominiumId: "",
  residentId: "",
  councilAccessEnabled: false,
  councilAccessTitle: "",
  councilAccessCondominiumId: "",
  isActive: true,
};



const emptyEditForm: UserFormState = {
  name: "",
  email: "",
  password: "",
  phone: "",
  role: "MORADOR",
  administratorId: "",
  condominiumId: "",
  residentId: "",
  councilAccessEnabled: false,
  councilAccessTitle: "",
  councilAccessCondominiumId: "",
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



function normalizePhoneForForm(phone: string) {
  return String(phone || "").replace(/\D/g, "");
}



function isValidPhoneForForm(phone: string) {
  const normalized = normalizePhoneForForm(phone);

  if (!normalized) return true;

  return (
    normalized.length === 10 ||
    normalized.length === 11 ||
    normalized.length === 12 ||
    normalized.length === 13
  );
}



function formatPhoneDisplay(phone?: string | null) {
  const normalized = normalizePhoneForForm(phone || "");

  if (!normalized) return "-";

  if (normalized.length === 13 && normalized.startsWith("55")) {
    return `+55 (${normalized.slice(2, 4)}) ${normalized.slice(
      4,
      9
    )}-${normalized.slice(9)}`;
  }

  if (normalized.length === 11) {
    return `(${normalized.slice(0, 2)}) ${normalized.slice(
      2,
      7
    )}-${normalized.slice(7)}`;
  }

  if (normalized.length === 10) {
    return `(${normalized.slice(0, 2)}) ${normalized.slice(
      2,
      6
    )}-${normalized.slice(6)}`;
  }

  return normalized;
}



function getPasswordChecks(password: string) {
  return [
    {
      label: "Mínimo de 8 caracteres",
      passed: password.length >= 8,
    },
    {
      label: "Uma letra maiúscula",
      passed: /[A-ZÀ-Ý]/.test(password),
    },
    {
      label: "Uma letra minúscula",
      passed: /[a-zà-ÿ]/.test(password),
    },
    {
      label: "Um número",
      passed: /\d/.test(password),
    },
    {
      label: "Um caractere especial",
      passed: /[^A-Za-zÀ-ÿ0-9]/.test(password),
    },
  ];
}



function isBlockedPassword(password: string) {
  const blockedPasswords = new Set([
    "12345678",
    "123456789",
    "1234567890",
    "senha123",
    "senha1234",
    "password",
    "password123",
    "admin123",
    "admin1234",
    "elogest123",
    "elogest1234",
    "heloisa100%",
    "qwerty123",
    "abc12345",
  ]);

  return blockedPasswords.has(String(password || "").trim().toLowerCase());
}



function validatePasswordForForm(password: string, editing = false) {
  const value = String(password || "");

  if (editing && !value.trim()) {
    return "";
  }

  const checks = getPasswordChecks(value);

  if (checks.some((check) => !check.passed)) {
    return "A senha deve ter pelo menos 8 caracteres, incluindo letra maiúscula, letra minúscula, número e caractere especial.";
  }

  if (isBlockedPassword(value)) {
    return "Esta senha é muito previsível. Escolha uma combinação diferente.";
  }

  return "";
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



function isUserRole(value: string): value is UserRole {
  return (
    value === "SUPER_ADMIN" ||
    value === "ADMINISTRADORA" ||
    value === "SINDICO" ||
    value === "MORADOR"
  );
}



function toUserRole(value: string, fallback: UserRole = "MORADOR"): UserRole {
  return isUserRole(value) ? value : fallback;
}



function toRoleFilter(value: string): RoleFilter {
  if (value === "ALL") return "ALL";

  return toUserRole(value);
}



function toStatusFilter(value: string): StatusFilter {
  if (value === "ACTIVE" || value === "INACTIVE") {
    return value;
  }

  return "ALL";
}



function roleLabel(role?: string | null) {
  return (
    {
      SUPER_ADMIN: "Admin global EloGest",
      ADMINISTRADORA: "Administradora",
      SINDICO: "Síndico",
      MORADOR: "Morador",
    }[role || ""] ||
    role ||
    "-"
  );
}



function roleClass(role?: string | null) {
  return role === "SUPER_ADMIN"
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-[#DDE5DF] bg-white text-[#5E6B63]";
}



function statusLabel(active: boolean) {
  return active ? "Ativo" : "Inativo";
}



function statusClass(active: boolean) {
  return active
    ? "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]"
    : "border-red-200 bg-red-50 text-red-700";
}



function getUnitLabel(unit?: Unidade | null) {
  if (!unit) return "-";

  return `${unit.block ? `Bloco ${unit.block} - ` : ""}Unidade ${
    unit.unitNumber
  }`;
}






function getCouncilAccess(usuario: Usuario) {
  return (
    usuario.userAccesses?.find(
      (access) => access.role === "CONSELHEIRO" && access.isActive !== false
    ) || null
  );
}

function getCouncilAccessTitle(usuario: Usuario) {
  const councilAccess = getCouncilAccess(usuario);

  if (!councilAccess) {
    return "-";
  }

  const label = String(councilAccess.label || "Conselheiro").trim();

  if (!label) {
    return "Conselheiro";
  }

  const [title] = label.split(" - ");

  return title?.trim() || label;
}

function getCouncilAccessCondominiumName(usuario: Usuario) {
  const councilAccess = getCouncilAccess(usuario);

  if (!councilAccess) {
    return "-";
  }

  return (
    councilAccess.condominium?.name ||
    usuario.condominium?.name ||
    usuario.resident?.condominium?.name ||
    "Condomínio não identificado"
  );
}

function getCouncilAccessLabel(usuario: Usuario) {
  const councilAccess = getCouncilAccess(usuario);

  if (!councilAccess) {
    return "-";
  }

  const title = getCouncilAccessTitle(usuario);
  const condominiumName = getCouncilAccessCondominiumName(usuario);

  return `${title} • ${condominiumName}`;
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

  const parts = [main, detail !== "-" ? detail : ""].filter(Boolean);

  return parts.join(" • ");
}



function buildUserPayload(
  source: UserFormState,
  includePasswordRequired: boolean
): UserPayload {
  const payload: UserPayload = {
    name: source.name.trim(),
    email: normalizeEmail(source.email),
    phone: normalizePhoneForForm(source.phone) || null,
    role: source.role,
    isActive: source.isActive,
    councilAccess: {
      enabled: source.councilAccessEnabled,
      title: source.councilAccessTitle.trim() || undefined,
      condominiumId: source.councilAccessCondominiumId || source.condominiumId || undefined,
    },
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

  if (!isValidPhoneForForm(source.phone)) {
    return "Informe um telefone válido com DDD para notificações/WhatsApp ou deixe o campo em branco.";
  }

  const passwordError = validatePasswordForForm(source.password, editing);

  if (passwordError) {
    return passwordError;
  }

  if (source.role === "ADMINISTRADORA" && !source.administratorId) {
    return "Selecione a administradora.";
  }

  if (source.role === "SINDICO" && !source.condominiumId) {
    return "Selecione o condomínio do síndico.";
  }

  if (source.councilAccessEnabled && !(source.councilAccessCondominiumId || source.condominiumId)) {
    return "Selecione o condomínio do perfil de conselheiro.";
  }

  if (source.role === "MORADOR" && !source.residentId) {
    if (availableResidents.length === 0) {
      return "Não há moradores sem usuário disponível para este filtro. Cadastre primeiro um novo morador ou verifique se o morador já possui usuário vinculado.";
    }

    return "Selecione o morador vinculado.";
  }

  return "";
}



async function fetchUsuarios(): Promise<FetchArrayResult<Usuario>> {
  const res = await fetch("/api/admin/usuarios", {
    cache: "no-store",
  });

  const data: unknown = await res.json();

  if (!res.ok) {
    return {
      ok: false,
      items: [],
      error: getApiErrorMessage(data, "Erro ao carregar usuários."),
    };
  }

  if (!Array.isArray(data)) {
    return {
      ok: false,
      items: [],
      error: "Resposta inválida da API.",
    };
  }

  return {
    ok: true,
    items: data as Usuario[],
  };
}



async function fetchUsuariosMeta() {
  const res = await fetch("/api/admin/usuarios/meta", {
    cache: "no-store",
  });

  const data: unknown = await res.json();

  if (!res.ok || typeof data !== "object" || data === null) {
    return {
      administrators: [],
      condominiums: [],
      residents: [],
    };
  }

  const meta = data as UsuariosMetaResponse;

  return {
    administrators: Array.isArray(meta.administrators)
      ? meta.administrators
      : [],
    condominiums: Array.isArray(meta.condominiums) ? meta.condominiums : [],
    residents: Array.isArray(meta.residents) ? meta.residents : [],
  };
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
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const [form, setForm] = useState<UserFormState>(emptyCreateForm);
  const [editForm, setEditForm] = useState<UserFormState>(emptyEditForm);



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
     RECARREGAMENTO APÓS AÇÕES

     Não usado no carregamento inicial para evitar chamada direta
     de função que altera estado dentro do useEffect.
     ========================================================= */

  const reloadUsuarios = useCallback(
    async ({ showLoading = false }: { showLoading?: boolean } = {}) => {
      try {
        if (showLoading) {
          setLoading(true);
        }

        const result = await fetchUsuarios();

        if (!result.ok) {
          showError(result.error);
          setUsuarios([]);
          return;
        }

        setUsuarios(result.items);
      } catch (err) {
        console.error(err);
        showError("Erro ao carregar usuários.");
        setUsuarios([]);
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [showError]
  );



  const reloadMeta = useCallback(async () => {
    try {
      const meta = await fetchUsuariosMeta();

      setAdministradoras(meta.administrators);
      setCondominios(meta.condominiums);
      setMoradores(meta.residents);
      setMetaLoaded(true);
    } catch (err) {
      console.error(err);
      setAdministradoras([]);
      setCondominios([]);
      setMoradores([]);
      setMetaLoaded(true);
    }
  }, []);



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

  async function createUsuario(e: FormEvent<HTMLFormElement>) {
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

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao criar usuário."));
        return;
      }

      setForm(emptyCreateForm);

      await reloadUsuarios();
      await reloadMeta();

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
    const role = toUserRole(usuario.role, "MORADOR");
    const councilAccess = getCouncilAccess(usuario);

    setSelectedUsuario(usuario);

    setEditForm({
      name: usuario.name || "",
      email: usuario.email || "",
      password: "",
      phone: usuario.phone || "",
      role,
      administratorId: usuario.administratorId || "",
      condominiumId: usuario.condominiumId || "",
      residentId: usuario.residentId || "",
      councilAccessEnabled: Boolean(councilAccess),
      councilAccessTitle: councilAccess?.label?.split(" - ")[0] || "Conselheiro",
      councilAccessCondominiumId:
        councilAccess?.condominiumId ||
        councilAccess?.condominium?.id ||
        usuario.condominiumId ||
        usuario.resident?.condominium?.id ||
        "",
      isActive: usuario.isActive,
    });

    setEditModalOpen(true);
  }



  /* =========================================================
     ATUALIZAR USUÁRIO
     ========================================================= */

  async function updateUsuario(e: FormEvent<HTMLFormElement>) {
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

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao atualizar usuário."));
        return;
      }

      setSelectedUsuario(null);
      setEditForm(emptyEditForm);

      await reloadUsuarios();
      await reloadMeta();

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

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao atualizar status."));
        return;
      }

      await reloadUsuarios();
      await reloadMeta();

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

     Corrigido:
     - Não chama loadUsuarios/loadMeta diretamente no corpo do effect.
     - Estados são atualizados apenas nas callbacks assíncronas.
     ========================================================= */

  useEffect(() => {
    let isMounted = true;

    Promise.all([fetchUsuarios(), fetchUsuariosMeta()])
      .then(([usuariosResult, metaResult]) => {
        if (!isMounted) return;

        if (!usuariosResult.ok) {
          showError(usuariosResult.error);
          setUsuarios([]);
        } else {
          setUsuarios(usuariosResult.items);
        }

        setAdministradoras(metaResult.administrators);
        setCondominios(metaResult.condominiums);
        setMoradores(metaResult.residents);
        setMetaLoaded(true);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;

        console.error(err);
        showError("Erro ao carregar usuários.");
        setUsuarios([]);
        setAdministradoras([]);
        setCondominios([]);
        setMoradores([]);
        setMetaLoaded(true);
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [showError]);



  /* =========================================================
     MORADORES DISPONÍVEIS
     ========================================================= */

  const moradoresComAtualSelecionado = (() => {
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
            phone: selectedUsuario.resident.phone || null,
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
  })();



  const moradoresDoMoradorFormulario = form.condominiumId
    ? moradores.filter((morador) => morador.condominiumId === form.condominiumId)
    : moradores;



  const moradoresDoSindicoFormulario = form.condominiumId
    ? moradores.filter((morador) => morador.condominiumId === form.condominiumId)
    : [];



  const moradoresDoMoradorEditFormulario = editForm.condominiumId
    ? moradoresComAtualSelecionado.filter(
        (morador) => morador.condominiumId === editForm.condominiumId
      )
    : moradoresComAtualSelecionado;



  const moradoresDoSindicoEditFormulario = editForm.condominiumId
    ? moradoresComAtualSelecionado.filter(
        (morador) => morador.condominiumId === editForm.condominiumId
      )
    : [];



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
      phone: prev.phone || selectedResident?.phone || "",
    }));
  }



  /* =========================================================
     LER PARÂMETROS VINDOS DE /ADMIN/MORADORES

     Corrigido:
     - O processamento é feito dentro de callback assíncrona curta
       para evitar setState síncrono diretamente no corpo do effect.
   ========================================================= */

  useEffect(() => {
    if (queryProcessedRef.current) return;
    if (loading || !metaLoaded) return;

    const timeoutId = window.setTimeout(() => {
      if (queryProcessedRef.current) return;

      const params = new URLSearchParams(window.location.search);

      const action = params.get("action");
      const role = params.get("role");
      const residentId = params.get("residentId");
      const userId = params.get("userId");

      if (!action) return;

      queryProcessedRef.current = true;



      /* =======================================================
         CRIAR ACESSO MORADOR
         ======================================================= */

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
          const nextRole =
            existingUserByEmail.role === "SINDICO" ||
            existingUserByEmail.role === "MORADOR"
              ? toUserRole(existingUserByEmail.role)
              : "MORADOR";

          setSelectedUsuario(existingUserByEmail);

          setEditForm({
            name: existingUserByEmail.name || selectedResident.name || "",
            email: existingUserByEmail.email || selectedResident.email || "",
            password: "",
            phone: existingUserByEmail.phone || selectedResident.phone || "",
            role: nextRole,
            administratorId: existingUserByEmail.administratorId || "",
            condominiumId:
              nextRole === "SINDICO" || nextRole === "MORADOR"
                ? selectedResident.condominiumId ||
                  existingUserByEmail.condominiumId ||
                  ""
                : existingUserByEmail.condominiumId || "",
            residentId: selectedResident.id,
            councilAccessEnabled: false,
            councilAccessTitle: "",
            councilAccessCondominiumId: selectedResident.condominiumId || "",
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
          password: "",
          phone: selectedResident.phone || "",
          role: "MORADOR",
          administratorId: "",
          condominiumId: selectedResident.condominiumId || "",
          residentId,
          councilAccessEnabled: false,
          councilAccessTitle: "",
          councilAccessCondominiumId: selectedResident.condominiumId || "",
          isActive: true,
        });

        setRoleFilter("MORADOR");
        setSearchTerm(selectedResident.name || "");
        setModalOpen(true);
        return;
      }



      /* =======================================================
         EDITAR ACESSO
         ======================================================= */

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

        const nextRole =
          usuario.role === "SINDICO" || usuario.role === "MORADOR"
            ? toUserRole(usuario.role)
            : "MORADOR";

        setSelectedUsuario(usuario);

        setEditForm({
          name: usuario.name || selectedResident?.name || "",
          email: usuario.email || selectedResident?.email || "",
          password: "",
          phone: usuario.phone || selectedResident?.phone || "",
          role: nextRole,
          administratorId: usuario.administratorId || "",
          condominiumId:
            selectedResident?.condominiumId || usuario.condominiumId || "",
          residentId: selectedResident?.id || usuario.residentId || "",
          councilAccessEnabled: Boolean(getCouncilAccess(usuario)),
          councilAccessTitle: getCouncilAccess(usuario)?.label?.split(" - ")[0] || "Conselheiro",
          councilAccessCondominiumId:
            getCouncilAccess(usuario)?.condominiumId ||
            getCouncilAccess(usuario)?.condominium?.id ||
            selectedResident?.condominiumId ||
            usuario.condominiumId ||
            "",
          isActive: usuario.isActive,
        });

        setRoleFilter(nextRole);
        setSearchTerm(usuario.name || selectedResident?.name || usuario.email || "");
        setEditModalOpen(true);
      }
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loading, metaLoaded, usuarios, moradores, showError]);



  /* =========================================================
     MÉTRICAS
     ========================================================= */

  const metrics = {
    total: usuarios.length,
    active: usuarios.filter((item) => item.isActive).length,
    inactive: usuarios.filter((item) => !item.isActive).length,
    superAdmin: usuarios.filter((item) => item.role === "SUPER_ADMIN").length,
    administradora: usuarios.filter((item) => item.role === "ADMINISTRADORA")
      .length,
    sindico: usuarios.filter((item) => item.role === "SINDICO").length,
    conselheiro: usuarios.filter((item) => Boolean(getCouncilAccess(item))).length,
    morador: usuarios.filter((item) => item.role === "MORADOR").length,
  };



  /* =========================================================
     FILTROS DA LISTAGEM
     ========================================================= */

  const filteredUsuarios = usuarios.filter((usuario) => {
    const term = searchTerm.trim().toLowerCase();

    const matchesRole = roleFilter === "ALL" || usuario.role === roleFilter;

    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "ACTIVE" && usuario.isActive) ||
      (statusFilter === "INACTIVE" && !usuario.isActive);

    const searchable = [
      usuario.name,
      usuario.email,
      usuario.phone,
      usuario.role,
      usuario.administrator?.name,
      usuario.condominium?.name,
      usuario.resident?.name,
      usuario.resident?.condominium?.name,
      usuario.resident?.unit?.block,
      usuario.resident?.unit?.unitNumber,
      ...(usuario.userAccesses || []).map((access) => access.label),
      ...(usuario.userAccesses || []).map((access) => access.condominium?.name),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch = !term || searchable.includes(term);

    return matchesRole && matchesStatus && matchesSearch;
  });



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
      description="Gerencie acessos administrativos, síndicos, conselheiros e moradores."
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
              Gerencie acessos administrativos, síndicos, conselheiros, moradores e usuários
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
            applyResident={(residentId, availableResidents) =>
              applyResidentToForm(residentId, availableResidents, "create")
            }
            onClose={closeUserModal}
            onSubmit={createUsuario}
            saving={creating}
            submitLabel="Criar usuário"
            passwordHint="Senha obrigatória para novo usuário. Use uma senha forte com letra maiúscula, minúscula, número e caractere especial."
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
            applyResident={(residentId, availableResidents) =>
              applyResidentToForm(residentId, availableResidents, "edit")
            }
            onClose={closeUserModal}
            onSubmit={updateUsuario}
            saving={updating}
            submitLabel="Salvar alterações"
            passwordHint="Preencha somente se desejar alterar a senha. Se preencher, a nova senha deverá seguir a política de segurança."
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
                <PortfolioMetricBox
                  title="Total"
                  value={metrics.total}
                  description="Usuários cadastrados."
                  highlighted
                />

                <PortfolioMetricBox
                  title="Ativos"
                  value={metrics.active}
                  description="Com acesso ativo."
                  highlighted
                />

                <PortfolioMetricBox
                  title="Administradora"
                  value={metrics.administradora}
                  description="Perfis administrativos."
                />

                <PortfolioMetricBox
                  title="Portal"
                  value={metrics.sindico + metrics.conselheiro + metrics.morador}
                  description="Síndicos, conselheiros e moradores."
                />
              </div>
            </div>
          </div>

          <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Status dos acessos
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                <strong className="text-[#17211B]">{metrics.active}</strong>{" "}
                ativo(s) e{" "}
                <strong className="text-[#17211B]">{metrics.inactive}</strong>{" "}
                inativo(s).
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Perfis administrativos
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                <strong className="text-[#17211B]">{metrics.superAdmin}</strong>{" "}
                admin global e{" "}
                <strong className="text-[#17211B]">
                  {metrics.administradora}
                </strong>{" "}
                administradora(s).
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Perfis do portal
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                <strong className="text-[#17211B]">{metrics.sindico}</strong>{" "}
                síndico(s),{" "}
                <strong className="text-[#17211B]">{metrics.conselheiro}</strong>{" "}
                conselheiro(s) e{" "}
                <strong className="text-[#17211B]">{metrics.morador}</strong>{" "}
                morador(es).
              </p>
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
                  onChange={(e) => setRoleFilter(toRoleFilter(e.target.value))}
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
                  onChange={(e) => setStatusFilter(toStatusFilter(e.target.value))}
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
              de <strong className="text-[#17211B]">{usuarios.length}</strong>{" "}
              usuário(s).
            </p>
          </section>
        </ResponsiveSection>



        {/* =====================================================
            LISTAGEM COMPACTA
            ===================================================== */}

        {filteredUsuarios.length === 0 ? (
          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-8 text-center shadow-sm">
            <h2 className="mb-2 text-2xl font-semibold text-[#17211B]">
              Nenhum Usuário Encontrado
            </h2>

            <p className="mx-auto max-w-2xl text-sm leading-6 text-[#5E6B63]">
              Não encontramos usuários com os filtros atuais. Tente limpar os
              filtros ou cadastrar um novo usuário.
            </p>
          </section>
        ) : (
          <div className="space-y-3">
            {filteredUsuarios.map((usuario) => (
              <article
                key={usuario.id}
                className="rounded-[24px] border border-[#DDE5DF] bg-white p-5 shadow-sm transition hover:border-[#256D3C]/30 hover:shadow-[0_14px_38px_rgba(23,33,27,0.07)]"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${roleClass(
                          usuario.role
                        )}`}
                      >
                        {roleLabel(usuario.role)}
                      </span>

                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                          usuario.isActive
                        )}`}
                      >
                        {statusLabel(usuario.isActive)}
                      </span>

                      {getCouncilAccess(usuario) ? (
                        <span className="rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                          {getCouncilAccessTitle(usuario)}
                        </span>
                      ) : null}
                    </div>

                    <h2 className="break-words text-xl font-semibold tracking-tight text-[#17211B] md:text-2xl">
                      {usuario.name}
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                      {usuario.email}
                    </p>

                    <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                      Telefone: {formatPhoneDisplay(usuario.phone)}
                    </p>

                    <p className="mt-2 text-xs text-[#7A877F]">
                      Acesso vinculado a: {getUserLinkLabel(usuario)}
                    </p>

                    {getCouncilAccess(usuario) ? (
                      <p className="mt-1 text-xs font-semibold text-[#256D3C]">
                        Conselho: {getCouncilAccessLabel(usuario)}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-start gap-2 xl:w-[170px] xl:flex-col">
                    <button
                      type="button"
                      onClick={() => openEditModal(usuario)}
                      className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                    >
                      Editar
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleStatus(usuario)}
                      disabled={updatingId === usuario.id}
                      className={
                        usuario.isActive
                          ? "inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                          : "inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                      }
                    >
                      {updatingId === usuario.id
                        ? "Atualizando..."
                        : usuario.isActive
                          ? "Inativar"
                          : "Reativar"}
                    </button>
                  </div>
                </div>

                <details className="group mt-4 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#17211B]">
                    <span>Mais Informações</span>
                    <span className="text-[#7A877F] transition group-open:rotate-180">
                      ▾
                    </span>
                  </summary>

                  <div className="border-t border-[#DDE5DF] p-4">
                    <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-4">
                      <InfoLine label="Perfil" value={roleLabel(usuario.role)} />
                      <InfoLine
                        label="Status"
                        value={statusLabel(usuario.isActive)}
                      />
                      <InfoLine
                        label="Telefone"
                        value={formatPhoneDisplay(usuario.phone)}
                      />
                      <InfoLine
                        label="Principal"
                        value={getAccessMainLabel(usuario)}
                      />
                      <InfoLine
                        label="Detalhe"
                        value={getAccessDetailLabel(usuario)}
                      />
                      <InfoLine
                        label="Administradora"
                        value={usuario.administrator?.name || "-"}
                      />
                      <InfoLine
                        label="Condomínio"
                        value={
                          usuario.condominium?.name ||
                          usuario.resident?.condominium?.name ||
                          "-"
                        }
                      />
                      <InfoLine
                        label="Morador"
                        value={usuario.resident?.name || "-"}
                      />
                      <InfoLine
                        label="Cargo No Conselho"
                        value={getCouncilAccessTitle(usuario)}
                      />
                      <InfoLine
                        label="Condomínio Do Conselho"
                        value={getCouncilAccessCondominiumName(usuario)}
                      />
                      <InfoLine
                        label="Acesso De Conselho"
                        value={getCouncilAccessLabel(usuario)}
                      />
                      <InfoLine
                        label="Criado em"
                        value={
                          usuario.createdAt
                            ? new Date(usuario.createdAt).toLocaleString("pt-BR")
                            : "-"
                        }
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
  setForm: Dispatch<SetStateAction<UserFormState>>;
  administradoras: Administradora[];
  condominios: Condominio[];
  moradoresMorador: Morador[];
  moradoresSindico: Morador[];
  applyResident: (residentId: string, availableResidents: Morador[]) => void;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  submitLabel: string;
  passwordHint: string;
  isEditing: boolean;
}) {
  const emailInvalid = !!form.email && !isValidEmail(form.email);

  const passwordError = validatePasswordForForm(form.password, isEditing);
  const passwordInvalid = !!passwordError;
  const passwordChecks = getPasswordChecks(form.password);
  const showPasswordChecklist = !isEditing || !!form.password.trim();

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
                  role: toUserRole(e.target.value),
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


          {(form.role === "SINDICO" || form.role === "MORADOR") && (
            <section className="rounded-3xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#17211B]">
                    Perfil Adicional De Conselho
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-[#7A877F]">
                    Use esta opção quando o usuário também atuar como conselheiro do condomínio, sem perder o perfil principal de morador ou síndico.
                  </p>
                </div>

                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#17211B]">
                  <input
                    type="checkbox"
                    checked={form.councilAccessEnabled}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        councilAccessEnabled: e.target.checked,
                        councilAccessTitle: e.target.checked
                          ? prev.councilAccessTitle || "Conselheiro"
                          : prev.councilAccessTitle,
                        councilAccessCondominiumId:
                          prev.councilAccessCondominiumId ||
                          prev.condominiumId,
                      }))
                    }
                    className="h-4 w-4 rounded border-[#DDE5DF] text-[#256D3C]"
                  />
                  Ativar Perfil De Conselheiro
                </label>
              </div>

              {form.councilAccessEnabled && (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <FormField label="Condomínio Do Conselho" required>
                    <select
                      value={form.councilAccessCondominiumId || form.condominiumId}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          councilAccessCondominiumId: e.target.value,
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

                  <FormField label="Cargo/Função No Conselho">
                    <select
                      value={form.councilAccessTitle}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          councilAccessTitle: e.target.value,
                        }))
                      }
                      className="form-input"
                    >
                      <option value="Conselheiro">Conselheiro</option>
                      <option value="Presidente Do Conselho">Presidente Do Conselho</option>
                      <option value="Conselheiro Fiscal">Conselheiro Fiscal</option>
                      <option value="Conselheiro Consultivo">Conselheiro Consultivo</option>
                      <option value="Conselheiro Suplente">Conselheiro Suplente</option>
                    </select>
                  </FormField>
                </div>
              )}
            </section>
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

          <FormField label="Telefone para notificações/WhatsApp">
            <input
              value={form.phone}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  phone: normalizePhoneForForm(e.target.value),
                }))
              }
              className="form-input"
              placeholder="11999999999"
              inputMode="numeric"
            />

            <p className="mt-1 text-xs text-[#7A877F]">
              Telefone pessoal usado para notificações do usuário, incluindo
              WhatsApp quando o canal estiver ativo. Para moradores, o telefone
              cadastral do morador pode ser usado como sugestão.
            </p>

            {!!form.phone && !isValidPhoneForForm(form.phone) && (
              <p className="mt-1 text-xs text-yellow-700">
                Informe um telefone com DDD. Exemplo: 11999999999.
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
                isEditing
                  ? "Deixe em branco para manter a senha atual"
                  : "Crie uma senha forte"
              }
            />

            <p className="mt-1 text-xs text-[#7A877F]">
              {passwordHint}
            </p>

            {showPasswordChecklist && (
              <div className="mt-3 rounded-2xl border border-[#DDE5DF] bg-[#F7F9F8] px-4 py-3">
                <p className="mb-2 text-xs font-semibold text-[#17211B]">
                  A senha precisa conter:
                </p>

                <div className="grid gap-1.5">
                  {passwordChecks.map((check) => (
                    <div
                      key={check.label}
                      className="flex items-center gap-2 text-xs leading-5"
                    >
                      <span
                        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                          check.passed
                            ? "bg-[#256D3C] text-white"
                            : "bg-white text-[#9AA7A0] ring-1 ring-[#DDE5DF]"
                        }`}
                      >
                        {check.passed ? "✓" : "•"}
                      </span>

                      <span
                        className={
                          check.passed ? "text-[#256D3C]" : "text-[#64736A]"
                        }
                      >
                        {check.label}
                      </span>
                    </div>
                  ))}
                </div>

                {form.password && isBlockedPassword(form.password) && (
                  <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                    Esta senha é muito previsível. Escolha uma combinação
                    diferente.
                  </p>
                )}

                {passwordInvalid && (
                  <p className="mt-3 text-xs leading-5 text-yellow-700">
                    {passwordError}
                  </p>
                )}
              </div>
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