"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DIAGNOSIS_MODULES,
  DIAGNOSIS_PAINS,
  DIAGNOSIS_SYSTEMS,
} from "@/lib/commercial-diagnosis-options";

type FormState = {
  respondentName: string;
  respondentEmail: string;
  respondentPhone: string;
  yearsInMarket: string | number;
  condominiumCount: string | number;
  unitCount: string | number;
  teamSize: string | number;
  currentSystems: string[];
  currentSystemsOther: string;
  painPoints: string[];
  painPointsOther: string;
  primaryPain: string;
  desiredModules: string[];
  urgency: string;
  decisionRole: string;
  budgetStatus: string;
  pilotReadiness: string;
  competitorName: string;
  objections: string[];
  additionalNotes: string;
  consentAccepted: boolean;
  privacyAcknowledged: boolean;
};

const OBJECTION_OPTIONS = [
  "Preço",
  "Tempo para implantação",
  "Resistência da equipe",
  "Uso pelos moradores",
  "Migração de dados",
  "Integrações",
  "Segurança e LGPD",
  "Já utiliza outro sistema",
] as const;

const emptyState: FormState = {
  respondentName: "",
  respondentEmail: "",
  respondentPhone: "",
  yearsInMarket: "",
  condominiumCount: "",
  unitCount: "",
  teamSize: "",
  currentSystems: [],
  currentSystemsOther: "",
  painPoints: [],
  painPointsOther: "",
  primaryPain: "",
  desiredModules: [],
  urgency: "",
  decisionRole: "",
  budgetStatus: "",
  pilotReadiness: "",
  competitorName: "",
  objections: [],
  additionalNotes: "",
  consentAccepted: false,
  privacyAcknowledged: false,
};

type Props = { token: string };

type LoadedItem = {
  status: "ACTIVE" | "COMPLETED" | "EXPIRED" | "REVOKED";
  expiresAt: string;
  completedAt: string | null;
  administratorName: string;
  contactName: string;
  contactEmail: string;
  respondentName: string | null;
  respondentEmail: string | null;
  respondentPhone: string | null;
  consentAccepted: boolean;
  privacyAcknowledged: boolean;
  responses: Record<string, unknown> | null;
};

