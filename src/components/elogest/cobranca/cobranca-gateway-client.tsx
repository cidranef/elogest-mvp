"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Provider =
  | "MANUAL"
  | "MOCK"
  | "ASAAS"
  | "MERCADO_PAGO"
  | "PAGARME"
  | "STRIPE"
  | "OTHER";

type Environment = "DISABLED" | "SANDBOX" | "PRODUCTION";

type ConnectionStatus =
  | "NOT_CONFIGURED"
  | "CONFIGURED"
  | "CONNECTED"
  | "ERROR"
  | "DISABLED";

interface Configuration {
  id: string;
  provider: Provider;
  environment: Environment;
  status: ConnectionStatus;
  automaticBillingEnabled: boolean;
  pixEnabled: boolean;
  boletoEnabled: boolean;
  cardEnabled: boolean;
  gracePeriodDays: number;
  retryLimit: number;
  webhookUrl: string | null;
  lastConnectionTestAt: string | null;
  lastWebhookAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  updatedAt: string;
}

interface RuntimeConfig {
  provider: Provider;
  environment: Environment;
  automaticBillingEnabled: boolean;
  pixEnabled: boolean;
  boletoEnabled: boolean;
  cardEnabled: boolean;
  apiKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
}

interface ApiResponse {
  configuration: Configuration;
  runtime: RuntimeConfig;
  implementedProviders: Provider[];
  credentials: {
    apiKeyConfigured: boolean;
    webhookSecretConfigured: boolean;
  };
}

const PROVIDERS: { value: Provider; label: string; description: string }[] = [
  { value: "MANUAL", label: "Manual", description: "Cobranças e confirmações registradas pelo Super Admin." },
  { value: "MOCK", label: "Simulado", description: "Ambiente seguro para testes sem movimentação financeira." },
  { value: "ASAAS", label: "Asaas", description: "Adaptador específico ainda não implementado." },
  { value: "MERCADO_PAGO", label: "Mercado Pago", description: "Adaptador específico ainda não implementado." },
  { value: "PAGARME", label: "Pagar.me", description: "Adaptador específico ainda não implementado." },
  { value: "STRIPE", label: "Stripe", description: "Adaptador específico ainda não implementado." },
  { value: "OTHER", label: "Outro", description: "Reserva para integração futura." },
];

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  NOT_CONFIGURED: "Não Configurado",
  CONFIGURED: "Configurado",
  CONNECTED: "Conectado",
  ERROR: "Com Erro",
  DISABLED: "Desabilitado",
};

