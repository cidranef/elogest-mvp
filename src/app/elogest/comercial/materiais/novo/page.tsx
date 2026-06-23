import Link from "next/link";
import EloGestShell from "@/components/EloGestShell";
import NewMaterialForm from "./NewMaterialForm";
export default function NewMaterialPage() { return <EloGestShell current="comercial"><main className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6 lg:p-8"><div><Link href="/elogest/comercial/materiais" className="text-sm font-semibold text-[#256D3C]">← Materiais Comerciais</Link><h1 className="mt-3 text-3xl font-semibold">Novo Material</h1></div><NewMaterialForm /></main></EloGestShell>; }
