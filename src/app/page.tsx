import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-8">
      <div className="max-w-2xl w-full rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <h1 className="text-3xl font-bold mb-4">EloGest MVP</h1>
        <p className="text-slate-300 mb-2">
          Base inicial da plataforma condominial em funcionamento.
        </p>
        <p className="text-slate-400 mb-6">
          Próximos passos: autenticação, dashboard e cadastros principais.
        </p>

        <Link
          href="/login"
          className="inline-flex rounded-xl bg-white text-slate-950 font-semibold px-5 py-3 hover:opacity-90 transition"
        >
          Ir para login
        </Link>
      </div>
    </main>
  );
}