import type { NextResponse } from "next/server";

import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";

/**
 * Erro interno usado para preservar a resposta 401/403 produzida pelo guard
 * oficial do EloGest dentro do tratamento central das APIs de cobrança.
 */
export class BillingSuperAdminAuthorizationError extends Error {
  readonly response: NextResponse;

  constructor(response: NextResponse) {
    super("Acesso não autorizado à área de cobrança do EloGest.");
    this.name = "BillingSuperAdminAuthorizationError";
    this.response = response;
  }
}

/**
 * Protege as APIs de assinatura e cobrança com o guard oficial do EloGest.
 *
 * Retorna o ID do usuário autenticado para auditoria das operações.
 * Em caso de ausência de autenticação ou perfil diferente de SUPER_ADMIN,
 * lança um erro que mantém a resposta 401/403 original do guard.
 */
export async function requireBillingSuperAdmin(): Promise<string> {
  const auth = await requireEloGestSuperAdmin();

  if ("error" in auth) {
    throw new BillingSuperAdminAuthorizationError(auth.error);
  }

  return auth.authUser.id;
}
