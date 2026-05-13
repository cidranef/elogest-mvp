import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import PortalShell from "@/components/PortalShell";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";



/* =========================================================
   BUSCA GLOBAL PORTAL - ELOGEST

   Rota:
   /portal/busca?q=termo

   Objetivo:
   - Receber o termo vindo da topbar do portal.
   - Buscar informações úteis para o usuário do portal.
   - No MVP, a busca fica concentrada em chamados acessíveis.

   Escopo inicial da busca:
   - Chamados do usuário logado;
   - Chamados criados pelo usuário;
   - Chamados vinculados ao morador/unidade quando disponível.

   Observação:
   A busca do portal é propositalmente mais restrita que a busca admin.
   Ela não deve expor cadastros amplos da administradora.

   AJUSTE ETAPA 42.4:
   - Corrigida a tipagem do filtro OR do Prisma.
   - Removido o uso de null dentro do array de filtros.
   - portalVisibilityFilters agora é montado como Prisma.TicketWhereInput[].
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
  residentId?: string | null;
  unitId?: string | null;
  condominiumId?: string | null;
};



function normalizeSearchParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0]?.trim() || "";
  }

  return value?.trim() || "";
}



function buildContainsFilter(term: string) {
  return {
    contains: term,
    mode: "insensitive" as const,
  };
}



function isPortalRole(role?: string | null) {
  return role === "SINDICO" || role === "MORADOR" || role === "PROPRIETARIO";
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
  tag?: string;
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



export default async function PortalBuscaPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = normalizeSearchParam(params.q);

  const authUser = (await getAuthUser()) as AuthUser | null;

  if (!authUser) {
    redirect("/login");
  }

  if (!isPortalRole(authUser.role)) {
    redirect("/admin/dashboard");
  }



  /* =========================================================
     TERMO VAZIO OU MUITO CURTO
     ========================================================= */

  const canSearch = q.length >= 2;



  /* =========================================================
     ESCOPO DO PORTAL

     A proteção mais forte continua nas APIs e nos detalhes do chamado.
     Aqui fazemos um filtro inicial defensivo para não abrir busca ampla.

     Consideramos:
     - chamados criados pelo usuário;
     - chamados vinculados ao residentId, se houver;
     - chamados vinculados à unitId, se houver;
     - chamados vinculados ao condomínio para síndico, se houver.

     AJUSTE:
     - Não usamos mais null dentro do array.
     - Cada condição válida é adicionada com push.
     - Isso evita erro de TypeScript no OR do Prisma.
   ========================================================= */

  const portalVisibilityFilters: Prisma.TicketWhereInput[] = [
    {
      createdByUserId: authUser.id,
    },
  ];

  if (authUser.residentId) {
    portalVisibilityFilters.push({
      residentId: authUser.residentId,
    });
  }

  if (authUser.unitId) {
    portalVisibilityFilters.push({
      unitId: authUser.unitId,
    });
  }

  if (authUser.role === "SINDICO" && authUser.condominiumId) {
    portalVisibilityFilters.push({
      condominiumId: authUser.condominiumId,
    });
  }



  const chamados = canSearch
    ? await db.ticket.findMany({
        where: {
          AND: [
            {
              OR: portalVisibilityFilters,
            },
            {
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
              ],
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
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 15,
      })
    : [];



  return (
    <PortalShell current="dashboard">
      <div className="space-y-8">
        <section className="rounded-[32px] border border-[#DDE5DF] bg-white/90 p-6 shadow-[0_24px_80px_rgba(23,33,27,0.08)] backdrop-blur sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                Busca no portal
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#17211B]">
                Resultados da busca
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64736A]">
                Encontre rapidamente chamados e solicitações disponíveis para o
                seu perfil de acesso.
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
                  {chamados.length} resultado
                  {chamados.length === 1 ? "" : "s"} encontrado
                  {chamados.length === 1 ? "" : "s"}
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
              Use o campo de busca da topbar para localizar chamados e
              solicitações vinculados ao seu perfil.
            </p>
          </section>
        ) : (
          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)]">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#17211B]">
                  Chamados encontrados
                </h2>

                <p className="mt-1 text-sm leading-6 text-[#64736A]">
                  Resultados disponíveis conforme seu perfil de acesso.
                </p>
              </div>

              <span className="inline-flex w-fit rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                {chamados.length} resultado
                {chamados.length === 1 ? "" : "s"}
              </span>
            </div>

            {chamados.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F7F9F8] px-4 py-5 text-sm leading-6 text-[#7A877F]">
                Nenhum chamado encontrado para este termo.
              </div>
            ) : (
              <div className="grid gap-3">
                {chamados.map((item) => (
                  <ResultItem
                    key={item.id}
                    href={`/portal/chamados/${item.id}`}
                    title={item.title}
                    subtitle={[
                      item.condominium?.name,
                      item.unit?.block ? `Bloco ${item.unit.block}` : null,
                      item.unit?.unitNumber
                        ? `Unidade ${item.unit.unitNumber}`
                        : null,
                      item.category,
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                    tag={item.status}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </PortalShell>
  );
}