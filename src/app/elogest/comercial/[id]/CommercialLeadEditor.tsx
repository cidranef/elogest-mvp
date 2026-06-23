"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CommercialLeadPriority, CommercialLeadStage } from "@prisma/client";
import { COMMERCIAL_PRIORITY_OPTIONS, COMMERCIAL_STAGE_OPTIONS } from "@/lib/commercial-lead";

type Owner = { id: string; name: string; email: string };

type Props = {
  id: string;
  initial: {
    stage: CommercialLeadStage;
    priority: CommercialLeadPriority;
    ownerUserId: string | null;
    nextFollowUpAt: string;
    notes: string;
    lostReason: string;
    strategicPotential: boolean;
    investorInterest: boolean;
  };
  owners: Owner[];
};

export default function CommercialLeadEditor({ id, initial, owners }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/elogest/comercial/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar.");
      setMessage("Informações comerciais atualizadas.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl border border-[#DDE5DF] bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-[#17211B]">Gestão Comercial</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold text-[#465149]">Estágio
          <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value as CommercialLeadStage })} className="w-full rounded-2xl border border-[#DDE5DF] px-4 py-3 font-normal">
            {COMMERCIAL_STAGE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="space-y-2 text-sm font-semibold text-[#465149]">Prioridade
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as CommercialLeadPriority })} className="w-full rounded-2xl border border-[#DDE5DF] px-4 py-3 font-normal">
            {COMMERCIAL_PRIORITY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <div className="rounded-2xl border border-[#DDE5DF] bg-[#F8FAF8] px-4 py-3">
          <p className="text-sm font-semibold text-[#465149]">Pontuação Comercial</p>
          <p className="mt-1 text-sm text-[#667168]">Calculada exclusivamente pela Qualificação Comercial.</p>
        </div>
        <label className="space-y-2 text-sm font-semibold text-[#465149]">Responsável Comercial
          <select value={form.ownerUserId || ""} onChange={(e) => setForm({ ...form, ownerUserId: e.target.value || null })} className="w-full rounded-2xl border border-[#DDE5DF] px-4 py-3 font-normal">
            <option value="">Não atribuído</option>
            {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
          </select>
        </label>
        <label className="space-y-2 text-sm font-semibold text-[#465149]">Próximo Acompanhamento
          <input type="datetime-local" value={form.nextFollowUpAt} onChange={(e) => setForm({ ...form, nextFollowUpAt: e.target.value })} className="w-full rounded-2xl border border-[#DDE5DF] px-4 py-3 font-normal" />
        </label>
        {form.stage === "LOST" && (
          <label className="space-y-2 text-sm font-semibold text-[#465149]">Motivo Da Perda
            <input value={form.lostReason} onChange={(e) => setForm({ ...form, lostReason: e.target.value })} className="w-full rounded-2xl border border-[#DDE5DF] px-4 py-3 font-normal" />
          </label>
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-3 rounded-2xl border border-[#E0E7E2] bg-[#F8FAF8] p-4 text-sm font-semibold text-[#465149]">
          <input type="checkbox" checked={form.strategicPotential} onChange={(e) => setForm({ ...form, strategicPotential: e.target.checked })} /> Potencial Estratégico
        </label>
        <label className="flex items-center gap-3 rounded-2xl border border-[#E0E7E2] bg-[#F8FAF8] p-4 text-sm font-semibold text-[#465149]">
          <input type="checkbox" checked={form.investorInterest} onChange={(e) => setForm({ ...form, investorInterest: e.target.checked })} /> Interesse Em Investimento
        </label>
      </div>
      <label className="mt-4 block space-y-2 text-sm font-semibold text-[#465149]">Observações Internas
        <textarea rows={6} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-2xl border border-[#DDE5DF] px-4 py-3 font-normal" />
      </label>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" disabled={saving} onClick={save} className="rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Salvando..." : "Salvar Informações"}</button>
        {message && <p className="text-sm text-[#536058]">{message}</p>}
      </div>
    </section>
  );
}