function toggle(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function CheckGroup({
  title,
  description,
  items,
  value,
  onChange,
}: {
  title: string;
  description?: string;
  items: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset className="space-y-3">
      <div>
        <legend className="text-base font-bold text-[#17211B]">{title}</legend>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-[#667269]">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <label
            key={item}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-[#DDE5DF] bg-white px-3 py-2.5 text-sm text-[#344139] transition hover:border-[#9FB3A5] hover:bg-[#F8FAF8]"
          >
            <input
              type="checkbox"
              checked={value.includes(item)}
              onChange={() => onChange(toggle(value, item))}
              className="mt-0.5 h-4 w-4 accent-[#256D3C]"
            />
            <span>{item}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SectionHeader({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-[#E3E9E4] pb-4">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E9F3EC] text-sm font-bold text-[#256D3C]">
          {step}
        </span>
        <h2 className="text-xl font-bold text-[#17211B]">{title}</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-[#667269]">{description}</p>
    </div>
  );
}

function RequiredMark() {
  return <span className="ml-1 text-red-600" aria-hidden="true">*</span>;
}

export default function DiagnosisForm({ token }: Props) {
  const [form, setForm] = useState<FormState>(emptyState);
  const [item, setItem] = useState<LoadedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    fetch(`/api/public/comercial/diagnostico/${token}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const contentType = response.headers.get("content-type") || "";
        const payload = contentType.includes("application/json")
          ? await response.json()
          : {
              error:
                "A API pública do diagnóstico não foi encontrada ou retornou uma resposta inválida.",
            };

        if (!response.ok) {
          throw new Error(
            payload.error || "Não foi possível carregar o diagnóstico.",
          );
        }

        return payload.item as LoadedItem;
      })
      .then((loaded) => {
        if (!active) return;

        setItem(loaded);
        const responses = loaded.responses || {};

        setForm({
          ...emptyState,
          respondentName:
            loaded.respondentName || loaded.contactName || "",
          respondentEmail:
            loaded.respondentEmail || loaded.contactEmail || "",
          respondentPhone: loaded.respondentPhone || "",
          consentAccepted: loaded.consentAccepted,
          privacyAcknowledged: loaded.privacyAcknowledged,
          yearsInMarket:
            (responses.yearsInMarket as number | null) ?? "",
          condominiumCount:
            (responses.condominiumCount as number | null) ?? "",
          unitCount: (responses.unitCount as number | null) ?? "",
          teamSize: (responses.teamSize as number | null) ?? "",
          currentSystems: Array.isArray(responses.currentSystems)
            ? (responses.currentSystems as string[])
            : [],
          currentSystemsOther:
            typeof responses.currentSystemsOther === "string"
              ? responses.currentSystemsOther
              : "",
          painPoints: Array.isArray(responses.painPoints)
            ? (responses.painPoints as string[])
            : [],
          painPointsOther:
            typeof responses.painPointsOther === "string"
              ? responses.painPointsOther
              : "",
          primaryPain:
            typeof responses.primaryPain === "string"
              ? responses.primaryPain
              : "",
          desiredModules: Array.isArray(responses.desiredModules)
            ? (responses.desiredModules as string[])
            : [],
          urgency:
            typeof responses.urgency === "string" ? responses.urgency : "",
          decisionRole:
            typeof responses.decisionRole === "string"
              ? responses.decisionRole
              : "",
          budgetStatus:
            typeof responses.budgetStatus === "string"
              ? responses.budgetStatus
              : "",
          pilotReadiness:
            typeof responses.pilotReadiness === "string"
              ? responses.pilotReadiness
              : "",
          competitorName:
            typeof responses.competitorName === "string"
              ? responses.competitorName
              : "",
          objections: Array.isArray(responses.objections)
            ? (responses.objections as string[])
            : [],
          additionalNotes:
            typeof responses.additionalNotes === "string"
              ? responses.additionalNotes
              : "",
        });
      })
      .catch((cause) => {
        if (!active) return;
        setError(
          cause instanceof Error ? cause.message : "Erro ao carregar.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const readOnly = item?.status !== "ACTIVE";

  const statusMessage = useMemo(() => {
    if (!item) return "";
    if (item.status === "COMPLETED") {
      return "Este diagnóstico já foi enviado. Obrigado pelas informações.";
    }
    if (item.status === "EXPIRED") {
      return "Este link expirou. Solicite um novo link ao responsável pelo atendimento.";
    }
    if (item.status === "REVOKED") {
      return "Este link foi revogado e não está mais disponível.";
    }
    return "";
  }, [item]);

  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validateForCompletion() {
    if (!form.respondentName.trim()) {
      return "Informe o nome do responsável pelo preenchimento.";
    }
    if (!form.respondentEmail.trim()) {
      return "Informe um e-mail para contato.";
    }
    if (!form.primaryPain.trim()) {
      return "Descreva qual problema mais impacta a operação atualmente.";
    }
    if (!form.consentAccepted || !form.privacyAcknowledged) {
      return "Aceite o tratamento das informações e confirme a ciência da Política de Privacidade.";
    }
    return "";
  }

  async function save(completed: boolean) {
    if (completed) {
      const validationError = validateForCompletion();
      if (validationError) {
        setError(validationError);
        setMessage("");
        return;
      }

      const confirmed = window.confirm(
        "Deseja enviar o diagnóstico? Após o envio, as respostas ficarão bloqueadas para edição.",
      );
      if (!confirmed) return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/public/comercial/diagnostico/${token}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, completed }),
        },
      );

      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json")
        ? await response.json()
        : {
            error:
              "A API pública do diagnóstico retornou uma resposta inválida.",
          };

      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível salvar.");
      }

      setMessage(
        completed
          ? "Diagnóstico enviado com sucesso."
          : "Respostas salvas com sucesso. Você pode continuar posteriormente usando este mesmo link.",
      );

      if (completed) {
        setItem((current) =>
          current
            ? {
                ...current,
                status: "COMPLETED",
                completedAt: new Date().toISOString(),
              }
            : current,
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Erro ao salvar.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#DDE5DF] bg-white p-6 text-[#344139]">
        Carregando diagnóstico...
      </div>
    );
  }

  if (error && !item) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
        {error}
      </div>
    );
  }

  if (item?.status === "COMPLETED") {
    return (
      <div className="space-y-6">
        <section className="rounded-3xl border border-[#BFD7C6] bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#E9F3EC] text-2xl text-[#256D3C]">
            ✓
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-[#6F7B73]">
            Diagnóstico Comercial
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[#17211B]">
            Diagnóstico enviado com sucesso
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#5B665F]">
            Obrigado pelas informações. Nossa equipe analisará as respostas e
            utilizará os dados para preparar uma apresentação e uma proposta
            mais aderentes à realidade da sua administradora.
          </p>
          <p className="mt-5 text-sm font-semibold text-[#344139]">
            {item.administratorName}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {item ? (
        <section className="rounded-3xl border border-[#DDE5DF] bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6F7B73]">
            Diagnóstico Comercial
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[#17211B]">
            {item.administratorName}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#5B665F]">
            Suas respostas ajudarão a preparar uma demonstração e uma proposta
            mais aderentes à realidade da administradora.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-[#F4F7F4] px-4 py-3 text-sm text-[#344139]">
              <strong>Tempo estimado:</strong> 5 a 8 minutos.
            </div>
            <div className="rounded-2xl bg-[#F4F7F4] px-4 py-3 text-sm text-[#344139]">
              Você pode salvar as respostas e continuar depois usando este
              mesmo link.
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 text-center text-xs font-semibold text-[#526057] sm:grid-cols-4">
            {["Identificação", "Operação", "Necessidades", "Decisão"].map(
              (label, index) => (
                <div
                  key={label}
                  className="rounded-xl border border-[#DDE5DF] bg-white px-2 py-2"
                >
                  {index + 1}. {label}
                </div>
              ),
            )}
          </div>

          {statusMessage ? (
            <div className="mt-4 rounded-xl bg-[#F2F6F3] p-4 text-sm font-semibold text-[#344139]">
              {statusMessage}
            </div>
          ) : null}
        </section>
      ) : null}

      {!readOnly ? (
        <>
          <section className="rounded-3xl border border-[#DDE5DF] bg-white p-6 shadow-sm sm:p-8">
            <SectionHeader
              step={1}
              title="Identificação"
              description="Informe quem está preenchendo o diagnóstico. Os campos marcados com asterisco são obrigatórios para o envio."
            />

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <label className="text-sm font-semibold text-[#344139]">
                Nome
                <RequiredMark />
                <input
                  value={form.respondentName}
                  onChange={(event) =>
                    field("respondentName", event.target.value)
                  }
                  autoComplete="name"
                  className="mt-2 min-h-11 w-full rounded-xl border border-[#C9D6CD] px-3 font-normal outline-none transition focus:border-[#256D3C] focus:ring-2 focus:ring-[#DCEBDF]"
                />
              </label>

              <label className="text-sm font-semibold text-[#344139]">
                E-mail
                <RequiredMark />
                <input
                  type="email"
                  value={form.respondentEmail}
                  onChange={(event) =>
                    field("respondentEmail", event.target.value)
                  }
                  autoComplete="email"
                  className="mt-2 min-h-11 w-full rounded-xl border border-[#C9D6CD] px-3 font-normal outline-none transition focus:border-[#256D3C] focus:ring-2 focus:ring-[#DCEBDF]"
                />
              </label>

              <label className="text-sm font-semibold text-[#344139]">
                Telefone
                <input
                  type="tel"
                  value={form.respondentPhone}
                  onChange={(event) =>
                    field("respondentPhone", event.target.value)
                  }
                  autoComplete="tel"
                  className="mt-2 min-h-11 w-full rounded-xl border border-[#C9D6CD] px-3 font-normal outline-none transition focus:border-[#256D3C] focus:ring-2 focus:ring-[#DCEBDF]"
                />
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-[#DDE5DF] bg-white p-6 shadow-sm sm:p-8">
            <SectionHeader
              step={2}
              title="Estrutura Da Administradora"
              description="Essas informações ajudam a dimensionar a operação e recomendar uma implantação compatível com a realidade da empresa."
            />

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["yearsInMarket", "Anos De Mercado", "Ex.: 12"],
                ["condominiumCount", "Condomínios Administrados", "Ex.: 35"],
                ["unitCount", "Unidades Aproximadas", "Ex.: 2800"],
                ["teamSize", "Pessoas Na Equipe", "Ex.: 18"],
              ].map(([key, label, placeholder]) => (
                <label
                  key={key}
                  className="text-sm font-semibold text-[#344139]"
                >
                  {label}
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder={placeholder}
                    value={String(form[key as keyof FormState])}
                    onChange={(event) =>
                      field(
                        key as keyof FormState,
                        event.target.value as never,
                      )
                    }
                    className="mt-2 min-h-11 w-full rounded-xl border border-[#C9D6CD] px-3 font-normal outline-none transition focus:border-[#256D3C] focus:ring-2 focus:ring-[#DCEBDF]"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-[#DDE5DF] bg-white p-6 shadow-sm sm:p-8">
            <SectionHeader
              step={3}
              title="Operação E Necessidades"
              description="Selecione as ferramentas atuais, os principais desafios e os módulos que parecem mais relevantes para a administradora."
            />

            <div className="mt-6 space-y-8">
              <div className="rounded-2xl border border-[#E3E9E4] bg-[#FBFCFB] p-5">
                <CheckGroup
                  title="Ferramentas Utilizadas Atualmente"
                  description="Marque todos os recursos que fazem parte da rotina da equipe."
                  items={DIAGNOSIS_SYSTEMS}
                  value={form.currentSystems}
                  onChange={(value) => field("currentSystems", value)}
                />
                {form.currentSystems.includes("Outros") ? (
                  <label className="mt-4 block text-sm font-semibold text-[#344139]">
                    Outros — descreva
                    <input
                      value={form.currentSystemsOther}
                      onChange={(event) =>
                        field("currentSystemsOther", event.target.value)
                      }
                      className="mt-2 min-h-11 w-full rounded-xl border border-[#C9D6CD] bg-white px-3 font-normal outline-none transition focus:border-[#256D3C] focus:ring-2 focus:ring-[#DCEBDF]"
                    />
                  </label>
                ) : null}
              </div>

              <div className="rounded-2xl border border-[#E3E9E4] bg-[#FBFCFB] p-5">
                <CheckGroup
                  title="Principais Dificuldades"
                  description="Selecione os problemas que mais afetam a operação atual."
                  items={DIAGNOSIS_PAINS}
                  value={form.painPoints}
                  onChange={(value) => field("painPoints", value)}
                />
                {form.painPoints.includes("Outros") ? (
                  <label className="mt-4 block text-sm font-semibold text-[#344139]">
                    Outros — descreva
                    <input
                      value={form.painPointsOther}
                      onChange={(event) =>
                        field("painPointsOther", event.target.value)
                      }
                      className="mt-2 min-h-11 w-full rounded-xl border border-[#C9D6CD] bg-white px-3 font-normal outline-none transition focus:border-[#256D3C] focus:ring-2 focus:ring-[#DCEBDF]"
                    />
                  </label>
                ) : null}

                <label className="mt-5 block text-sm font-semibold text-[#344139]">
                  Qual problema mais impacta a operação atualmente?
                  <RequiredMark />
                  <textarea
                    value={form.primaryPain}
                    onChange={(event) =>
                      field("primaryPain", event.target.value)
                    }
                    rows={4}
                    placeholder="Descreva brevemente o problema, a frequência e o impacto para a equipe ou para os clientes."
                    className="mt-2 w-full rounded-xl border border-[#C9D6CD] bg-white p-3 font-normal outline-none transition focus:border-[#256D3C] focus:ring-2 focus:ring-[#DCEBDF]"
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-[#E3E9E4] bg-[#FBFCFB] p-5">
                <CheckGroup
                  title="Módulos De Maior Interesse"
                  description="Marque os processos que você gostaria de conhecer com mais profundidade."
                  items={DIAGNOSIS_MODULES}
                  value={form.desiredModules}
                  onChange={(value) => field("desiredModules", value)}
                />
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-[#DDE5DF] bg-white p-6 shadow-sm sm:p-8">
            <SectionHeader
              step={4}
              title="Decisão E Possível Piloto"
              description="Essas respostas ajudam a definir o próximo passo comercial e a viabilidade de uma validação controlada."
            />

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[
                ["urgency", "Prazo Ou Urgência", "Ex.: até 90 dias"],
                ["decisionRole", "Seu Papel Na Decisão", "Ex.: decisor final"],
                ["budgetStatus", "Situação Do Orçamento", "Ex.: em avaliação"],
                ["pilotReadiness", "Disponibilidade Para Piloto", "Ex.: condomínio disponível"],
                ["competitorName", "Sistema Atual Ou Concorrente", "Nome da solução utilizada, se houver"],
              ].map(([key, label, placeholder]) => (
                <label
                  key={key}
                  className="text-sm font-semibold text-[#344139]"
                >
                  {label}
                  <input
                    value={String(form[key as keyof FormState])}
                    placeholder={placeholder}
                    onChange={(event) =>
                      field(
                        key as keyof FormState,
                        event.target.value as never,
                      )
                    }
                    className="mt-2 min-h-11 w-full rounded-xl border border-[#C9D6CD] px-3 font-normal outline-none transition focus:border-[#256D3C] focus:ring-2 focus:ring-[#DCEBDF]"
                  />
                </label>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-[#E3E9E4] bg-[#FBFCFB] p-5">
              <CheckGroup
                title="Dúvidas Ou Barreiras Percebidas"
                description="Marque os pontos que ainda precisam ser esclarecidos durante a avaliação."
                items={OBJECTION_OPTIONS}
                value={form.objections}
                onChange={(value) => field("objections", value)}
              />
            </div>

            <label className="mt-5 block text-sm font-semibold text-[#344139]">
              Observações Adicionais
              <textarea
                value={form.additionalNotes}
                onChange={(event) =>
                  field("additionalNotes", event.target.value)
                }
                rows={5}
                placeholder="Inclua informações que possam ajudar nossa equipe a compreender melhor a operação."
                className="mt-2 w-full rounded-xl border border-[#C9D6CD] p-3 font-normal outline-none transition focus:border-[#256D3C] focus:ring-2 focus:ring-[#DCEBDF]"
              />
            </label>
          </section>

          <section className="rounded-3xl border border-[#DDE5DF] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold text-[#17211B]">Consentimento</h2>
            <p className="mt-2 text-sm leading-6 text-[#667269]">
              Os dois itens abaixo são obrigatórios para o envio definitivo do diagnóstico.
            </p>

            <div className="mt-5 space-y-3 text-sm text-[#344139]">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E3E9E4] p-4">
                <input
                  type="checkbox"
                  checked={form.consentAccepted}
                  onChange={(event) =>
                    field("consentAccepted", event.target.checked)
                  }
                  className="mt-1 h-4 w-4 accent-[#256D3C]"
                />
                <span>
                  Autorizo o uso destas informações pelo EloGest para análise
                  comercial, preparação de demonstração, proposta e eventual
                  acompanhamento do atendimento.
                  <RequiredMark />
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E3E9E4] p-4">
                <input
                  type="checkbox"
                  checked={form.privacyAcknowledged}
                  onChange={(event) =>
                    field("privacyAcknowledged", event.target.checked)
                  }
                  className="mt-1 h-4 w-4 accent-[#256D3C]"
                />
                <span>
                  Declaro ciência da{" "}
                  <Link
                    href="/privacidade"
                    target="_blank"
                    className="font-semibold text-[#256D3C] underline"
                  >
                    Política de Privacidade
                  </Link>
                  .
                  <RequiredMark />
                </span>
              </label>
            </div>
          </section>

          {message ? (
            <div
              role="status"
              className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-800"
            >
              {message}
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"
            >
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => save(false)}
              className="min-h-11 rounded-xl border border-[#C9D6CD] bg-white px-5 font-semibold text-[#256D3C] transition hover:bg-[#F4F7F4] disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar E Continuar Depois"}
            </button>

            <button
              type="button"
              disabled={
                saving ||
                !form.consentAccepted ||
                !form.privacyAcknowledged
              }
              onClick={() => save(true)}
              className="min-h-11 rounded-xl bg-[#256D3C] px-5 font-semibold text-white transition hover:bg-[#1E5932] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Enviando..." : "Enviar Diagnóstico"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
