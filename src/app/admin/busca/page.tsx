import Link from "next/link";
import { redirect } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";



/* =========================================================
   BUSCA GLOBAL ADMIN - ELOGEST

   Rota:
   /admin/busca?q=termo

   ETAPA 41.2.2 — CORREÇÃO DE ESTABILIDADE

   Ajuste desta revisão:
   - Removida temporariamente a busca direta em db.user.findMany().
   - O erro atual está ocorrendo na validação do Prisma ao consultar User.
   - Mantida a busca em:
     Condomínios, Unidades, Moradores e Chamados.
   - A busca em Usuários será recolocada após conferirmos o model User
     no schema.prisma.
   ========================================================= */

export const dynamic = "force-dynamic";



type PageProps = {
  searchParams: Promise<{
    q?: string | string[];
  }>;
};



type AuthUser = {
  id: string;
  role?: string | null;
  administratorId?: string | null;
};



function normalizeSearchParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0]?.trim() || "";
  }

  return value?.trim() || "";
}



function canUseAdminSearch(role?: string | null) {
  return role === "SUPER_ADMIN" || role === "ADMINISTRADORA";
}



function buildContainsFilter(term: string) {
  return {
    contains: term,
    mode: "insensitive" as const,
  };
}



function ResultGroup({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)]">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#17211B]">
            {title}
          </h2>

          <p className="mt-1 text-sm leading-6 text-[#64736A]">
            {description}
          </p>
        </div>

        <span className="inline-flex w-fit rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
          {count} resultado{count === 1 ? "" : "s"}
        </span>
      </div>

      {children}
    </section>
  );
}



function EmptyGroup() {
  return (
    <div className="rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F7F9F8] px-4 py-5 text-sm leading-6 text-[#7A877F]">
      Nenhum resultado encontrado neste módulo.
    </div>
  );
}



