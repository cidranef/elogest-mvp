export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-8">
      <div className="max-w-2xl w-full rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <h1 className="text-3xl font-bold mb-4">EloGest MVP</h1>
        <p className="text-slate-300 mb-2">
          Base inicial da plataforma condominial em funcionamento.
        </p>
        <p className="text-slate-400">
          Próximos passos: autenticação, dashboard e cadastros principais.
        </p>
      </div>
    </main>
  );
}