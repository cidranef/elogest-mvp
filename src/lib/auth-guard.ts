import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";



/* =========================================================
   AUTH GUARD - ELOGEST

   Função central para recuperar o usuário autenticado
   em rotas server-side, route handlers e páginas protegidas.

   Regra:
   - Sem sessão válida: lança erro "UNAUTHORIZED".
   - Com sessão válida: retorna session.user.

   ETAPA 40.1 — AUDITORIA FUNCIONAL FINAL DO MVP
   AUTENTICAÇÃO E REDIRECIONAMENTO

   Ajustes desta revisão:
   - Mantida compatibilidade total com getAuthUser().
   - Adicionado tipo AuthUser para reduzir uso de any.
   - Adicionados helpers isAuthError() e unauthorizedResponse().
   - Mantida a string "UNAUTHORIZED" usada pelas APIs existentes.
   ========================================================= */



export type AuthUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;

  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;

  isActive?: boolean | null;
};



export async function getAuthUser(): Promise<AuthUser> {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    throw new Error("UNAUTHORIZED");
  }

  return session.user as AuthUser;
}



export function isAuthError(error: unknown) {
  return error instanceof Error && error.message === "UNAUTHORIZED";
}



export function unauthorizedResponse() {
  return Response.json(
    { error: "Não autorizado." },
    { status: 401 }
  );
}