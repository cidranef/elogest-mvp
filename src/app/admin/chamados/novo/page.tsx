import { redirect } from "next/navigation";



/* =========================================================
   REDIRECT - NOVO CHAMADO

   ETAPA 39.13

   Esta rota antiga foi mantida apenas por compatibilidade.

   O cadastro oficial de chamados agora acontece na fila administrativa:

   /admin/chamados

   Motivo:
   - evita duplicidade de formulários;
   - mantém uma única regra visual e funcional;
   - reduz risco de inconsistência entre página antiga e fluxo novo;
   - preserva links antigos sem gerar erro 404.
   ========================================================= */

export default function NovoChamadoRedirectPage() {
  redirect("/admin/chamados");
}