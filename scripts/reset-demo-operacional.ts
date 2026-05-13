import "dotenv/config";
import { db } from "../src/lib/db";

/* =========================================================
   RESET OPERACIONAL DO AMBIENTE DEMO - ELOGEST

   Objetivo:
   Limpar somente dados operacionais de testes, mantendo a base
   estrutural da demonstração.

   ESTE SCRIPT APAGA:
   - Notification
   - TicketRating
   - TicketAttachment
   - TicketLog
   - Ticket

   ESTE SCRIPT NÃO APAGA:
   - User
   - UserAccess
   - Administrator
   - Condominium
   - Unit
   - Resident
   - NotificationPreference

   Uso recomendado:
   1. Fazer backup antes.
   2. Rodar em ambiente de desenvolvimento/demo.
   3. Nunca rodar em produção sem confirmação explícita.

   Comando de teste, sem apagar:
   npx tsx scripts/reset-demo-operacional.ts

   Comando real no PowerShell:
   $env:CONFIRM_RESET_DEMO="SIM"; npx tsx scripts/reset-demo-operacional.ts

   Observação importante:
   Este projeto usa Prisma com adapter-pg em src/lib/db.ts.
   Por isso este script importa o client oficial do projeto:
   import { db } from "../src/lib/db";
   ========================================================= */



/* =========================================================
   CONFIRMAÇÃO DE SEGURANÇA
   ========================================================= */

function isConfirmed() {
  return process.env.CONFIRM_RESET_DEMO === "SIM";
}



/* =========================================================
   RESUMO ANTES / DEPOIS
   ========================================================= */

async function countCurrentData() {
  const [
    notifications,
    ticketRatings,
    ticketAttachments,
    ticketLogs,
    tickets,
    users,
    accesses,
    administrators,
    condominiums,
    units,
    residents,
    notificationPreferences,
  ] = await Promise.all([
    db.notification.count(),
    db.ticketRating.count(),
    db.ticketAttachment.count(),
    db.ticketLog.count(),
    db.ticket.count(),
    db.user.count(),
    db.userAccess.count(),
    db.administrator.count(),
    db.condominium.count(),
    db.unit.count(),
    db.resident.count(),
    db.notificationPreference.count(),
  ]);

  return {
    notifications,
    ticketRatings,
    ticketAttachments,
    ticketLogs,
    tickets,
    users,
    accesses,
    administrators,
    condominiums,
    units,
    residents,
    notificationPreferences,
  };
}



/* =========================================================
   LIMPEZA OPERACIONAL

   Ordem escolhida:
   1. Notification
   2. TicketRating
   3. TicketAttachment
   4. TicketLog
   5. Ticket

   Mesmo que o schema tenha onDelete: Cascade em algumas relações,
   apagamos explicitamente para deixar claro o que está sendo limpo.
   ========================================================= */

async function resetOperationalData() {
  return db.$transaction(async (tx) => {
    const deletedNotifications = await tx.notification.deleteMany({});
    const deletedTicketRatings = await tx.ticketRating.deleteMany({});
    const deletedTicketAttachments = await tx.ticketAttachment.deleteMany({});
    const deletedTicketLogs = await tx.ticketLog.deleteMany({});
    const deletedTickets = await tx.ticket.deleteMany({});

    return {
      deletedNotifications: deletedNotifications.count,
      deletedTicketRatings: deletedTicketRatings.count,
      deletedTicketAttachments: deletedTicketAttachments.count,
      deletedTicketLogs: deletedTicketLogs.count,
      deletedTickets: deletedTickets.count,
    };
  });
}



/* =========================================================
   EXECUÇÃO
   ========================================================= */

async function main() {
  console.log("");
  console.log("=====================================================");
  console.log(" RESET OPERACIONAL DO AMBIENTE DEMO - ELOGEST");
  console.log("=====================================================");
  console.log("");

  console.log("Este script vai apagar somente dados operacionais:");
  console.log("- Notification");
  console.log("- TicketRating");
  console.log("- TicketAttachment");
  console.log("- TicketLog");
  console.log("- Ticket");
  console.log("");

  console.log("Este script NÃO vai apagar:");
  console.log("- User");
  console.log("- UserAccess");
  console.log("- Administrator");
  console.log("- Condominium");
  console.log("- Unit");
  console.log("- Resident");
  console.log("- NotificationPreference");
  console.log("");



  /* =========================================================
     BLOQUEIO DE SEGURANÇA

     Agora o Prisma só é usado depois desta trava.
     Porém, como importamos db no topo, o DATABASE_URL precisa
     existir no ambiente para o script iniciar.
     ========================================================= */

  if (!isConfirmed()) {
    console.log("⚠️  Execução bloqueada por segurança.");
    console.log("");
    console.log("Para confirmar a limpeza, rode no PowerShell:");
    console.log("");
    console.log(
      '$env:CONFIRM_RESET_DEMO="SIM"; npx tsx scripts/reset-demo-operacional.ts'
    );
    console.log("");
    process.exit(0);
  }



  /* =========================================================
     CONTAGEM ANTES
     ========================================================= */

  console.log("Contagem antes da limpeza:");
  console.log("");

  const before = await countCurrentData();

  console.table(before);



  /* =========================================================
     EXECUTA LIMPEZA
     ========================================================= */

  console.log("");
  console.log("Iniciando limpeza operacional...");
  console.log("");

  const result = await resetOperationalData();

  console.log("Registros removidos:");
  console.log("");

  console.table(result);



  /* =========================================================
     CONTAGEM DEPOIS
     ========================================================= */

  console.log("");
  console.log("Contagem depois da limpeza:");
  console.log("");

  const after = await countCurrentData();

  console.table(after);

  console.log("");
  console.log("✅ Reset operacional concluído com sucesso.");
  console.log("");
}



main()
  .catch((error) => {
    console.error("");
    console.error("❌ Erro ao executar reset operacional:");
    console.error(error);
    console.error("");
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });