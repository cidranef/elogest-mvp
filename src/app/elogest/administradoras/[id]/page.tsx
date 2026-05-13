"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import EloGestShell from "@/components/EloGestShell";



/* =========================================================
   ELOGEST - DETALHE DA ADMINISTRADORA

   Rota:
   /elogest/administradoras/[id]

   ETAPA 42.2 — AMBIENTE SUPER ADMIN ELOGEST

   Objetivo:
   - Visualizar dados da administradora.
   - Editar dados principais.
   - Ativar/Inativar administradora.
   - Exibir condomínios e usuários vinculados.
   - Manter a área exclusiva da EloGest separada do AdminShell.

   ETAPA 42.2.1 — USUÁRIOS DA ADMINISTRADORA

   Ajuste desta revisão:
   - Adicionado botão "Novo usuário" no card de usuários vinculados.
   - O botão aponta para:
     /elogest/administradoras/[id]/usuarios/novo
   - Mantida a lógica funcional já aprovada.
   ========================================================= */



type Status = "ACTIVE" | "INACTIVE";



type AdministratorDetail = {
  id: string;
  name: string;
  cnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  status: Status;
  createdAt: string;
  updatedAt: string;
  condominiums: {
    id: string;
    name: string;
    city?: string | null;
    state?: string | null;
    status: Status;
    createdAt: string;
  }[];
  users: {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: string;
  }[];
};



function onlyNumbers(value: string) {
  return value.replace(/\D/g, "");
}



function statusLabel(status: string) {
  if (status === "ACTIVE") return "Ativa";
  if (status === "INACTIVE") return "Inativa";
  return status;
}



function formatDate(value?: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}



