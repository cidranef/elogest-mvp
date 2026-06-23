import Link from "next/link";
import { notFound } from "next/navigation";
import EloGestShell from "@/components/EloGestShell";
import { db } from "@/lib/db";
import { categoryLabel, statusLabel } from "@/lib/commercial-materials";
import MarkdownDocument from "./MarkdownDocument";
import MaterialEditor from "./MaterialEditor";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function MaterialDetailPage({ params }: Props) {
  const { id } = await params;
  const item = await db.commercialMaterial.findUnique({
    where: { id },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          createdByUser: { select: { name: true } },
          _count: { select: { downloads: true } },
        },
      },
      createdByUser: { select: { name: true } },
      updatedByUser: { select: { name: true } },
      approvedByUser: { select: { name: true } },
    },
  });

  if (!item) notFound();

  const latest = item.versions[0];

  return (
    <EloGestShell current="comercial">
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div>
          <Link
            href="/elogest/comercial/materiais"
            className="text-sm font-semibold text-[#256D3C]"
          >
            ← Materiais Comerciais
          </Link>
          <h1 className="mt-3 text-3xl font-semibold">{item.title}</h1>
          <p className="mt-2 text-sm text-[#5B665F]">
            {categoryLabel(item.category)} · {statusLabel(item.status)} · {item.versions.length}{" "}
            versões
          </p>
        </div>

        {latest?.content ? (
          <section className="rounded-3xl border border-[#DDE5DF] bg-white shadow-sm">
            <div className="border-b border-[#E5EBE7] px-6 py-5 sm:px-8">
              <h2 className="text-lg font-semibold text-[#17211B]">
                Visualização On-line — {latest.versionLabel}
              </h2>
              <p className="mt-1 text-sm text-[#667168]">
                Conteúdo formatado para leitura e apresentação.
              </p>
            </div>
            <div className="px-6 py-7 sm:px-10 sm:py-10">
              <MarkdownDocument content={latest.content} />
            </div>
          </section>
        ) : null}

        <MaterialEditor
          item={{
            id: item.id,
            title: item.title,
            description: item.description,
            category: item.category,
            status: item.status,
          }}
        />

        <section className="rounded-3xl border border-[#DDE5DF] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Histórico De Versões</h2>
          <div className="mt-4 divide-y divide-[#EEF2EF]">
            {item.versions.length === 0 ? (
              <p className="py-4 text-sm text-[#667168]">Nenhuma versão criada.</p>
            ) : (
              item.versions.map((version) => (
                <div
                  key={version.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold">{version.versionLabel}</p>
                    <p className="text-sm text-[#667168]">
                      {version.createdByUser?.name || "Usuário removido"} ·{" "}
                      {new Intl.DateTimeFormat("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(version.createdAt)}{" "}
                      · {version._count.downloads} downloads
                    </p>
                    <p className="mt-1 text-sm text-[#667168]">
                      {version.changeNotes || "Sem notas."}
                    </p>
                  </div>
                  {version.fileKey ? (
                    <a
                      href={`/api/elogest/comercial/materiais/${item.id}/download?versionId=${version.id}`}
                      className="rounded-2xl border border-[#256D3C] px-4 py-2 text-center text-sm font-semibold text-[#256D3C]"
                    >
                      Baixar Arquivo
                    </a>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </EloGestShell>
  );
}
