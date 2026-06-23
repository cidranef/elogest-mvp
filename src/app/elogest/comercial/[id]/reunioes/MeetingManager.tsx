"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const TYPES = [
  ["DISCOVERY", "Diagnóstico"],
  ["DEMO_10", "Demonstração De 10 Minutos"],
  ["DEMO_30", "Demonstração De 30 Minutos"],
  ["DEMO_60", "Demonstração De 60 Minutos"],
  ["PILOT_ALIGNMENT", "Alinhamento De Piloto"],
  ["PROPOSAL", "Apresentação De Proposta"],
  ["NEGOTIATION", "Negociação"],
  ["INVESTMENT", "Conversa Estratégica Ou Investimento"],
  ["FOLLOW_UP", "Acompanhamento"],
  ["OTHER", "Outro"],
] as const;

const STATUSES = [
  ["SCHEDULED", "Agendada"],
  ["COMPLETED", "Concluída"],
  ["CANCELLED", "Cancelada"],
  ["NO_SHOW", "Não Compareceu"],
] as const;

const MODULES = [
  "Condomínios, Unidades E Moradores",
  "Chamados",
  "Fornecedores",
  "Comunicados",
  "Reuniões De Conselho",
  "Enquetes",
  "Assembleias E Votação",
  "Ata Com IA",
  "Financeiro",
  "Relatórios Gerenciais",
  "IA Operacional",
  "Portal",
];

type Participant = { name: string; role?: string | null; email?: string | null };
type Meeting = {
  id: string;
  title: string;
  type: string;
  status: string;
  scheduledAt: string | null;
  durationMinutes: number | null;
  participants: Participant[] | null;
  scriptUsed: string | null;
  modulesPresented: string[];
  painsIdentified: string[];
  objections: string[];
  interestLevel: number | null;
  summary: string | null;
  nextStep: string | null;
  followUpAt: string | null;
  createdAt: string;
};

type Props = { leadId: string; initialMeetings: Meeting[] };

const emptyForm = {
  title: "",
  type: "DISCOVERY",
  status: "SCHEDULED",
  scheduledAt: "",
  durationMinutes: "",
  participantNames: "",
  scriptUsed: "",
  modulesPresented: [] as string[],
  painsIdentified: "",
  objections: "",
  interestLevel: "",
  summary: "",
  nextStep: "",
  followUpAt: "",
};

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100";
const labelClass = "space-y-1.5 text-sm font-semibold text-slate-700";

function labelOf(options: readonly (readonly [string, string])[], value: string) {
  return options.find(([key]) => key === value)?.[1] ?? value;
}