function InfoCard({
  title,
  value,
  description,
}: {
  title: string;
  value: number;
  description: string;
}) {
  return (
    <div className="rounded-[26px] border border-[#DDE5DF] bg-white/92 p-5 shadow-[0_16px_48px_rgba(23,33,27,0.06)]">
      <p className="text-sm font-semibold text-[#64736A]">
        {title}
      </p>

      <p className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-[#17211B]">
        {value}
      </p>

      <p className="mt-2 text-sm leading-6 text-[#7A877F]">
        {description}
      </p>
    </div>
  );
}



export default function EloGestAdministradoraDetalhePage() {
  const router = useRouter();
  const params = useParams();

  const administratorId = useMemo(() => {
    const rawId = params?.id;

    if (Array.isArray(rawId)) {
      return rawId[0] || "";
    }

    return rawId || "";
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [administrator, setAdministrator] = useState<AdministratorDetail | null>(null);

  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<Status>("ACTIVE");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");



  async function loadAdministrator() {
    if (!administratorId) {
      setError("Administradora não identificada.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const response = await fetch(`/api/elogest/administradoras/${administratorId}`, {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Não foi possível carregar a administradora.");
        return;
      }

      const item = data?.administrator as AdministratorDetail;

      setAdministrator(item);
      setName(item.name || "");
      setCnpj(item.cnpj || "");
      setEmail(item.email || "");
      setPhone(item.phone || "");
      setStatus(item.status || "ACTIVE");
    } catch (err) {
      console.error(err);
      setError("Não foi possível carregar a administradora.");
    } finally {
      setLoading(false);
    }
  }



  useEffect(() => {
    loadAdministrator();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [administratorId]);



  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) {
      return;
    }

    const normalizedName = name.trim();
    const normalizedCnpj = onlyNumbers(cnpj);
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = onlyNumbers(phone);

    if (!normalizedName) {
      setError("Informe o nome da administradora.");
      return;
    }

    if (normalizedCnpj && normalizedCnpj.length !== 14) {
      setError("Informe um CNPJ válido com 14 dígitos ou deixe em branco.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const response = await fetch(`/api/elogest/administradoras/${administratorId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: normalizedName,
          cnpj: normalizedCnpj || null,
          email: normalizedEmail || null,
          phone: normalizedPhone || null,
          status,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Não foi possível salvar as alterações.");
        return;
      }

      setAdministrator(data.administrator);
      setSuccess("Administradora atualizada com sucesso.");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  }



  return (
    <EloGestShell current="administradoras">
      <div className="space-y-8">



        {/* =====================================================
           HEADER
           ===================================================== */}

        <section className="rounded-[34px] border border-[#DDE5DF] bg-white/90 p-6 shadow-[0_24px_80px_rgba(23,33,27,0.08)] backdrop-blur sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                Detalhe da administradora
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-[#17211B] sm:text-4xl">
                {administrator?.name || "Administradora"}
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#64736A] sm:text-base sm:leading-7">
                Visualize e atualize os dados principais da administradora,
                além de acompanhar os usuários e condomínios vinculados.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/elogest/administradoras"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 py-3 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
              >
                Voltar
              </Link>

              <Link
                href="/elogest/administradoras/nova"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32]"
              >
                Nova administradora
              </Link>
            </div>
          </div>
        </section>



        {loading ? (
          <section className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-8 text-center shadow-[0_18px_55px_rgba(23,33,27,0.06)]">
            <p className="text-sm font-semibold text-[#64736A]">
              Carregando administradora...
            </p>
          </section>
        ) : error && !administrator ? (
          <section className="rounded-[30px] border border-red-200 bg-red-50 p-8 text-center shadow-[0_18px_55px_rgba(23,33,27,0.06)]">
            <p className="text-sm font-semibold text-red-800">
              {error}
            </p>

            <Link
              href="/elogest/administradoras"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32]"
            >
              Voltar para administradoras
            </Link>
          </section>
        ) : administrator ? (
          <>



            {/* =================================================
               KPIS
               ================================================= */}

            <section className="grid gap-4 md:grid-cols-3">
              <InfoCard
                title="Condomínios"
                value={administrator.condominiums.length}
                description="Condomínios vinculados a esta administradora."
              />

              <InfoCard
                title="Usuários"
                value={administrator.users.length}
                description="Usuários operacionais vinculados."
              />

              <InfoCard
                title="Status"
                value={administrator.status === "ACTIVE" ? 1 : 0}
                description={
                  administrator.status === "ACTIVE"
                    ? "Administradora ativa para operação."
                    : "Administradora inativa no momento."
                }
              />
            </section>



            {/* =================================================
               FORMULÁRIO DE EDIÇÃO
               ================================================= */}

            <section className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)] backdrop-blur sm:p-8">
              <div className="mb-6">
                <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#17211B]">
                  Dados principais
                </h2>

                <p className="mt-1 text-sm leading-6 text-[#64736A]">
                  Atualize os dados cadastrais e o status operacional da administradora.
                </p>
              </div>

              {error && (
                <div
                  className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {success && (
                <div
                  className="mb-6 rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 py-3 text-sm leading-6 text-[#256D3C]"
                  role="status"
                >
                  {success}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label
                      htmlFor="name"
                      className="mb-2 block text-sm font-semibold text-[#17211B]"
                    >
                      Nome da administradora
                    </label>

                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        setError("");
                        setSuccess("");
                      }}
                      className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="cnpj"
                      className="mb-2 block text-sm font-semibold text-[#17211B]"
                    >
                      CNPJ
                    </label>

                    <input
                      id="cnpj"
                      type="text"
                      value={cnpj}
                      onChange={(event) => {
                        setCnpj(event.target.value);
                        setError("");
                        setSuccess("");
                      }}
                      placeholder="Somente números"
                      className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="phone"
                      className="mb-2 block text-sm font-semibold text-[#17211B]"
                    >
                      Telefone
                    </label>

                    <input
                      id="phone"
                      type="text"
                      value={phone}
                      onChange={(event) => {
                        setPhone(event.target.value);
                        setError("");
                        setSuccess("");
                      }}
                      placeholder="Ex.: 1132048800"
                      className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="email"
                      className="mb-2 block text-sm font-semibold text-[#17211B]"
                    >
                      E-mail institucional
                    </label>

                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setError("");
                        setSuccess("");
                      }}
                      placeholder="contato@administradora.com.br"
                      className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="status"
                      className="mb-2 block text-sm font-semibold text-[#17211B]"
                    >
                      Status
                    </label>

                    <select
                      id="status"
                      value={status}
                      onChange={(event) => {
                        setStatus(event.target.value as Status);
                        setError("");
                        setSuccess("");
                      }}
                      className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    >
                      <option value="ACTIVE">Ativa</option>
                      <option value="INACTIVE">Inativa</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <Link
                    href="/elogest/administradoras"
                    className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 py-3 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
                  >
                    Cancelar
                  </Link>

                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32] disabled:cursor-not-allowed disabled:bg-[#9AA7A0]"
                  >
                    {saving ? "Salvando..." : "Salvar alterações"}
                  </button>
                </div>
              </form>
            </section>



            {/* =================================================
               USUÁRIOS E CONDOMÍNIOS
               ================================================= */}

            <section className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)] backdrop-blur">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#17211B]">
                      Usuários vinculados
                    </h2>

                    <p className="mt-1 text-sm leading-6 text-[#64736A]">
                      Usuários administrativos ligados a esta administradora.
                    </p>
                  </div>

                  <Link
                    href={`/elogest/administradoras/${administrator.id}/usuarios/novo`}
                    className="inline-flex w-fit min-h-10 items-center justify-center rounded-2xl bg-[#256D3C] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1F5A32]"
                  >
                    Novo usuário
                  </Link>
                </div>

                <div className="mt-5 divide-y divide-[#EEF2EF]">
                  {administrator.users.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F7F9F8] px-4 py-8 text-center">
                      <p className="text-sm font-semibold text-[#17211B]">
                        Nenhum usuário vinculado.
                      </p>
                    </div>
                  ) : (
                    administrator.users.map((user) => (
                      <div key={user.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#17211B]">
                              {user.name}
                            </p>

                            <p className="mt-1 text-xs leading-5 text-[#64736A]">
                              {user.email}
                            </p>
                          </div>

                          <span
                            className={[
                              "inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold",
                              user.isActive
                                ? "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]"
                                : "border-[#DDE5DF] bg-[#F7F9F8] text-[#64736A]",
                            ].join(" ")}
                          >
                            {user.isActive ? "Ativo" : "Inativo"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)] backdrop-blur">
                <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#17211B]">
                  Condomínios vinculados
                </h2>

                <p className="mt-1 text-sm leading-6 text-[#64736A]">
                  Condomínios cadastrados na carteira desta administradora.
                </p>

                <div className="mt-5 divide-y divide-[#EEF2EF]">
                  {administrator.condominiums.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F7F9F8] px-4 py-8 text-center">
                      <p className="text-sm font-semibold text-[#17211B]">
                        Nenhum condomínio vinculado.
                      </p>
                    </div>
                  ) : (
                    administrator.condominiums.map((condominium) => (
                      <div
                        key={condominium.id}
                        className="py-4 first:pt-0 last:pb-0"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#17211B]">
                              {condominium.name}
                            </p>

                            <p className="mt-1 text-xs leading-5 text-[#64736A]">
                              {[condominium.city, condominium.state]
                                .filter(Boolean)
                                .join(" / ") || "Localização não informada"}
                            </p>
                          </div>

                          <span
                            className={[
                              "inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold",
                              condominium.status === "ACTIVE"
                                ? "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]"
                                : "border-[#DDE5DF] bg-[#F7F9F8] text-[#64736A]",
                            ].join(" ")}
                          >
                            {statusLabel(condominium.status)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>



            {/* =================================================
               METADADOS
               ================================================= */}

            <section className="rounded-[26px] border border-[#DDE5DF] bg-[#F7F9F8] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7A877F]">
                Informações do cadastro
              </p>

              <div className="mt-3 grid gap-3 text-sm text-[#64736A] md:grid-cols-2">
                <p>
                  Criada em:{" "}
                  <strong className="font-semibold text-[#17211B]">
                    {formatDate(administrator.createdAt)}
                  </strong>
                </p>

                <p>
                  Atualizada em:{" "}
                  <strong className="font-semibold text-[#17211B]">
                    {formatDate(administrator.updatedAt)}
                  </strong>
                </p>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </EloGestShell>
  );
}