function formatDate(value: string | null) {
  if (!value) return "Não Registrado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function Toggle({
  checked,
  disabled,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex items-start justify-between gap-4 rounded-2xl border p-4 ${disabled ? "cursor-not-allowed border-[#E1E7E3] bg-[#F5F7F6] opacity-60" : "cursor-pointer border-[#DDE5DF] bg-white"}`}>
      <span>
        <span className="block text-sm font-bold text-[#17211B]">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-[#66736B]">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 accent-[#256D3C]"
      />
    </label>
  );
}

export function CobrancaGatewayClient() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [form, setForm] = useState<Configuration | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/elogest/configuracoes/cobranca", { cache: "no-store" });
      const payload = (await response.json()) as ApiResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar a configuração.");
      setData(payload);
      setForm(payload.configuration);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar a configuração.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const providerImplemented = useMemo(() => {
    if (!data || !form) return false;
    return data.implementedProviders.includes(form.provider);
  }, [data, form]);

  const externalProviderPending = Boolean(
    form && form.provider !== "MANUAL" && form.provider !== "MOCK",
  );

  function update<K extends keyof Configuration>(key: K, value: Configuration[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function handleProviderChange(provider: Provider) {
    setForm((current) => {
      if (!current) return current;

      if (provider === "MANUAL") {
        return {
          ...current,
          provider,
          environment: "DISABLED",
          automaticBillingEnabled: false,
          pixEnabled: false,
          boletoEnabled: false,
          cardEnabled: false,
        };
      }

      if (provider === "MOCK") {
        return { ...current, provider, environment: "SANDBOX" };
      }

      return {
        ...current,
        provider,
        environment: "DISABLED",
        automaticBillingEnabled: false,
      };
    });
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/elogest/configuracoes/cobranca", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: form.provider,
          environment: form.environment,
          automaticBillingEnabled: form.automaticBillingEnabled,
          pixEnabled: form.pixEnabled,
          boletoEnabled: form.boletoEnabled,
          cardEnabled: form.cardEnabled,
          gracePeriodDays: form.gracePeriodDays,
          retryLimit: form.retryLimit,
        }),
      });

      const payload = (await response.json()) as ApiResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar.");
      setData(payload);
      setForm(payload.configuration);
      setMessage("Configuração salva com sucesso.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao salvar a configuração.");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/elogest/configuracoes/cobranca/testar-conexao", { method: "POST" });
      const payload = (await response.json()) as ApiResponse & { result?: { message: string }; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível testar a conexão.");
      setData(payload);
      setForm(payload.configuration);
      setMessage(payload.result?.message || "Teste concluído.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao testar a conexão.");
      await load();
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <div className="rounded-3xl border border-[#DDE5DF] bg-white p-8 text-sm font-semibold text-[#66736B]">Carregando configuração de cobrança...</div>;
  }

  if (!form || !data) {
    return <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-800">{error || "Configuração indisponível."}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)] sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C]">Etapa 58 — Cobrança E Assinatura</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#17211B]">Configuração De Cobrança</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#66736B]">Controle o modo manual, o ambiente simulado e a preparação do gateway futuro sem expor chaves ou permitir inclusão de código pela interface.</p>
          </div>
          <span className="inline-flex w-fit rounded-full border border-[#CFE5D5] bg-[#EAF7EE] px-4 py-2 text-xs font-bold text-[#256D3C]">{STATUS_LABELS[form.status]}</span>
        </div>
      </div>

      {(message || error) && (
        <div className={`rounded-2xl border px-5 py-4 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-800" : "border-[#CFE5D5] bg-[#EAF7EE] text-[#256D3C]"}`}>
          {error || message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="space-y-6 rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-[#17211B]">Gateway E Ambiente</h2>
            <p className="mt-1 text-sm text-[#66736B]">Somente os providers Manual e Simulado possuem adaptadores nesta fase.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-bold text-[#334139]">Provider</span>
              <select value={form.provider} onChange={(event) => handleProviderChange(event.target.value as Provider)} className="h-12 w-full rounded-2xl border border-[#D6DFD9] bg-white px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]">
                {PROVIDERS.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
              </select>
              <p className="text-xs leading-5 text-[#748078]">{PROVIDERS.find((item) => item.value === form.provider)?.description}</p>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-[#334139]">Ambiente</span>
              <select value={form.environment} disabled={form.provider === "MANUAL" || externalProviderPending} onChange={(event) => update("environment", event.target.value as Environment)} className="h-12 w-full rounded-2xl border border-[#D6DFD9] bg-white px-4 text-sm font-semibold text-[#17211B] outline-none disabled:bg-[#F3F5F4]">
                <option value="DISABLED">Desabilitado</option>
                <option value="SANDBOX">Sandbox</option>
                <option value="PRODUCTION" disabled={form.provider === "MOCK"}>Produção</option>
              </select>
            </label>
          </div>

          {externalProviderPending && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">O provider foi reservado para integração futura, mas permanecerá desabilitado até que o adaptador específico e as credenciais sejam implementados.</div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <Toggle checked={form.automaticBillingEnabled} disabled={form.provider === "MANUAL" || externalProviderPending} label="Cobrança Automática" description="Autoriza geração automática apenas quando houver provider compatível." onChange={(value) => update("automaticBillingEnabled", value)} />
            <Toggle checked={form.pixEnabled} disabled={form.provider === "MANUAL" || externalProviderPending} label="Pix" description="Disponibiliza Pix quando o adaptador oferecer esse meio." onChange={(value) => update("pixEnabled", value)} />
            <Toggle checked={form.boletoEnabled} disabled={form.provider === "MANUAL" || externalProviderPending} label="Boleto" description="Disponibiliza boleto quando o adaptador oferecer esse meio." onChange={(value) => update("boletoEnabled", value)} />
            <Toggle checked={form.cardEnabled} disabled={form.provider === "MANUAL" || externalProviderPending} label="Cartão" description="Disponibiliza cartão sem armazenar dados sensíveis no EloGest." onChange={(value) => update("cardEnabled", value)} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-bold text-[#334139]">Dias De Tolerância</span>
              <input type="number" min={0} max={90} value={form.gracePeriodDays} onChange={(event) => update("gracePeriodDays", Number(event.target.value))} className="h-12 w-full rounded-2xl border border-[#D6DFD9] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold text-[#334139]">Limite De Tentativas</span>
              <input type="number" min={0} max={20} value={form.retryLimit} onChange={(event) => update("retryLimit", Number(event.target.value))} className="h-12 w-full rounded-2xl border border-[#D6DFD9] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]" />
            </label>
          </div>

          <div className="flex flex-wrap gap-3 border-t border-[#E4E9E6] pt-5">
            <button type="button" onClick={save} disabled={saving} className="rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#1F5B33] disabled:opacity-60">{saving ? "Salvando..." : "Salvar Configuração"}</button>
            <button type="button" onClick={testConnection} disabled={testing || !providerImplemented} className="rounded-2xl border border-[#BFCAC3] bg-white px-5 py-3 text-sm font-bold text-[#334139] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:cursor-not-allowed disabled:opacity-50">{testing ? "Testando..." : "Testar Conexão"}</button>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#17211B]">Estado Operacional</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div><dt className="font-semibold text-[#748078]">Provider Salvo</dt><dd className="mt-1 font-bold text-[#17211B]">{form.provider}</dd></div>
              <div><dt className="font-semibold text-[#748078]">Configuração Do Servidor</dt><dd className="mt-1 font-bold text-[#17211B]">{data.runtime.provider} · {data.runtime.environment}</dd></div>
              <div><dt className="font-semibold text-[#748078]">Último Teste</dt><dd className="mt-1 font-bold text-[#17211B]">{formatDate(form.lastConnectionTestAt)}</dd></div>
              <div><dt className="font-semibold text-[#748078]">Último Webhook</dt><dd className="mt-1 font-bold text-[#17211B]">{formatDate(form.lastWebhookAt)}</dd></div>
            </dl>
          </section>

          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#17211B]">Credenciais</h2>
            <p className="mt-2 text-xs leading-5 text-[#748078]">As chaves permanecem somente nas variáveis protegidas do ambiente.</p>
            <div className="mt-5 space-y-3 text-sm font-semibold">
              <div className="flex justify-between gap-3"><span className="text-[#66736B]">Chave Da API</span><span className={data.credentials.apiKeyConfigured ? "text-[#256D3C]" : "text-[#9A5D15]"}>{data.credentials.apiKeyConfigured ? "Configurada" : "Não Configurada"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-[#66736B]">Segredo Do Webhook</span><span className={data.credentials.webhookSecretConfigured ? "text-[#256D3C]" : "text-[#9A5D15]"}>{data.credentials.webhookSecretConfigured ? "Configurado" : "Não Configurado"}</span></div>
            </div>
          </section>

          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#17211B]">URL Do Webhook</h2>
            <p className="mt-2 break-all rounded-2xl bg-[#F4F7F5] p-3 text-xs font-semibold leading-5 text-[#4D5B52]">{form.webhookUrl || "Defina APP_URL para gerar a URL pública."}</p>
            <p className="mt-3 text-xs leading-5 text-[#748078]">A URL identifica a integração, mas gateways reais também deverão validar assinatura criptográfica.</p>
          </section>

          {form.lastErrorMessage && (
            <section className="rounded-[28px] border border-red-200 bg-red-50 p-6">
              <h2 className="text-sm font-bold text-red-900">Último Erro</h2>
              <p className="mt-2 text-sm leading-6 text-red-800">{form.lastErrorMessage}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
