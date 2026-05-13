import { redirect } from "next/navigation";



/* =========================================================
   REDIRECT - NOVO MORADOR

   ETAPA 39.13

   Esta rota antiga foi mantida apenas por compatibilidade.

   O cadastro oficial de moradores agora acontece via modal em:

   /admin/moradores

   Motivo:
   - evita duplicidade de formulários;
   - mantém uma única regra visual e funcional;
   - reduz risco de inconsistência entre página antiga e modal novo;
   - preserva links antigos sem gerar erro 404.
   ========================================================= */

export default function NovoMoradorRedirectPage() {
  redirect("/admin/moradores");
}