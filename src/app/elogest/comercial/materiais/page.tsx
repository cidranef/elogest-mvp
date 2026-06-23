import Link from "next/link";
import type { CommercialMaterialCategory, CommercialMaterialStatus, Prisma } from "@prisma/client";
import EloGestShell from "@/components/EloGestShell";
import { db } from "@/lib/db";
import { COMMERCIAL_MATERIAL_CATEGORIES, COMMERCIAL_MATERIAL_STATUSES, categoryLabel, statusLabel } from "@/lib/commercial-materials";

export const dynamic = "force-dynamic";

type Params = Promise<{ search?: string; category?: string; status?: string }>;

export default async function CommercialMaterialsPage({ searchParams }: { searchParams: Params }) {
  const filters = await searchParams;
  const search = filters.search?.trim() || "";
  const category = filters.category as CommercialMaterialCategory | undefined;
  const status = filters.status as CommercialMaterialStatus | undefined;
  const where: Prisma.CommercialMaterialWhereInput = {
    ...(category ? { category } : {}),
    ...(status ? { status } : {}),
    ...(search ? { OR: [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ] } : {}),
  };
  const [items, totals] = await Promise.all([
    db.commercialMaterial.findMany({
      where,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      include: {
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
        updatedByUser: { select: { name: true } },
        _count: { select: { versions: true, downloads: true } },
      },
    }),
    Promise.all([
      db.commercialMaterial.count(),
      db.commercialMaterial.count({ where: { status: "APPROVED" } }),
      db.commercialMaterialVersion.count(),
      db.commercialMaterialDownloadLog.count(),
    ]),
  ]);
  const [total, approved, versions, downloads] = totals;
  return (
    <EloGestShell current="comercial">
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/elogest/comercial" className="text-sm font-semibold text-[#256D3C]">← Central Comercial</Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#17211B]">Materiais Comerciais</h1>
            <p className="mt-2 text-sm text-[#5B665F]">Biblioteca privada com conteúdo on-line, versões e downloads auditáveis.</p>
          </div>
          <Link href="/elogest/comercial/materiais/novo" className="rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white">Novo Material</Link>
        </div>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[["Materiais", total],["Aprovados", approved],["Versões", versions],["Downloads", downloads]].map(([label,value]) => (
            <div key={String(label)} className="rounded-3xl border border-[#DDE5DF] bg-white p-5 shadow-sm"><p className="text-sm text-[#667168]">{label}</p><p className="mt-2 text-3xl font-semibold text-[#17211B]">{value}</p></div>
          ))}
        </section>
        <form className="grid gap-3 rounded-3xl border border-[#DDE5DF] bg-white p-5 shadow-sm lg:grid-cols-[2fr_1fr_1fr_auto]">
          <input name="search" defaultValue={search} placeholder="Buscar título ou descrição" className="rounded-2xl border border-[#DDE5DF] px-4 py-3 text-sm" />
          <select name="category" defaultValue={category || ""} className="rounded-2xl border border-[#DDE5DF] px-4 py-3 text-sm"><option value="">Todas as categorias</option>{COMMERCIAL_MATERIAL_CATEGORIES.map((x)=><option key={x.value} value={x.value}>{x.label}</option>)}</select>
          <select name="status" defaultValue={status || ""} className="rounded-2xl border border-[#DDE5DF] px-4 py-3 text-sm"><option value="">Todos os status</option>{COMMERCIAL_MATERIAL_STATUSES.map((x)=><option key={x.value} value={x.value}>{x.label}</option>)}</select>
          <button className="rounded-2xl bg-[#17211B] px-5 py-3 text-sm font-semibold text-white">Filtrar</button>
        </form>
        <section className="overflow-hidden rounded-3xl border border-[#DDE5DF] bg-white shadow-sm">
          {items.length === 0 ? <div className="p-10 text-center text-sm text-[#667168]">Nenhum material encontrado.</div> : <div className="divide-y divide-[#EEF2EF]">{items.map((item) => {
            const latest = item.versions[0];
            return <Link key={item.id} href={`/elogest/comercial/materiais/${item.id}`} className="grid gap-4 p-5 transition hover:bg-[#F8FAF8] lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-center">
              <div><p className="font-semibold text-[#17211B]">{item.title}</p><p className="mt-1 text-sm text-[#667168]">{item.description || "Sem descrição."}</p></div>
              <div><p className="text-xs uppercase text-[#879188]">Categoria</p><p className="mt-1 text-sm font-semibold">{categoryLabel(item.category)}</p></div>
              <div><p className="text-xs uppercase text-[#879188]">Status</p><p className="mt-1 text-sm font-semibold">{statusLabel(item.status)}</p></div>
              <div><p className="text-xs uppercase text-[#879188]">Versão</p><p className="mt-1 text-sm font-semibold">{latest?.versionLabel || "Sem versão"}</p><p className="mt-1 text-xs text-[#7A847D]">{item._count.downloads} downloads</p></div>
              <span className="text-sm font-semibold text-[#256D3C]">Abrir →</span>
            </Link>;
          })}</div>}
        </section>
      </main>
    </EloGestShell>
  );
}
