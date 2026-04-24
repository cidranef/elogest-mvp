import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-5xl mx-auto rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <h1 className="text-3xl font-bold mb-2">Dashboard EloGest</h1>
        <p className="text-slate-400 mb-6">Você está autenticado.</p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="text-sm text-slate-400">Nome</div>
            <div className="font-semibold">{session.user.name}</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="text-sm text-slate-400">E-mail</div>
            <div className="font-semibold">{session.user.email}</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="text-sm text-slate-400">Perfil</div>
            <div className="font-semibold">{session.user.role}</div>
          </div>
        </div>
      </div>
    </main>
  );
}