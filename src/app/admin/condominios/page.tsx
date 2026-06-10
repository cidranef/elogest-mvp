"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
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

   ETAPA 39.17.8 — PADRONIZAÇÃO DO CARREGAMENTO

   ETAPA 45 — CADASTRO CONDOMINIAL AVANÇADO

   ETAPA 45.2 — IMAGEM DA FACHADA
   - Adicionado facadeImagePath no formulário.
   - Adicionado preview da fachada.
   - Adicionada miniatura na listagem.
   - Adicionado botão Detalhes apontando para /admin/condominios/[id].
   - Adicionado upload de fachada com otimização automática no navegador.
   - Imagem convertida para WEBP antes do envio.
   - Upload salvo em /public/uploads/condominios/fachadas.
   ========================================================= */



/* =========================================================
   TYPES
   ========================================================= */

type CondominiumStatus = "ACTIVE" | "INACTIVE";

type CondominiumType =
  | "RESIDENTIAL"
  | "COMMERCIAL"
  | "MIXED"
  | "HORIZONTAL"
  | "OTHER";



interface Administradora {
  id: string;
  name: string;
}



interface Condominio {
  id: string;
  administratorId: string;
  administrator?: Administradora | null;

  name: string;
  legalName?: string | null;
  cnpj?: string | null;
  type?: CondominiumType | string | null;

  facadeImagePath?: string | null;

  email?: string | null;
  phone?: string | null;

  administrativeContactName?: string | null;
  administrativeContactEmail?: string | null;
  administrativeContactPhone?: string | null;

  cep?: string | null;
  address?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;

  unitsCount?: number | null;
  blocksCount?: number | null;
  managementStartDate?: string | null;
  managementEndDate?: string | null;
  notes?: string | null;

  status: CondominiumStatus | string;
  createdAt: string;
  updatedAt?: string | null;

  totalUnits?: number;
  activeUnits?: number;

  totalResidents?: number;
  activeResidents?: number;

  totalTickets?: number;
  openTickets?: number;
}



interface CondominioFormState {
  name: string;
  legalName: string;
  cnpj: string;
  type: CondominiumType;

  facadeImagePath: string;

  email: string;
  phone: string;

  administrativeContactName: string;
  administrativeContactEmail: string;
  administrativeContactPhone: string;

  cep: string;
  address: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;

  unitsCount: string;
  blocksCount: string;
  managementStartDate: string;
  managementEndDate: string;
  notes: string;

  status: CondominiumStatus;
}



interface ApiErrorResponse {
  error?: string;
}



interface FacadeUploadResponse {
  facadeImagePath?: string;
  error?: string;
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



const emptyForm: CondominioFormState = {
  name: "",
  legalName: "",
  cnpj: "",
  type: "RESIDENTIAL",

  facadeImagePath: "",

  email: "",
  phone: "",

  administrativeContactName: "",
  administrativeContactEmail: "",
  administrativeContactPhone: "",

  cep: "",
  address: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "SP",

  unitsCount: "",
  blocksCount: "",
  managementStartDate: "",
  managementEndDate: "",
  notes: "",

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



function isValidImagePath(value: string) {
  const text = value.trim();

  if (!text) return true;

  return (
    text.startsWith("/") ||
    text.startsWith("http://") ||
    text.startsWith("https://")
  );
}



function getFacadeUploadMessage(data: unknown, fallback: string) {
  if (typeof data === "object" && data !== null) {
    const response = data as FacadeUploadResponse;

    if (response.error) {
      return response.error;
    }
  }

  return fallback;
}



function getFacadeUploadPath(data: unknown) {
  if (typeof data === "object" && data !== null) {
    const response = data as FacadeUploadResponse;

    return response.facadeImagePath || "";
  }

  return "";
}



function resizeFacadeImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      reject(new Error("Envie uma imagem JPG, PNG ou WEBP."));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        const maxWidth = 1600;
        const maxHeight = 1000;

        let targetWidth = image.width;
        let targetHeight = image.height;

        const widthRatio = maxWidth / targetWidth;
        const heightRatio = maxHeight / targetHeight;
        const ratio = Math.min(widthRatio, heightRatio, 1);

        targetWidth = Math.round(targetWidth * ratio);
        targetHeight = Math.round(targetHeight * ratio);

        const canvas = document.createElement("canvas");

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const context = canvas.getContext("2d");

        if (!context) {
          reject(new Error("Não foi possível processar a imagem."));
          return;
        }

        context.drawImage(image, 0, 0, targetWidth, targetHeight);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Não foi possível gerar a imagem otimizada."));
              return;
            }

