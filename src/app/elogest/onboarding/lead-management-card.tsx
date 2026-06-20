"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Owner = {
  id: string;
  name: string;
  email: string;
};

type LeadData = {
  priority?: string | null;
  stage?: string | null;
  channel?: string | null;
  source?: string | null;
  firstContactAt?: string | null;
  nextActionAt?: string | null;
  nextAction?: string | null;
  internalNotes?: string | null;
  commercialOwner?: Owner | null;
};

type Props = {
  requestId: string;
  lead: LeadData;
  owners: Owner[];
};

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function LeadManagementCard({
  requestId,
  lead,
  owners,
}: Props) {
  const router = useRouter();
  const [priority, setPriority] = useState(lead.priority || "NORMAL");
  const [stage, setStage] = useState(lead.stage || "NOVO");
  const [channel, setChannel] = useState(lead.channel || "SITE_PUBLICO");
  const [source, setSource] = useState(lead.source || "DIRECT");
  const [commercialOwnerId, setCommercialOwnerId] = useState(
    lead.commercialOwner?.id || "",
  );
  const [firstContactAt, setFirstContactAt] = useState(
    toDateTimeLocal(lead.firstContactAt),
  );
  const [nextActionAt, setNextActionAt] = useState(
    toDateTimeLocal(lead.nextActionAt),
  );
  const [nextAction, setNextAction] = useState(lead.nextAction || "");
  const [internalNotes, setInternalNotes] = useState(
    lead.internalNotes || "",
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    try {
      setSaving(true);
      setMessage(null);
      setError(null);

      const response = await fetch(`/api/elogest/onboarding/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateLead",
          priority,
          stage,
          channel,
          source,
          commercialOwnerId: commercialOwnerId || null,
          firstContactAt: firstContactAt || null,
          nextActionAt: nextActionAt || null,
          nextAction: nextAction.trim() || null,
          internalNotes: internalNotes.trim() || null,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          payload?.error || "Não foi possível atualizar o lead.",
        );
      }

      setMessage(payload?.message || "Informações comerciais atualizadas.");
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível atualizar o lead.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="mt-4 rounded-2xl border border-[#DDE5DF] bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-[#17211B]">
        Gestão Comercial Do Lead
      </summary>

      <div className="border-t border-[#DDE5DF] p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-xs font-bold text-[#64736A]">
            Prioridade
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#DDE5DF] bg-white px-3 text-sm font-semibold text-[#17211B]"
            >
              <option value="LOW">Baixa</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">Alta</option>
              <option value="URGENT">Urgente</option>
            </select>
          </label>

          <label className="text-xs font-bold text-[#64736A]">
            Estágio Comercial
            <select
              value={stage}
              onChange={(event) => setStage(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#DDE5DF] bg-white px-3 text-sm font-semibold text-[#17211B]"
            >
              <option value="NOVO">Novo</option>
              <option value="QUALIFICACAO">Qualificação</option>
              <option value="CONTATO">Contato</option>
              <option value="PROPOSTA">Proposta</option>
              <option value="NEGOCIACAO">Negociação</option>
              <option value="GANHO">Ganho</option>
              <option value="PERDIDO">Perdido</option>
            </select>
          </label>

          <label className="text-xs font-bold text-[#64736A]">
            Canal
            <input
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#DDE5DF] bg-white px-3 text-sm font-semibold text-[#17211B]"
              placeholder="SITE_PUBLICO"
            />
          </label>

          <label className="text-xs font-bold text-[#64736A]">
            Origem
            <input
              value={source}
              onChange={(event) => setSource(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#DDE5DF] bg-white px-3 text-sm font-semibold text-[#17211B]"
              placeholder="Google, indicação, direto..."
            />
          </label>

          <label className="text-xs font-bold text-[#64736A]">
            Responsável Comercial
            <select
              value={commercialOwnerId}
              onChange={(event) => setCommercialOwnerId(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#DDE5DF] bg-white px-3 text-sm font-semibold text-[#17211B]"
            >
              <option value="">Não atribuído</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name} — {owner.email}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-bold text-[#64736A]">
            Primeiro Contato
            <input
              type="datetime-local"
              value={firstContactAt}
              onChange={(event) => setFirstContactAt(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#DDE5DF] bg-white px-3 text-sm font-semibold text-[#17211B]"
            />
          </label>

          <label className="text-xs font-bold text-[#64736A] md:col-span-2">
            Próxima Ação
            <input
              value={nextAction}
              onChange={(event) => setNextAction(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#DDE5DF] bg-white px-3 text-sm font-semibold text-[#17211B]"
              placeholder="Ex.: Apresentar demonstração e revisar plano."
            />
          </label>

          <label className="text-xs font-bold text-[#64736A]">
            Data Da Próxima Ação
            <input
              type="datetime-local"
              value={nextActionAt}
              onChange={(event) => setNextActionAt(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#DDE5DF] bg-white px-3 text-sm font-semibold text-[#17211B]"
            />
          </label>

          <label className="text-xs font-bold text-[#64736A] md:col-span-2">
            Observações Internas
            <textarea
              value={internalNotes}
              onChange={(event) => setInternalNotes(event.target.value)}
              rows={4}
              className="mt-2 w-full rounded-xl border border-[#DDE5DF] bg-white px-3 py-3 text-sm font-semibold text-[#17211B]"
              placeholder="Informações internas do atendimento comercial."
            />
          </label>
        </div>

        {message && (
          <p className="mt-4 rounded-xl border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-2 text-xs font-semibold text-[#256D3C]">
            {message}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-[#256D3C] px-4 py-2 text-xs font-bold text-white hover:bg-[#174B2A] disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar Gestão Comercial"}
        </button>
      </div>
    </details>
  );
}
