"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type PublicOnboardingPlan = {
  id: string;
  name: string;
  slug: string;
};

type OnboardingFormProps = {
  plans: PublicOnboardingPlan[];
  initialPlanSlug?: string | null;
};

type FormState = {
  administratorName: string;
  responsibleName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  condominiumEstimate: string;
  unitEstimate: string;
  interestedPlanSlug: string;
  message: string;
};

type ApiResponse = {
  message?: string;
  error?: string;
  onboardingRequest?: {
    id: string;
    administratorName: string;
    responsibleName: string;
    email: string;
    status: string;
    createdAt: string;
  };
};

const INITIAL_FORM_STATE: FormState = {
  administratorName: "",
  responsibleName: "",
  email: "",
  phone: "",
  city: "",
  state: "",
  condominiumEstimate: "",
  unitEstimate: "",
  interestedPlanSlug: "",
  message: "",
};

function onlyNumbers(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeState(value: string) {
  return value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2);
}

function normalizePositiveInteger(value: string) {
  const numbers = onlyNumbers(value);

  return numbers;
}

function buildPayload(form: FormState) {
  const condominiumEstimate = form.condominiumEstimate
    ? Number(form.condominiumEstimate)
    : null;

  const unitEstimate = form.unitEstimate ? Number(form.unitEstimate) : null;

  return {
    administratorName: form.administratorName.trim(),
    responsibleName: form.responsibleName.trim(),
    email: form.email.trim().toLowerCase(),
    phone: onlyNumbers(form.phone) || undefined,
    city: form.city.trim() || undefined,
    state: normalizeState(form.state) || undefined,
    condominiumEstimate,
    unitEstimate,
    interestedPlanSlug: form.interestedPlanSlug || undefined,
    message: form.message.trim() || undefined,
  };
}

function FormField({
  label,
  children,
  required = false,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-[#17211B]">
        {label}
        {required && <span className="text-[#256D3C]"> *</span>}
      </span>

      <div className="mt-2">{children}</div>

      {hint && <span className="mt-2 block text-xs font-semibold text-[#7A877F]">{hint}</span>}
    </label>
  );
}

function baseInputClassName() {
  return "w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 py-3 text-sm font-semibold text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:ring-4 focus:ring-[#256D3C]/10";
}

export default function OnboardingForm({
  plans,
  initialPlanSlug,
}: OnboardingFormProps) {
  const router = useRouter();
  const initialPlanExists = plans.some((plan) => plan.slug === initialPlanSlug);

  const [form, setForm] = useState<FormState>({
    ...INITIAL_FORM_STATE,
    interestedPlanSlug: initialPlanExists && initialPlanSlug ? initialPlanSlug : "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPlanName = useMemo(() => {
    if (!form.interestedPlanSlug) {
      return null;
    }

    return plans.find((plan) => plan.slug === form.interestedPlanSlug)?.name ?? null;
  }, [form.interestedPlanSlug, plans]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/public/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload(form)),
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok) {
        setError(data.error || "Não foi possível enviar a solicitação neste momento.");
        return;
      }

      const requestId = data.onboardingRequest?.id;
      const redirectUrl = requestId
        ? `/onboarding/enviado?solicitacao=${encodeURIComponent(requestId)}`
        : "/onboarding/enviado";

      router.push(redirectUrl);
    } catch (submitError) {
      console.error("Erro ao enviar solicitação de onboarding:", submitError);
      setError("Não foi possível enviar a solicitação neste momento.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[2rem] border border-[#DDE5DF] bg-white p-5 shadow-[0_20px_60px_rgba(23,33,27,0.08)] sm:p-6 lg:p-8">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <FormField label="Nome Da Administradora" required>
            <input
              value={form.administratorName}
              onChange={(event) => updateField("administratorName", event.target.value)}
              className={baseInputClassName()}
              placeholder="Ex.: Administradora Modelo"
              required
              maxLength={140}
            />
          </FormField>
        </div>

        <FormField label="Nome Do Responsável" required>
          <input
            value={form.responsibleName}
            onChange={(event) => updateField("responsibleName", event.target.value)}
            className={baseInputClassName()}
            placeholder="Nome completo"
            required
            maxLength={120}
          />
        </FormField>

        <FormField label="E-mail De Contato" required>
          <input
            type="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
            className={baseInputClassName()}
            placeholder="responsavel@administradora.com.br"
            required
            maxLength={180}
          />
        </FormField>

        <FormField label="Telefone Ou WhatsApp">
          <input
            value={form.phone}
            onChange={(event) => updateField("phone", event.target.value)}
            className={baseInputClassName()}
            placeholder="(11) 99999-9999"
            inputMode="tel"
            maxLength={24}
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
          <FormField label="Cidade">
            <input
              value={form.city}
              onChange={(event) => updateField("city", event.target.value)}
              className={baseInputClassName()}
              placeholder="São Paulo"
              maxLength={80}
            />
          </FormField>

          <FormField label="UF">
            <input
              value={form.state}
              onChange={(event) => updateField("state", normalizeState(event.target.value))}
              className={baseInputClassName()}
              placeholder="SP"
              maxLength={2}
            />
          </FormField>
        </div>

        <FormField label="Quantidade Aproximada De Condomínios">
          <input
            value={form.condominiumEstimate}
            onChange={(event) => updateField("condominiumEstimate", normalizePositiveInteger(event.target.value))}
            className={baseInputClassName()}
            placeholder="Ex.: 12"
            inputMode="numeric"
            maxLength={8}
          />
        </FormField>

        <FormField label="Quantidade Aproximada De Unidades">
          <input
            value={form.unitEstimate}
            onChange={(event) => updateField("unitEstimate", normalizePositiveInteger(event.target.value))}
            className={baseInputClassName()}
            placeholder="Ex.: 850"
            inputMode="numeric"
            maxLength={9}
          />
        </FormField>

        <FormField label="Plano De Interesse" hint="Você poderá ajustar o plano depois com a equipe EloGest.">
          <select
            value={form.interestedPlanSlug}
            onChange={(event) => updateField("interestedPlanSlug", event.target.value)}
            className={baseInputClassName()}
          >
            <option value="">Ainda não sei</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.slug}>
                {plan.name}
              </option>
            ))}
          </select>
        </FormField>

        <div className="md:col-span-2">
          <FormField label="Mensagem Opcional">
            <textarea
              value={form.message}
              onChange={(event) => updateField("message", event.target.value)}
              className={`${baseInputClassName()} min-h-32 resize-y`}
              placeholder="Conte rapidamente sobre sua operação, dúvidas ou prioridade inicial."
              maxLength={900}
            />
          </FormField>
        </div>
      </div>

      {selectedPlanName && (
        <div className="mt-5 rounded-3xl border border-[#8ED08E]/45 bg-[#EAF7EE] px-4 py-3 text-sm font-semibold text-[#256D3C]">
          Plano selecionado: {selectedPlanName}
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold leading-5 text-[#7A877F]">
          Ao enviar, sua solicitação será analisada pelo time EloGest. Nenhuma administradora será ativada automaticamente.
        </p>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-[#256D3C] px-6 py-3.5 text-sm font-bold text-white shadow-[0_18px_45px_rgba(37,109,60,0.25)] transition hover:bg-[#174B2A] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Enviando..." : "Enviar Solicitação"}
        </button>
      </div>
    </form>
  );
}