            const optimizedFile = new File([blob], "fachada-condominio.webp", {
              type: "image/webp",
              lastModified: Date.now(),
            });

            resolve(optimizedFile);
          },
          "image/webp",
          0.82
        );
      };

      image.onerror = () => {
        reject(new Error("Não foi possível ler a imagem selecionada."));
      };

      image.src = String(reader.result || "");
    };

    reader.onerror = () => {
      reject(new Error("Não foi possível carregar o arquivo."));
    };

    reader.readAsDataURL(file);
  });
}



function isValidPositiveNumberText(value: string) {
  if (!value.trim()) return true;

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0;
}



function normalizeNumberText(value: string) {
  return onlyDigits(value);
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



function condominiumTypeLabel(type?: string | null) {
  return (
    {
      RESIDENTIAL: "Residencial",
      COMMERCIAL: "Comercial",
      MIXED: "Misto",
      HORIZONTAL: "Horizontal",
      OTHER: "Outro",
    }[type || ""] ||
    type ||
    "-"
  );
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



function toInputDate(value?: string | null) {
  if (!value) return "";

  return value.slice(0, 10);
}



function validateCondominioForm(form: CondominioFormState) {
  if (!form.name.trim()) {
    return "Informe o nome do condomínio.";
  }

  if (form.cnpj && onlyDigits(form.cnpj).length !== 14) {
    return "Informe um CNPJ válido com 14 dígitos.";
  }

  if (form.facadeImagePath && !isValidImagePath(form.facadeImagePath)) {
    return "Informe uma URL/caminho válido para a imagem da fachada. Exemplo: https://... ou /uploads/...";
  }

  if (form.email && !isValidEmail(form.email)) {
    return "Informe um e-mail principal válido.";
  }

  if (
    form.administrativeContactEmail &&
    !isValidEmail(form.administrativeContactEmail)
  ) {
    return "Informe um e-mail válido para o contato administrativo.";
  }

  if (form.cep && onlyDigits(form.cep).length !== 8) {
    return "Informe um CEP válido com 8 dígitos.";
  }

  if (form.state && form.state.trim().length !== 2) {
    return "Informe a UF com 2 letras. Exemplo: SP.";
  }

  if (!isValidPositiveNumberText(form.unitsCount)) {
    return "Informe uma quantidade válida de unidades.";
  }

  if (!isValidPositiveNumberText(form.blocksCount)) {
    return "Informe uma quantidade válida de blocos/torres.";
  }

  if (
    form.managementStartDate &&
    form.managementEndDate &&
    form.managementEndDate < form.managementStartDate
  ) {
    return "A data de encerramento da gestão não pode ser anterior à data de início.";
  }

  return "";
}



function buildPayload(form: CondominioFormState) {
  return {
    name: form.name.trim(),
    legalName: form.legalName.trim() || null,
    cnpj: form.cnpj ? formatCnpj(form.cnpj) : null,
    type: form.type,

    facadeImagePath: form.facadeImagePath.trim() || null,

    email: form.email.trim() || null,
    phone: form.phone.trim() || null,

    administrativeContactName:
      form.administrativeContactName.trim() || null,
    administrativeContactEmail:
      form.administrativeContactEmail.trim() || null,
    administrativeContactPhone:
      form.administrativeContactPhone.trim() || null,

    cep: form.cep.trim() || null,
    address: form.address.trim() || null,
    number: form.number.trim() || null,
    complement: form.complement.trim() || null,
    district: form.district.trim() || null,
    city: form.city.trim() || null,
    state: form.state.trim().toUpperCase() || null,

    unitsCount: form.unitsCount ? Number(form.unitsCount) : null,
    blocksCount: form.blocksCount ? Number(form.blocksCount) : null,
    managementStartDate: form.managementStartDate || null,
    managementEndDate: form.managementEndDate || null,
    notes: form.notes.trim() || null,

    status: form.status || "ACTIVE",
  };
}



function buildEditForm(condominio: Condominio): CondominioFormState {
  return {
    name: condominio.name || "",
    legalName: condominio.legalName || "",
    cnpj: condominio.cnpj || "",
    type:
      condominio.type === "COMMERCIAL" ||
      condominio.type === "MIXED" ||
      condominio.type === "HORIZONTAL" ||
      condominio.type === "OTHER"
        ? condominio.type
        : "RESIDENTIAL",

    facadeImagePath: condominio.facadeImagePath || "",

    email: condominio.email || "",
    phone: condominio.phone || "",

    administrativeContactName: condominio.administrativeContactName || "",
    administrativeContactEmail: condominio.administrativeContactEmail || "",
    administrativeContactPhone: condominio.administrativeContactPhone || "",

    cep: condominio.cep || "",
    address: condominio.address || "",
    number: condominio.number || "",
    complement: condominio.complement || "",
    district: condominio.district || "",
    city: condominio.city || "",
    state: condominio.state || "SP",

    unitsCount:
      condominio.unitsCount !== null && condominio.unitsCount !== undefined
        ? String(condominio.unitsCount)
        : "",
    blocksCount:
      condominio.blocksCount !== null && condominio.blocksCount !== undefined
        ? String(condominio.blocksCount)
        : "",
    managementStartDate: toInputDate(condominio.managementStartDate),
    managementEndDate: toInputDate(condominio.managementEndDate),
    notes: condominio.notes || "",

    status: condominio.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
  };
}



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
     CARREGAR CONDOMÍNIOS
     ========================================================= */

  const loadCondominios = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      try {
        if (showLoading) {
          setLoading(true);
        }

        setError("");

        const res = await fetch("/api/admin/condominios", {
          cache: "no-store",
        });

        const data: unknown = await res.json();

        if (!res.ok) {
          showError(getApiErrorMessage(data, "Erro ao carregar condomínios."));
          setCondominios([]);
          return;
        }

        if (!Array.isArray(data)) {
          showError("Resposta inválida da API.");
          setCondominios([]);
          return;
        }

        setCondominios(data as Condominio[]);
      } catch (err) {
        console.error(err);
        showError("Erro ao carregar condomínios.");
        setCondominios([]);
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [showError]
  );



  /* =========================================================
     CRIAR CONDOMÍNIO
     ========================================================= */

  async function createCondominio(e: FormEvent<HTMLFormElement>) {
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

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao criar condomínio."));
        return;
      }

      setForm(emptyForm);
      setModalOpen(false);

      await loadCondominios({ showLoading: false });

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
    setEditForm(buildEditForm(condominio));
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

  async function updateCondominio(e: FormEvent<HTMLFormElement>) {
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

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao atualizar condomínio."));
        return;
      }

      setSelectedCondominio(null);
      setEditModalOpen(false);
      setEditForm(emptyForm);

      await loadCondominios({ showLoading: false });

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
    const nextStatus =
      condominio.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

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

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao atualizar status."));
        return;
      }

      await loadCondominios({ showLoading: false });

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
    let isMounted = true;

    fetch("/api/admin/condominios", {
      cache: "no-store",
    })
      .then(async (res) => {
        const data: unknown = await res.json();

        if (!isMounted) {
          return;
        }

        if (!res.ok) {
          showError(
            getApiErrorMessage(data, "Erro ao carregar condomínios.")
          );
          setCondominios([]);
          return;
        }

        if (!Array.isArray(data)) {
          showError("Resposta inválida da API.");
          setCondominios([]);
          return;
        }

        setCondominios(data as Condominio[]);
      })
      .catch((err: unknown) => {
        if (!isMounted) {
          return;
        }

        console.error(err);
        showError("Erro ao carregar condomínios.");
        setCondominios([]);
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
     MÉTRICAS
     ========================================================= */

  const metrics = useMemo(() => {
    return {
      total: condominios.length,
      active: condominios.filter((item) => item.status === "ACTIVE").length,
      inactive: condominios.filter((item) => item.status === "INACTIVE").length,

      unitsPlanned: condominios.reduce(
        (sum, item) => sum + Number(item.unitsCount || 0),
        0
      ),

      unitsActive: condominios.reduce(
        (sum, item) =>
          sum + Number(item.activeUnits ?? item.totalUnits ?? 0),
        0
      ),

      residentsActive: condominios.reduce(
        (sum, item) =>
          sum + Number(item.activeResidents ?? item.totalResidents ?? 0),
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
        condominio.legalName,
        condominio.cnpj,
        condominiumTypeLabel(condominio.type),
        condominio.facadeImagePath,
        condominio.email,
        condominio.phone,
        condominio.administrativeContactName,
        condominio.administrativeContactEmail,
        condominio.administrativeContactPhone,
        condominio.cep,
        condominio.address,
        condominio.district,
        condominio.city,
        condominio.state,
        condominio.notes,
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
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
              Cadastros
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
              Condomínios
            </h1>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
              Gerencie a carteira de condomínios, dados cadastrais, contatos,
              endereço, operação, fachada e indicadores da base administrada.
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



        {modalOpen && (
          <CondominioModal
            title="Novo Condomínio"
            description="Cadastre um novo condomínio na carteira. Informe o CEP para preencher o endereço automaticamente."
            form={form}
            setForm={setForm}
            submitting={creating}
            submitLabel="Criar Condomínio"
            submittingLabel="Criando..."
            onClose={closeCreateModal}
            onSubmit={createCondominio}
          />
        )}



        {editModalOpen && selectedCondominio && (
          <CondominioModal
            title="Editar Condomínio"
            description="Atualize os dados cadastrais, contatos, endereço, fachada e dados operacionais do condomínio."
            form={editForm}
            setForm={setEditForm}
            submitting={updating}
            submitLabel="Salvar Alterações"
            submittingLabel="Salvando..."
            onClose={closeEditModal}
            onSubmit={updateCondominio}
          />
        )}



        <section className="overflow-hidden rounded-[32px] border border-[#DDE5DF] bg-white shadow-sm">
          <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_62%,#EAF7EE_135%)] p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-[#17211B] md:text-3xl">
                  Visão da Carteira
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                  Resumo da base administrada, com foco em condomínios ativos,
                  unidades previstas, unidades cadastradas, moradores e chamados.
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
                  title="Previstas"
                  value={metrics.unitsPlanned}
                  description="Unidades informadas."
                />

                <PortfolioMetricBox
                  title="Cadastradas"
                  value={metrics.unitsActive}
                  description="Unidades ativas."
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
                <strong className="text-[#17211B]">{metrics.active}</strong>{" "}
                ativo(s) e{" "}
                <strong className="text-[#17211B]">{metrics.inactive}</strong>{" "}
                inativo(s).
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Base operacional
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                <strong className="text-[#17211B]">{metrics.unitsActive}</strong>{" "}
                unidade(s) ativa(s) e{" "}
                <strong className="text-[#17211B]">
                  {metrics.residentsActive}
                </strong>{" "}
                morador(es) ativo(s).
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Chamados em aberto
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                <strong className="text-[#17211B]">{metrics.openTickets}</strong>{" "}
                chamado(s) ainda em aberto na carteira.
              </p>
            </div>
          </div>
        </section>



        <ResponsiveSection
          title="Busca e Filtros"
          description="Localize condomínios por nome, CNPJ, tipo, contato, CEP, cidade, bairro, e-mail ou status."
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
              placeholder="Buscar por nome, CNPJ, tipo, contato, CEP, cidade, bairro, e-mail, status..."
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
                  <div className="flex min-w-0 flex-1 flex-col gap-4 md:flex-row md:items-start">
                    <CondominioFacadeThumb condominio={condominio} />

                    <div className="min-w-0 flex-1">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                            condominio.status
                          )}`}
                        >
                          {statusLabel(condominio.status)}
                        </span>

                        <span className="rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-semibold text-[#5E6B63]">
                          {condominiumTypeLabel(condominio.type)}
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

                      {condominio.legalName && (
                        <p className="mt-1 text-sm text-[#5E6B63]">
                          Razão social: {condominio.legalName}
                        </p>
                      )}

                      <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                        {getAddressLabel(condominio)}
                      </p>

                      <p className="mt-2 text-xs text-[#7A877F]">
                        Administradora: {condominio.administrator?.name || "-"}{" "}
                        • CNPJ: {condominio.cnpj || "-"} • CEP:{" "}
                        {condominio.cep || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-start gap-2 xl:w-[170px] xl:flex-col">
                    <Link
                      href={`/admin/condominios/${condominio.id}`}
                      className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#17211B] px-4 text-sm font-semibold text-white transition hover:bg-[#26382D]"
                    >
                      Detalhes
                    </Link>

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

                <details className="group mt-4 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA]">
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
                        value={`${condominio.activeUnits ?? condominio.totalUnits ?? 0} ativas / ${condominio.totalUnits || 0} cadastradas`}
                      />

                      <InfoLine
                        label="Unidades previstas"
                        value={condominio.unitsCount ?? "-"}
                      />

                      <InfoLine
                        label="Blocos/Torres"
                        value={condominio.blocksCount ?? "-"}
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
                        label="Contato principal"
                        value={`${condominio.email || "-"}${
                          condominio.phone ? ` • ${condominio.phone}` : ""
                        }`}
                      />

                      <InfoLine
                        label="Contato administrativo"
                        value={`${condominio.administrativeContactName || "-"}${
                          condominio.administrativeContactPhone
                            ? ` • ${condominio.administrativeContactPhone}`
                            : ""
                        }`}
                      />

                      <InfoLine
                        label="E-mail administrativo"
                        value={condominio.administrativeContactEmail || "-"}
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
                        label="Início da gestão"
                        value={
                          condominio.managementStartDate
                            ? new Date(
                                condominio.managementStartDate
                              ).toLocaleDateString("pt-BR")
                            : "-"
                        }
                      />

                      <InfoLine
                        label="Criado em"
                        value={new Date(condominio.createdAt).toLocaleString(
                          "pt-BR"
                        )}
                      />

                      <InfoLine
                        label="Imagem da fachada"
                        value={condominio.facadeImagePath || "-"}
                      />
                    </div>

                    {condominio.notes && (
                      <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                          Observações internas
                        </p>

                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#5E6B63]">
                          {condominio.notes}
                        </p>
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
   MINIATURA DA FACHADA
   ========================================================= */

function CondominioFacadeThumb({
  condominio,
}: {
  condominio: Condominio;
}) {
  const imagePath = condominio.facadeImagePath?.trim();

  if (!imagePath) {
    return (
      <div className="flex h-28 w-full shrink-0 items-center justify-center rounded-3xl border border-dashed border-[#CFE6D4] bg-[#F6F8F7] text-center text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F] md:w-36">
        Sem fachada
      </div>
    );
  }

  return (
    <div
      className="h-28 w-full shrink-0 rounded-3xl border border-[#DDE5DF] bg-cover bg-center shadow-sm md:w-36"
      style={{
        backgroundImage: `url("${imagePath}")`,
      }}
      aria-label={`Fachada do condomínio ${condominio.name}`}
      role="img"
    />
  );
}



/* =========================================================
   MODAL REUTILIZÁVEL
   ========================================================= */

function CondominioModal({
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
  form: CondominioFormState;
  setForm: Dispatch<SetStateAction<CondominioFormState>>;
  submitting: boolean;
  submitLabel: string;
  submittingLabel: string;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#17211B]/65 p-4 backdrop-blur-sm">
      <div className="my-6 max-h-[calc(100vh-3rem)] w-full max-w-4xl overflow-y-auto rounded-[32px] border border-[#DDE5DF] bg-white p-6 shadow-2xl">
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
            disabled={submitting}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-[#5E6B63] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <CondominioFormFields form={form} setForm={setForm} />

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
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
   COMPONENTE REUTILIZÁVEL DOS CAMPOS DO FORMULÁRIO
   ========================================================= */

function CondominioFormFields({
  form,
  setForm,
}: {
  form: CondominioFormState;
  setForm: Dispatch<SetStateAction<CondominioFormState>>;
}) {
  const [cepLoading, setCepLoading] = useState(false);
  const [cepMessage, setCepMessage] = useState("");

  const [facadeUploading, setFacadeUploading] = useState(false);
  const [facadeMessage, setFacadeMessage] = useState("");



  async function uploadFacadeFile(file: File) {
    try {
      setFacadeUploading(true);
      setFacadeMessage("Otimizando imagem...");

      const optimizedFile = await resizeFacadeImage(file);

      if (optimizedFile.size > 2 * 1024 * 1024) {
        setFacadeMessage(
          "A imagem otimizada ainda ficou acima de 2MB. Tente uma imagem menor."
        );
        return;
      }

      const formData = new FormData();

      formData.append("file", optimizedFile);

      setFacadeMessage("Enviando imagem...");

      const res = await fetch("/api/admin/condominios/fachada-upload", {
        method: "POST",
        body: formData,
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        setFacadeMessage(
          getFacadeUploadMessage(data, "Erro ao enviar imagem da fachada.")
        );
        return;
      }

      const imagePath = getFacadeUploadPath(data);

      if (!imagePath) {
        setFacadeMessage("Upload concluído, mas o caminho da imagem não retornou.");
        return;
      }

      setForm((prev) => ({
        ...prev,
        facadeImagePath: imagePath,
      }));

      setFacadeMessage("Fachada enviada e otimizada com sucesso.");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro ao processar imagem da fachada.";

      setFacadeMessage(message);
    } finally {
      setFacadeUploading(false);
    }
  }



  function handleFacadeFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    void uploadFacadeFile(file);
  }



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

      const data = (await res.json()) as ViaCepResponse;

      if (!res.ok || data.erro) {
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
      <section className="space-y-4 rounded-[28px] border border-[#DDE5DF] bg-[#F6F8F7] p-4">
        <div>
          <h3 className="font-semibold text-[#17211B]">
            Identificação
          </h3>

          <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
            Dados principais usados para identificar o condomínio na carteira.
          </p>
        </div>

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

        <FormField label="Razão social">
          <input
            value={form.legalName}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, legalName: e.target.value }))
            }
            className="form-input"
            placeholder="Nome jurídico, quando aplicável"
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

          <FormField label="Tipo">
            <select
              value={form.type}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  type: e.target.value as CondominiumType,
                }))
              }
              className="form-input"
            >
              <option value="RESIDENTIAL">Residencial</option>
              <option value="COMMERCIAL">Comercial</option>
              <option value="MIXED">Misto</option>
              <option value="HORIZONTAL">Horizontal</option>
              <option value="OTHER">Outro</option>
            </select>
          </FormField>

          <FormField label="Status">
            <select
              value={form.status}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  status:
                    e.target.value === "INACTIVE" ? "INACTIVE" : "ACTIVE",
                }))
              }
              className="form-input"
            >
              <option value="ACTIVE">Ativo</option>
              <option value="INACTIVE">Inativo</option>
            </select>
          </FormField>
        </div>
      </section>



      <section className="space-y-4 rounded-[28px] border border-[#DDE5DF] bg-[#F6F8F7] p-4">
        <div>
          <h3 className="font-semibold text-[#17211B]">
            Fachada do condomínio
          </h3>

          <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
            Envie uma imagem da fachada. O sistema otimiza automaticamente para
            WEBP, com largura máxima de 1600px e altura máxima de 1000px.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
          <FacadePreview imagePath={form.facadeImagePath} />

          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32]">
                {facadeUploading ? "Enviando..." : "Upload da fachada"}

                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={facadeUploading}
                  onChange={handleFacadeFileChange}
                />
              </label>

              {form.facadeImagePath && (
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      facadeImagePath: "",
                    }))
                  }
                  disabled={facadeUploading}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                >
                  Remover imagem
                </button>
              )}
            </div>

            {facadeMessage && (
              <div
                className={
                  facadeMessage.includes("sucesso")
                    ? "rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] p-3 text-sm text-[#256D3C]"
                    : "rounded-2xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800"
                }
              >
                {facadeMessage}
              </div>
            )}

            <FormField label="Caminho gerado da imagem">
              <input
                value={form.facadeImagePath}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    facadeImagePath: e.target.value,
                  }))
                }
                className="form-input"
                placeholder="O caminho será preenchido automaticamente após o upload"
              />

              {form.facadeImagePath &&
                !isValidImagePath(form.facadeImagePath) && (
                  <p className="mt-1 text-xs text-yellow-700">
                    Use uma URL iniciada por http(s):// ou um caminho iniciado
                    por /.
                  </p>
                )}
            </FormField>
          </div>
        </div>
      </section>



      <section className="space-y-4 rounded-[28px] border border-[#DDE5DF] bg-[#F6F8F7] p-4">
        <div>
          <h3 className="font-semibold text-[#17211B]">
            Contatos
          </h3>

          <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
            Contatos principais e administrativos para comunicação operacional.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField label="E-mail principal">
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

          <FormField label="Telefone principal">
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormField label="Contato administrativo">
            <input
              value={form.administrativeContactName}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  administrativeContactName: e.target.value,
                }))
              }
              className="form-input"
              placeholder="Nome do responsável"
            />
          </FormField>

          <FormField label="E-mail administrativo">
            <input
              type="email"
              value={form.administrativeContactEmail}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  administrativeContactEmail: e.target.value,
                }))
              }
              className="form-input"
              placeholder="responsavel@condominio.com"
            />
          </FormField>

          <FormField label="Telefone administrativo">
            <input
              value={form.administrativeContactPhone}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  administrativeContactPhone: formatPhone(e.target.value),
                }))
              }
              maxLength={15}
              className="form-input"
              placeholder="(11) 99999-9999"
            />
          </FormField>
        </div>
      </section>



      <section className="space-y-4 rounded-[28px] border border-[#DDE5DF] bg-[#F6F8F7] p-4">
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
                  void lookupCep(form.cep);
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
              onClick={() => void lookupCep(form.cep)}
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
      </section>



      <section className="space-y-4 rounded-[28px] border border-[#DDE5DF] bg-[#F6F8F7] p-4">
        <div>
          <h3 className="font-semibold text-[#17211B]">
            Dados operacionais
          </h3>

          <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
            Informações úteis para relatórios, implantação e governança da
            carteira.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <FormField label="Unidades previstas">
            <input
              value={form.unitsCount}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  unitsCount: normalizeNumberText(e.target.value),
                }))
              }
              inputMode="numeric"
              className="form-input"
              placeholder="120"
            />
          </FormField>

          <FormField label="Blocos/Torres">
            <input
              value={form.blocksCount}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  blocksCount: normalizeNumberText(e.target.value),
                }))
              }
              inputMode="numeric"
              className="form-input"
              placeholder="4"
            />
          </FormField>

          <FormField label="Início da gestão">
            <input
              type="date"
              value={form.managementStartDate}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  managementStartDate: e.target.value,
                }))
              }
              className="form-input"
            />
          </FormField>

          <FormField label="Fim da gestão">
            <input
              type="date"
              value={form.managementEndDate}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  managementEndDate: e.target.value,
                }))
              }
              className="form-input"
            />
          </FormField>
        </div>

        <FormField label="Observações internas">
          <textarea
            value={form.notes}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, notes: e.target.value }))
            }
            className="form-input min-h-28 resize-y"
            placeholder="Observações administrativas, particularidades da gestão, informações de implantação..."
          />
        </FormField>
      </section>
    </>
  );
}



/* =========================================================
   PREVIEW DA FACHADA
   ========================================================= */

function FacadePreview({
  imagePath,
}: {
  imagePath: string;
}) {
  const trimmedPath = imagePath.trim();

  if (!trimmedPath || !isValidImagePath(trimmedPath)) {
    return (
      <div className="flex h-40 items-center justify-center rounded-3xl border border-dashed border-[#CFE6D4] bg-white p-4 text-center text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
        Preview da fachada
      </div>
    );
  }

  return (
    <div
      className="h-40 rounded-3xl border border-[#DDE5DF] bg-cover bg-center shadow-sm"
      style={{
        backgroundImage: `url("${trimmedPath}")`,
      }}
      aria-label="Preview da fachada do condomínio"
      role="img"
    />
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