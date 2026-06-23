import EloGestShell from "@/components/EloGestShell";
import { db } from "@/lib/db";
import DemoResetPanel from "./DemoResetPanel";

export const dynamic = "force-dynamic";

const DEMO_CNPJ = "98000000000100";

function formatDate(value: Date | null | undefined) {
  if (!value) return "Ainda não realizado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(value);
}

export default async function EloGestDemoPage() {
  const [demo, lastReset] = await Promise.all([
    db.administrator.findUnique({
      where: { cnpj: DEMO_CNPJ },
      select: {
        id: true, name: true, status: true, isDemo: true, demoProtectionEnabled: true, createdAt: true,
        plan: { select: { name: true } },
        _count: { select: { condominiums: true, users: true, announcements: true, polls: true, assemblies: true, financialEntries: true } },
      },
    }),
    db.demoResetLog.findFirst({
      where: { demoCnpj: DEMO_CNPJ },
      orderBy: { startedAt: "desc" },
      select: { status: true, requestedByName: true, requestedByEmail: true, startedAt: true, completedAt: true, errorMessage: true },
    }),
  ]);

  const cards = demo ? [
    ["Condomínios", demo._count.condominiums],
    ["Usuários", demo._count.users],
    ["Comunicados", demo._count.announcements],
    ["Enquetes", demo._count.polls],
    ["Assembleias", demo._count.assemblies],
    ["Lançamentos Financeiros", demo._count.financialEntries],
  ] as const : [];

  return (
    <EloGestShell current="demo">
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C]">Etapa 57</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B]">Ambiente Demo</h1>
          <p className="mt-2 text-sm leading-6 text-[#5B665F]">Controle da carteira usada nas apresentações comerciais do EloGest.</p>
        </div>

        {!demo ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-900">A Administradora Demo oficial não foi encontrada.</div>
        ) : (
          <>
            <section className="rounded-3xl border border-[#DDE5DF] bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6D786F]">Administradora Oficial</p>
                  <h2 className="mt-2 text-2xl font-semibold text-[#17211B]">{demo.name}</h2>
                  <p className="mt-1 text-sm text-[#5B665F]">Plano {demo.plan?.name ?? "não definido"} · Criada em {formatDate(demo.createdAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">{demo.status === "ACTIVE" ? "Pronta Para Demonstração" : demo.status}</span>
                  <span className="rounded-full bg-[#E8F4EA] px-3 py-1 text-xs font-bold text-[#256D3C]">{demo.isDemo ? "Demo Identificada" : "Sem Marcação Demo"}</span>
                  <span className="rounded-full bg-[#EEF2EF] px-3 py-1 text-xs font-bold text-[#465149]">{demo.demoProtectionEnabled ? "Proteções Ativas" : "Proteções Desativadas"}</span>
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-[#E3EAE5] bg-[#F8FAF8] p-4">
                    <p className="text-sm text-[#667168]">{label}</p>
                    <p className="mt-1 text-2xl font-semibold text-[#17211B]">{value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-[#DDE5DF] bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-[#17211B]">Acessos Demonstrativos</h2>
                <div className="mt-4 space-y-2 text-sm text-[#4F5A52]">
                  <p><strong>Administradora:</strong> administradora.demo@example.invalid</p>
                  <p><strong>Síndico:</strong> sindico.demo@example.invalid</p>
                  <p><strong>Conselheiro:</strong> conselheiro.demo@example.invalid</p>
                  <p><strong>Proprietário:</strong> proprietario.demo@example.invalid</p>
                  <p><strong>Morador:</strong> morador.demo@example.invalid</p>
                </div>
                <p className="mt-4 text-xs leading-5 text-[#7A847D]">A senha não é exibida nesta página. Ela é mantida na variável protegida DEMO_SEED_PASSWORD.</p>
              </div>

              <div className="rounded-3xl border border-[#DDE5DF] bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-[#17211B]">Último Reset</h2>
                {lastReset ? (
                  <div className="mt-4 space-y-2 text-sm text-[#4F5A52]">
                    <p><strong>Status:</strong> {lastReset.status}</p>
                    <p><strong>Solicitado por:</strong> {lastReset.requestedByName || lastReset.requestedByEmail || "Super Admin"}</p>
                    <p><strong>Início:</strong> {formatDate(lastReset.startedAt)}</p>
                    <p><strong>Conclusão:</strong> {formatDate(lastReset.completedAt)}</p>
                    {lastReset.errorMessage && <p className="text-red-700"><strong>Erro:</strong> {lastReset.errorMessage}</p>}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-[#667168]">Nenhum reset pelo painel foi registrado.</p>
                )}
              </div>
            </section>

            <DemoResetPanel />
          </>
        )}
      </main>
    </EloGestShell>
  );
}