function formatDate(value: string | null) {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function MeetingManager({ leadId, initialMeetings }: Props) {
  const router = useRouter();
  const [meetings, setMeetings] = useState(initialMeetings);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const completedCount = useMemo(
    () => meetings.filter((meeting) => meeting.status === "COMPLETED").length,
    [meetings],
  );
  const scheduledCount = useMemo(
    () => meetings.filter((meeting) => meeting.status === "SCHEDULED").length,
    [meetings],
  );

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleModule(module: string) {
    setForm((current) => ({
      ...current,
      modulesPresented: current.modulesPresented.includes(module)
        ? current.modulesPresented.filter((item) => item !== module)
        : [...current.modulesPresented, module],
    }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
  }

  function edit(meeting: Meeting) {
    const participantNames = Array.isArray(meeting.participants)
      ? meeting.participants.map((participant) => participant.name).join("\n")
      : "";
    setEditingId(meeting.id);
    setForm({
      title: meeting.title,
      type: meeting.type,
      status: meeting.status,
      scheduledAt: meeting.scheduledAt?.slice(0, 16) ?? "",
      durationMinutes: meeting.durationMinutes?.toString() ?? "",
      participantNames,
      scriptUsed: meeting.scriptUsed ?? "",
      modulesPresented: meeting.modulesPresented ?? [],
      painsIdentified: (meeting.painsIdentified ?? []).join("\n"),
      objections: (meeting.objections ?? []).join("\n"),
      interestLevel: meeting.interestLevel?.toString() ?? "",
      summary: meeting.summary ?? "",
      nextStep: meeting.nextStep ?? "",
      followUpAt: meeting.followUpAt?.slice(0, 16) ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    setError("");
    setMessage("");
    if (!form.title.trim()) {
      setError("Informe o título da reunião.");
      return;
    }
    setBusy(true);
    try {
      const participants = form.participantNames
        .split("\n")
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => ({ name }));
      const body = {
        title: form.title,
        type: form.type,
        status: form.status,
        scheduledAt: form.scheduledAt || null,
        durationMinutes: form.durationMinutes || null,
        participants,
        scriptUsed: form.scriptUsed,
        modulesPresented: form.modulesPresented,
        painsIdentified: form.painsIdentified.split("\n").map((v) => v.trim()).filter(Boolean),
        objections: form.objections.split("\n").map((v) => v.trim()).filter(Boolean),
        interestLevel: form.interestLevel || null,
        summary: form.summary,
        nextStep: form.nextStep,
        followUpAt: form.followUpAt || null,
      };
      const url = editingId
        ? `/api/elogest/comercial/${leadId}/reunioes/${editingId}`
        : `/api/elogest/comercial/${leadId}/reunioes`;
      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a reunião.");
      if (editingId) {
        setMeetings((current) => current.map((item) => item.id === editingId ? data.meeting : item));
      } else {
        setMeetings((current) => [data.meeting, ...current]);
      }
      resetForm();
      setMessage(editingId ? "Reunião atualizada." : "Reunião registrada.");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(meeting: Meeting) {
    if (!window.confirm(`Remover a reunião “${meeting.title}”?`)) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/elogest/comercial/${leadId}/reunioes/${meeting.id}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível remover.");
      setMeetings((current) => current.filter((item) => item.id !== meeting.id));
      setMessage("Reunião removida.");
      if (editingId === meeting.id) resetForm();
      router.refresh();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Não foi possível remover.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8 text-slate-900">
      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["Total", meetings.length],
          ["Agendadas", scheduledCount],
          ["Concluídas", completedCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{editingId ? "Editar Reunião" : "Registrar Reunião"}</h2>
            <p className="mt-1 text-sm text-slate-600">Registre o contexto, o que foi apresentado e o próximo compromisso.</p>
          </div>
          {editingId ? (
            <button type="button" onClick={resetForm} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar Edição</button>
          ) : null}
        </div>

        {message ? <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{message}</p> : null}
        {error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{error}</p> : null}

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className={labelClass}>Título *
            <input value={form.title} onChange={(e) => setField("title", e.target.value)} className={inputClass} placeholder="Ex.: Demonstração comercial do EloGest" />
          </label>
          <label className={labelClass}>Tipo
            <select value={form.type} onChange={(e) => setField("type", e.target.value)} className={inputClass}>
              {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className={labelClass}>Situação
            <select value={form.status} onChange={(e) => setField("status", e.target.value)} className={inputClass}>
              {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className={labelClass}>Data E Horário
            <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setField("scheduledAt", e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>Duração Em Minutos
            <input type="number" min="0" value={form.durationMinutes} onChange={(e) => setField("durationMinutes", e.target.value)} className={inputClass} placeholder="Ex.: 30" />
          </label>
          <label className={labelClass}>Roteiro Utilizado
            <input value={form.scriptUsed} onChange={(e) => setField("scriptUsed", e.target.value)} className={inputClass} placeholder="Ex.: Roteiro de 30 minutos" />
          </label>
          <label className={`${labelClass} md:col-span-2`}>Participantes
            <textarea value={form.participantNames} onChange={(e) => setField("participantNames", e.target.value)} className={`${inputClass} min-h-24 resize-y`} placeholder="Um nome por linha" />
          </label>
        </div>

        <fieldset className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <legend className="px-2 text-sm font-bold text-slate-800">Módulos Apresentados</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((module) => (
              <label key={module} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/40">
                <input type="checkbox" checked={form.modulesPresented.includes(module)} onChange={() => toggleModule(module)} className="h-4 w-4 accent-emerald-700" />
                {module}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <label className={labelClass}>Dores Identificadas
            <textarea value={form.painsIdentified} onChange={(e) => setField("painsIdentified", e.target.value)} className={`${inputClass} min-h-28 resize-y`} placeholder="Uma dor por linha" />
          </label>
          <label className={labelClass}>Objeções
            <textarea value={form.objections} onChange={(e) => setField("objections", e.target.value)} className={`${inputClass} min-h-28 resize-y`} placeholder="Uma objeção por linha" />
          </label>
          <label className={labelClass}>Nível De Interesse
            <select value={form.interestLevel} onChange={(e) => setField("interestLevel", e.target.value)} className={inputClass}>
              <option value="">Não avaliado</option>
              <option value="0">0 — Nenhum interesse</option>
              <option value="1">1 — Muito baixo</option>
              <option value="2">2 — Baixo</option>
              <option value="3">3 — Médio</option>
              <option value="4">4 — Alto</option>
              <option value="5">5 — Muito alto</option>
            </select>
          </label>
          <label className={labelClass}>Próximo Acompanhamento
            <input type="datetime-local" value={form.followUpAt} onChange={(e) => setField("followUpAt", e.target.value)} className={inputClass} />
          </label>
          <label className={`${labelClass} md:col-span-2`}>Resumo Da Conversa
            <textarea value={form.summary} onChange={(e) => setField("summary", e.target.value)} className={`${inputClass} min-h-32 resize-y`} placeholder="Registre os pontos principais da conversa." />
          </label>
          <label className={`${labelClass} md:col-span-2`}>Próximo Passo
            <textarea value={form.nextStep} onChange={(e) => setField("nextStep", e.target.value)} className={`${inputClass} min-h-24 resize-y`} placeholder="Ex.: Enviar proposta até sexta-feira." />
          </label>
        </div>

        <div className="mt-7 flex flex-wrap gap-3">
          <button type="button" disabled={busy} onClick={save} className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? "Salvando..." : editingId ? "Salvar Alterações" : "Registrar Reunião"}
          </button>
          {editingId ? (
            <button type="button" onClick={resetForm} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Histórico De Reuniões</h2>
        {meetings.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">Nenhuma reunião registrada.</div>
        ) : meetings.map((meeting) => (
          <article key={meeting.id} className="rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{labelOf(TYPES, meeting.type)} · {labelOf(STATUSES, meeting.status)}</p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">{meeting.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{formatDate(meeting.scheduledAt)}{meeting.durationMinutes ? ` · ${meeting.durationMinutes} minutos` : ""}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => edit(meeting)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Editar</button>
                <button type="button" onClick={() => remove(meeting)} className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Remover</button>
              </div>
            </div>
            {meeting.summary ? <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{meeting.summary}</p> : null}
            <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
              <p><strong className="text-slate-900">Próximo passo:</strong> {meeting.nextStep || "Não informado"}</p>
              <p><strong className="text-slate-900">Acompanhamento:</strong> {formatDate(meeting.followUpAt)}</p>
              <p><strong className="text-slate-900">Nível de interesse:</strong> {meeting.interestLevel ?? "Não avaliado"}/5</p>
              <p><strong className="text-slate-900">Roteiro:</strong> {meeting.scriptUsed || "Não informado"}</p>
            </div>
            {meeting.modulesPresented?.length ? <p className="mt-4 text-sm text-slate-700"><strong className="text-slate-900">Módulos:</strong> {meeting.modulesPresented.join(", ")}</p> : null}
          </article>
        ))}
      </section>
    </div>
  );
}
