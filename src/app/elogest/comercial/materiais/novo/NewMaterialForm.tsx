"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { COMMERCIAL_MATERIAL_CATEGORIES } from "@/lib/commercial-materials";

export default function NewMaterialForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(formData: FormData) {
    setSaving(true); setError("");
    const response = await fetch("/api/elogest/comercial/materiais", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(formData)) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Não foi possível criar o material."); setSaving(false); return; }
    router.push(`/elogest/comercial/materiais/${data.item.id}`);
    router.refresh();
  }
  return <form action={submit} className="space-y-5 rounded-3xl border border-[#DDE5DF] bg-white p-6 shadow-sm">
    <label className="block"><span className="text-sm font-semibold">Título</span><input name="title" required className="mt-2 w-full rounded-2xl border border-[#DDE5DF] px-4 py-3" /></label>
    <label className="block"><span className="text-sm font-semibold">Descrição</span><textarea name="description" rows={4} className="mt-2 w-full rounded-2xl border border-[#DDE5DF] px-4 py-3" /></label>
    <div className="grid gap-4 sm:grid-cols-2"><label><span className="text-sm font-semibold">Categoria</span><select name="category" className="mt-2 w-full rounded-2xl border border-[#DDE5DF] px-4 py-3">{COMMERCIAL_MATERIAL_CATEGORIES.map((x)=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label><label><span className="text-sm font-semibold">Status</span><select name="status" className="mt-2 w-full rounded-2xl border border-[#DDE5DF] px-4 py-3"><option value="DRAFT">Rascunho</option><option value="APPROVED">Aprovado</option></select></label></div>
    {error && <p className="text-sm text-red-700">{error}</p>}<button disabled={saving} className="rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Criando..." : "Criar Material"}</button>
  </form>;
}