function ResultItem({
  title,
  subtitle,
  href,
  tag,
}: {
  title: string;
  subtitle?: string | null;
  href: string;
  tag?: string | null;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-4 transition hover:border-[#CFE6D4] hover:bg-white hover:shadow-[0_14px_38px_rgba(23,33,27,0.08)]"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#17211B] group-hover:text-[#256D3C]">
            {title}
          </p>

          {subtitle && (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#64736A]">
              {subtitle}
            </p>
          )}
        </div>

        {tag && (
          <span className="inline-flex w-fit shrink-0 rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-semibold text-[#64736A]">
            {tag}
          </span>
        )}
      </div>
    </Link>
  );
}



export default async function AdminBuscaPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = normalizeSearchParam(params.q);

  const authUser = (await getAuthUser()) as AuthUser | null;

  if (!authUser) {
    redirect("/login");
  }

  if (!canUseAdminSearch(authUser.role)) {
    redirect("/portal/dashboard");
  }

  const canSearch = q.length >= 2;



  /* =========================================================
     ESCOPO DA ADMINISTRADORA

     SUPER_ADMIN:
     - pesquisa geral.

     ADMINISTRADORA:
     - quando houver administratorId no usuário autenticado,
       restringe condomínios, unidades, moradores e chamados.
   ========================================================= */

  const condominiumScope =
    authUser.role === "ADMINISTRADORA" && authUser.administratorId
      ? {
          administratorId: authUser.administratorId,
        }
      : {};



  const [
    condominios,
    unidades,
    moradores,
    chamados,
  ] = canSearch
    ? await Promise.all([
        db.condominium.findMany({
          where: {
            ...condominiumScope,
            name: buildContainsFilter(q),
          },
          select: {
            id: true,
            name: true,
            status: true,
          },
          orderBy: {
            name: "asc",
          },
          take: 8,
        }),

        db.unit.findMany({
          where: {
            condominium: {
              ...condominiumScope,
            },
            OR: [
              { block: buildContainsFilter(q) },
              { unitNumber: buildContainsFilter(q) },
              {
                condominium: {
                  name: buildContainsFilter(q),
                },
              },
            ],
          },
          select: {
            id: true,
            block: true,
            unitNumber: true,
            status: true,
            condominium: {
              select: {
                name: true,
              },
            },
          },
          orderBy: {
            unitNumber: "asc",
          },
          take: 8,
        }),

        db.resident.findMany({
          where: {
            unit: {
              condominium: {
                ...condominiumScope,
              },
            },
            OR: [
              { name: buildContainsFilter(q) },
              { email: buildContainsFilter(q) },
              {
                unit: {
                  unitNumber: buildContainsFilter(q),
                },
              },
              {
                unit: {
                  condominium: {
                    name: buildContainsFilter(q),
                  },
                },
              },
            ],
          },
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            unit: {
              select: {
                block: true,
                unitNumber: true,
                condominium: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            name: "asc",
          },
          take: 8,
        }),

        db.ticket.findMany({
          where: {
            condominium: {
              ...condominiumScope,
            },
            OR: [
              { title: buildContainsFilter(q) },
              { description: buildContainsFilter(q) },
              { category: buildContainsFilter(q) },
              {
                condominium: {
                  name: buildContainsFilter(q),
                },
              },
              {
                unit: {
                  unitNumber: buildContainsFilter(q),
                },
              },
              {
                resident: {
                  name: buildContainsFilter(q),
                },
              },
            ],
          },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            category: true,
            createdAt: true,
            condominium: {
              select: {
                name: true,
              },
            },
            unit: {
              select: {
                block: true,
                unitNumber: true,
              },
            },
            resident: {
              select: {
                name: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
        }),
      ])
    : [[], [], [], []];



  const totalResults =
    condominios.length +
    unidades.length +
    moradores.length +
    chamados.length;



  return (
    <AdminShell current="dashboard">
      <div className="space-y-8">
        <section className="rounded-[32px] border border-[#DDE5DF] bg-white/90 p-6 shadow-[0_24px_80px_rgba(23,33,27,0.08)] backdrop-blur sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                Busca global
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#17211B]">
                Resultados da busca
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64736A]">
                Pesquise rapidamente por condomínios, unidades, moradores e
                chamados da área administrativa.
              </p>
            </div>

            {canSearch && (
              <div className="rounded-2xl border border-[#DDE5DF] bg-[#F7F9F8] px-4 py-3 text-sm text-[#64736A]">
                Termo pesquisado:{" "}
                <strong className="font-semibold text-[#17211B]">
                  {q}
                </strong>
                <br />
                <span className="text-xs">
                  {totalResults} resultado{totalResults === 1 ? "" : "s"} encontrado
                  {totalResults === 1 ? "" : "s"}
                </span>
              </div>
            )}
          </div>
        </section>

        {!canSearch ? (
          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-8 text-center shadow-[0_18px_55px_rgba(23,33,27,0.06)]">
            <h2 className="text-xl font-semibold text-[#17211B]">
              Digite ao menos 2 caracteres para buscar.
            </h2>

            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#64736A]">
              Use o campo de busca da topbar para localizar rapidamente
              registros da plataforma.
            </p>
          </section>
        ) : (
          <div className="grid gap-6">
            <ResultGroup
              title="Condomínios"
              description="Cadastros de condomínios encontrados na carteira."
              count={condominios.length}
            >
              {condominios.length === 0 ? (
                <EmptyGroup />
              ) : (
                <div className="grid gap-3">
                  {condominios.map((item) => (
                    <ResultItem
                      key={item.id}
                      href="/admin/condominios"
                      title={item.name}
                      subtitle="Condomínio cadastrado"
                      tag={item.status}
                    />
                  ))}
                </div>
              )}
            </ResultGroup>

            <ResultGroup
              title="Unidades"
              description="Unidades vinculadas aos condomínios cadastrados."
              count={unidades.length}
            >
              {unidades.length === 0 ? (
                <EmptyGroup />
              ) : (
                <div className="grid gap-3">
                  {unidades.map((item) => (
                    <ResultItem
                      key={item.id}
                      href="/admin/unidades"
                      title={[
                        item.block ? `Bloco ${item.block}` : null,
                        `Unidade ${item.unitNumber}`,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                      subtitle={item.condominium?.name}
                      tag={item.status}
                    />
                  ))}
                </div>
              )}
            </ResultGroup>

            <ResultGroup
              title="Moradores"
              description="Pessoas vinculadas às unidades e condomínios."
              count={moradores.length}
            >
              {moradores.length === 0 ? (
                <EmptyGroup />
              ) : (
                <div className="grid gap-3">
                  {moradores.map((item) => (
                    <ResultItem
                      key={item.id}
                      href="/admin/moradores"
                      title={item.name}
                      subtitle={[
                        item.email,
                        item.unit?.condominium?.name,
                        item.unit?.block ? `Bloco ${item.unit.block}` : null,
                        item.unit?.unitNumber ? `Unidade ${item.unit.unitNumber}` : null,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                      tag={item.status}
                    />
                  ))}
                </div>
              )}
            </ResultGroup>

            <ResultGroup
              title="Chamados"
              description="Solicitações e atendimentos registrados."
              count={chamados.length}
            >
              {chamados.length === 0 ? (
                <EmptyGroup />
              ) : (
                <div className="grid gap-3">
                  {chamados.map((item) => (
                    <ResultItem
                      key={item.id}
                      href={`/admin/chamados/${item.id}`}
                      title={item.title}
                      subtitle={[
                        item.condominium?.name,
                        item.unit?.block ? `Bloco ${item.unit.block}` : null,
                        item.unit?.unitNumber ? `Unidade ${item.unit.unitNumber}` : null,
                        item.resident?.name,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                      tag={item.status}
                    />
                  ))}
                </div>
              )}
            </ResultGroup>
          </div>
        )}
      </div>
    </AdminShell>
  );
}