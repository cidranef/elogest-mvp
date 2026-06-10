"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import EloGestShell from "@/components/EloGestShell";



/* =========================================================
   ELOGEST - NOVA ADMINISTRADORA

   Rota:
   /elogest/administradoras/nova

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA

   Objetivo:
   - Permitir que a EloGest cadastre uma nova administradora.
   - Opcionalmente criar o primeiro usuário responsável pelo acesso.
   - Explicar de forma clara que a nova administradora nasce ativa.
   - Garantir criação segura do primeiro acesso administrativo.
   - Preparar o fluxo futuro de convite por e-mail.

   Segurança:
   - A API valida se o usuário é SUPER_ADMIN.
   - A API aplica a política central de senha forte.
   - Não existe senha padrão preenchida no formulário.
   - Esta página pertence ao ambiente interno da EloGest.
   ========================================================= */



function StepBadge({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#EAF7EE] text-xs font-bold text-[#256D3C]">
          {number}
        </span>

        <div>
          <p className="text-sm font-semibold text-[#17211B]">
            {title}
          </p>

          <p className="mt-1 text-sm leading-6 text-[#64736A]">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}




export default function NovaAdministradoraPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [createUser, setCreateUser] = useState(true);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");



  function onlyNumbers(value: string) {
    return value.replace(/\D/g, "");
  }



  function getPasswordChecklist(value: string) {
    return [
      {
        label: "Mínimo de 8 caracteres",
        valid: value.length >= 8,
      },
      {
        label: "Pelo menos 1 letra maiúscula",
        valid: /[A-Z]/.test(value),
      },
      {
        label: "Pelo menos 1 letra minúscula",
        valid: /[a-z]/.test(value),
      },
      {
        label: "Pelo menos 1 número",
        valid: /\d/.test(value),
      },
      {
        label: "Pelo menos 1 caractere especial",
        valid: /[^A-Za-z0-9]/.test(value),
      },
    ];
  }






  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    const normalizedName = name.trim();
    const normalizedCnpj = onlyNumbers(cnpj);
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = onlyNumbers(phone);

    const normalizedUserName = userName.trim();
    const normalizedUserEmail = userEmail.trim().toLowerCase();

    if (!normalizedName) {
      setError("Informe o nome da administradora.");
      return;
    }

    if (normalizedCnpj && normalizedCnpj.length !== 14) {
      setError("Informe um CNPJ válido com 14 dígitos ou deixe em branco.");
      return;
    }

    if (createUser) {
      if (!normalizedUserName) {
        setError("Informe o nome do usuário administrador.");
        return;
      }

      if (!normalizedUserEmail) {
        setError("Informe o e-mail do usuário administrador.");
        return;
      }

      const passwordChecklist = getPasswordChecklist(userPassword);
      const hasStrongPasswordBase = passwordChecklist.every((item) => item.valid);

      if (!hasStrongPasswordBase) {
        setError(
          "A senha inicial deve ter no mínimo 8 caracteres, com letra maiúscula, letra minúscula, número e caractere especial."
        );
        return;
      }
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/elogest/administradoras", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: normalizedName,
          cnpj: normalizedCnpj || null,
          email: normalizedEmail || null,
          phone: normalizedPhone || null,
          createUser,
          userName: normalizedUserName || null,
          userEmail: normalizedUserEmail || null,
          userPassword: userPassword || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Não foi possível cadastrar a administradora.");
        return;
      }

      router.push(`/elogest/administradoras/${data.administrator.id}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Não foi possível cadastrar a administradora. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }



  return (
    <EloGestShell current="administradoras">
      <div className="space-y-8">
        <section className="rounded-[34px] border border-[#DDE5DF] bg-white/90 p-6 shadow-[0_24px_80px_rgba(23,33,27,0.08)] backdrop-blur sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                Nova administradora
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-[#17211B] sm:text-4xl">
                Cadastrar administradora
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#64736A] sm:text-base sm:leading-7">
                Cadastre uma nova administradora cliente da EloGest. A administradora
                será criada como ativa e, se desejar, você já pode criar o primeiro
                responsável pelo acesso administrativo.
              </p>
            </div>

            <Link
              href="/elogest/administradoras"
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 py-3 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
            >
              Voltar
            </Link>
          </div>
        </section>

        <section className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)] backdrop-blur sm:p-8">
          <div className="mb-5">
            <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#17211B]">
              Fluxo de cadastro
            </h2>

            <p className="mt-1 text-sm leading-6 text-[#64736A]">
              Este cadastro cria a administradora e prepara o primeiro acesso
              para operação da carteira. O envio automático de convite por e-mail
              poderá substituir a senha temporária em uma próxima etapa.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <StepBadge
              number="1"
              title="Administradora"
              description="Informe os dados principais da empresa cliente."
            />

            <StepBadge
              number="2"
              title="Primeiro acesso"
              description="Crie o usuário responsável pelo início da operação."
            />

            <StepBadge
              number="3"
              title="Operação"
              description="Após o cadastro, a administradora acessa a área administrativa."
            />
          </div>
        </section>

        <section className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)] backdrop-blur sm:p-8">
          {error && (
            <div
              className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
              role="alert"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#17211B]">
                Dados da administradora
              </h2>

              <p className="mt-1 text-sm leading-6 text-[#64736A]">
                Essas informações identificam a administradora dentro do ambiente EloGest.
              </p>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
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
                    }}
                    placeholder="Ex.: Prisma Gestão Condominial"
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
                    }}
                    placeholder="Ex.: 1132048800"
                    className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                  />
                </div>

                <div className="md:col-span-2">
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
                    }}
                    placeholder="contato@administradora.com.br"
                    className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[26px] border border-[#DDE5DF] bg-[#F7F9F8] p-5">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={createUser}
                  onChange={(event) => {
                    setCreateUser(event.target.checked);
                    setError("");
                  }}
                  className="mt-1 h-4 w-4 accent-[#256D3C]"
                />

                <div>
                  <p className="text-sm font-semibold text-[#17211B]">
                    Criar primeiro responsável pelo acesso
                  </p>

                  <p className="mt-1 text-sm leading-6 text-[#64736A]">
                    Recomendado para que a administradora já consiga acessar o painel administrativo após o cadastro.
                  </p>
                </div>
              </label>

              {createUser && (
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <div>
                    <label
                      htmlFor="userName"
                      className="mb-2 block text-sm font-semibold text-[#17211B]"
                    >
                      Nome do usuário
                    </label>

                    <input
                      id="userName"
                      type="text"
                      value={userName}
                      onChange={(event) => {
                        setUserName(event.target.value);
                        setError("");
                      }}
                      placeholder="Ex.: Mariana Almeida"
                      className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:ring-4 focus:ring-[#256D3C]/10"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="userEmail"
                      className="mb-2 block text-sm font-semibold text-[#17211B]"
                    >
                      E-mail de acesso
                    </label>

                    <input
                      id="userEmail"
                      type="email"
                      value={userEmail}
                      onChange={(event) => {
                        setUserEmail(event.target.value);
                        setError("");
                      }}
                      placeholder="usuario@administradora.com.br"
                      className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:ring-4 focus:ring-[#256D3C]/10"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label
                      htmlFor="userPassword"
                      className="mb-2 block text-sm font-semibold text-[#17211B]"
                    >
                      Senha temporária
                    </label>

                    <input
                      id="userPassword"
                      type="password"
                      value={userPassword}
                      onChange={(event) => {
                        setUserPassword(event.target.value);
                        setError("");
                      }}
                      placeholder="Crie uma senha temporária forte"
                      autoComplete="new-password"
                      className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:ring-4 focus:ring-[#256D3C]/10"
                    />

                    <div className="mt-3 grid gap-2 rounded-2xl border border-[#DDE5DF] bg-white/70 p-4 sm:grid-cols-2">
                      {getPasswordChecklist(userPassword).map((item) => (
                        <div
                          key={item.label}
                          className={[
                            "flex items-center gap-2 text-xs font-semibold",
                            item.valid ? "text-[#256D3C]" : "text-[#7A877F]",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "flex h-5 w-5 items-center justify-center rounded-full border text-[10px]",
                              item.valid
                                ? "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]"
                                : "border-[#DDE5DF] bg-[#F7F9F8] text-[#9AA7A0]",
                            ].join(" ")}
                          >
                            {item.valid ? "✓" : "•"}
                          </span>
                          {item.label}
                        </div>
                      ))}
                    </div>

                    <p className="mt-2 text-xs leading-5 text-[#64736A]">
                      A senha temporária deve ser forte e não deve conter partes
                      do nome ou e-mail do usuário. Em uma próxima etapa, este
                      processo poderá ser substituído por convite por e-mail.
                    </p>
                  </div>
                </div>
              )}
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
                disabled={loading}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32] disabled:cursor-not-allowed disabled:bg-[#9AA7A0]"
              >
                {loading ? "Salvando..." : "Cadastrar administradora"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </EloGestShell>
  );
}