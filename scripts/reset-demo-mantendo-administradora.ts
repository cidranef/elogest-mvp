import "dotenv/config";
import { rm } from "fs/promises";
import path from "path";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";



/* =========================================================
   RESET DEMO MANTENDO ADMINISTRADORA DEMO - ELOGEST

   Objetivo:
   Limpar a base de testes, mantendo apenas a Administradora Demo
   como estrutura inicial.

   ESTE SCRIPT APAGA:
   - Notification
   - NotificationPreference
   - TicketRating
   - TicketAttachment
   - TicketLog
   - Ticket
   - UserAccess
   - User
   - Resident
   - Unit
   - Condominium
   - todas as Administradoras, exceto Administradora Demo

   ESTE SCRIPT MANTÉM/RECRIA:
   - Administradora Demo
   - Super Admin Demo
   - Usuário Administradora Demo
   - UserAccess SUPER_ADMIN
   - UserAccess ADMINISTRADORA vinculado à Administradora Demo

   Uso no PowerShell:
   $env:CONFIRM_RESET_KEEP_ADMIN_DEMO="SIM"; npx tsx scripts/reset-demo-mantendo-administradora.ts

   ATENÇÃO:
   Rodar somente em ambiente de desenvolvimento/demo.
   ========================================================= */



const ADMIN_DEMO_NAME = "Administradora Demo";
const ADMIN_DEMO_CNPJ = "00.000.000/0001-00";
const ADMIN_DEMO_EMAIL = "contato@administradorademo.com";

const SUPER_ADMIN_NAME = "Super Admin Demo";
const SUPER_ADMIN_EMAIL = "superadmin@demo.com";
const SUPER_ADMIN_PASSWORD = "Demo@123456";

const ADMIN_USER_NAME = "Administradora Demo";
const ADMIN_USER_EMAIL = "administradora@demo.com";
const ADMIN_USER_PASSWORD = "Demo@123456";



function isConfirmed() {
  return process.env.CONFIRM_RESET_KEEP_ADMIN_DEMO === "SIM";
}



async function countCurrentData() {
  const [
    notifications,
    notificationPreferences,
    ticketRatings,
    ticketAttachments,
    ticketLogs,
    tickets,
    accesses,
    users,
    residents,
    units,
    condominiums,
    administrators,
  ] = await Promise.all([
    db.notification.count(),
    db.notificationPreference.count(),
    db.ticketRating.count(),
    db.ticketAttachment.count(),
    db.ticketLog.count(),
    db.ticket.count(),
    db.userAccess.count(),
    db.user.count(),
    db.resident.count(),
    db.unit.count(),
    db.condominium.count(),
    db.administrator.count(),
  ]);

  return {
    notifications,
    notificationPreferences,
    ticketRatings,
    ticketAttachments,
    ticketLogs,
    tickets,
    accesses,
    users,
    residents,
    units,
    condominiums,
    administrators,
  };
}



/* =========================================================
   LIMPEZA CONTROLADA

   Ordem importante por causa das FKs:
   1. tabelas operacionais
   2. UserAccess
   3. NotificationPreference
   4. User
   5. Resident
   6. Unit
   7. Condominium
   8. Administrators, exceto Administradora Demo
   ========================================================= */

async function resetDataKeepingAdminDemo() {
  return db.$transaction(async (tx) => {
    const deletedNotifications = await tx.notification.deleteMany({});
    const deletedNotificationPreferences =
      await tx.notificationPreference.deleteMany({});

    const deletedTicketRatings = await tx.ticketRating.deleteMany({});
    const deletedTicketAttachments = await tx.ticketAttachment.deleteMany({});
    const deletedTicketLogs = await tx.ticketLog.deleteMany({});
    const deletedTickets = await tx.ticket.deleteMany({});

    const deletedUserAccesses = await tx.userAccess.deleteMany({});
    const deletedUsers = await tx.user.deleteMany({});

    const deletedResidents = await tx.resident.deleteMany({});
    const deletedUnits = await tx.unit.deleteMany({});
    const deletedCondominiums = await tx.condominium.deleteMany({});

    const deletedOtherAdministrators = await tx.administrator.deleteMany({
      where: {
        NOT: {
          name: ADMIN_DEMO_NAME,
        },
      },
    });

    return {
      deletedNotifications: deletedNotifications.count,
      deletedNotificationPreferences: deletedNotificationPreferences.count,
      deletedTicketRatings: deletedTicketRatings.count,
      deletedTicketAttachments: deletedTicketAttachments.count,
      deletedTicketLogs: deletedTicketLogs.count,
      deletedTickets: deletedTickets.count,
      deletedUserAccesses: deletedUserAccesses.count,
      deletedUsers: deletedUsers.count,
      deletedResidents: deletedResidents.count,
      deletedUnits: deletedUnits.count,
      deletedCondominiums: deletedCondominiums.count,
      deletedOtherAdministrators: deletedOtherAdministrators.count,
    };
  });
}



/* =========================================================
   GARANTIR ADMINISTRADORA DEMO

   Se já existir, atualiza.
   Se não existir, cria.
   ========================================================= */

async function ensureAdministratorDemo() {
  const existing = await db.administrator.findFirst({
    where: {
      OR: [
        {
          name: ADMIN_DEMO_NAME,
        },
        {
          cnpj: ADMIN_DEMO_CNPJ,
        },
      ],
    },
  });

  if (existing) {
    return db.administrator.update({
      where: {
        id: existing.id,
      },
      data: {
        name: ADMIN_DEMO_NAME,
        cnpj: ADMIN_DEMO_CNPJ,
        email: ADMIN_DEMO_EMAIL,
        phone: null,
        status: "ACTIVE",
      },
    });
  }

  return db.administrator.create({
    data: {
      name: ADMIN_DEMO_NAME,
      cnpj: ADMIN_DEMO_CNPJ,
      email: ADMIN_DEMO_EMAIL,
      phone: null,
      status: "ACTIVE",
    },
  });
}



/* =========================================================
   RECRIAR USUÁRIOS INICIAIS

   1. Super Admin Demo
   2. Usuário Administradora Demo
   ========================================================= */

async function createInitialUsers(administratorId: string) {
  const superAdminPasswordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);
  const adminUserPasswordHash = await bcrypt.hash(ADMIN_USER_PASSWORD, 10);

  const superAdmin = await db.user.create({
    data: {
      name: SUPER_ADMIN_NAME,
      email: SUPER_ADMIN_EMAIL,
      passwordHash: superAdminPasswordHash,
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });

  const superAdminAccess = await db.userAccess.create({
    data: {
      userId: superAdmin.id,
      role: "SUPER_ADMIN",
      label: "Super Admin",
      isDefault: true,
      isActive: true,
    },
  });

  const adminUser = await db.user.create({
    data: {
      name: ADMIN_USER_NAME,
      email: ADMIN_USER_EMAIL,
      passwordHash: adminUserPasswordHash,
      role: "ADMINISTRADORA",
      administratorId,
      isActive: true,
    },
  });

  const adminUserAccess = await db.userAccess.create({
    data: {
      userId: adminUser.id,
      administratorId,
      role: "ADMINISTRADORA",
      label: `Administradora - ${ADMIN_DEMO_NAME}`,
      isDefault: true,
      isActive: true,
    },
  });

  return {
    superAdmin: {
      userId: superAdmin.id,
      accessId: superAdminAccess.id,
      name: superAdmin.name,
      email: superAdmin.email,
    },

    adminUser: {
      userId: adminUser.id,
      accessId: adminUserAccess.id,
      name: adminUser.name,
      email: adminUser.email,
      administratorId,
    },
  };
}



/* =========================================================
   REMOVER ARQUIVOS FÍSICOS DE ANEXOS
   ========================================================= */

async function removeUploadedAttachmentsFolder() {
  const uploadPath = path.join(
    process.cwd(),
    "public",
    "uploads",
    "chamados"
  );

  try {
    await rm(uploadPath, {
      recursive: true,
      force: true,
    });

    return {
      removed: true,
      path: uploadPath,
    };
  } catch (error) {
    return {
      removed: false,
      path: uploadPath,
      error,
    };
  }
}



/* =========================================================
   EXECUÇÃO
   ========================================================= */

async function main() {
  console.log("");
  console.log("=====================================================");
  console.log(" RESET DEMO MANTENDO ADMINISTRADORA DEMO - ELOGEST");
  console.log("=====================================================");
  console.log("");

  console.log("Este script vai limpar a base de testes, mantendo apenas:");
  console.log(`- ${ADMIN_DEMO_NAME}`);
  console.log("- Super Admin Demo");
  console.log("- Usuário Administradora Demo");
  console.log("");

  console.log("Será apagado:");
  console.log("- chamados");
  console.log("- logs");
  console.log("- anexos");
  console.log("- avaliações");
  console.log("- notificações");
  console.log("- condomínios");
  console.log("- unidades");
  console.log("- moradores");
  console.log("- usuários antigos");
  console.log("- acessos antigos");
  console.log("- outras administradoras");
  console.log("");



  if (!isConfirmed()) {
    console.log("⚠️  Execução bloqueada por segurança.");
    console.log("");
    console.log("Para confirmar, rode no PowerShell:");
    console.log("");
    console.log(
      '$env:CONFIRM_RESET_KEEP_ADMIN_DEMO="SIM"; npx tsx scripts/reset-demo-mantendo-administradora.ts'
    );
    console.log("");
    process.exit(0);
  }



  console.log("Contagem antes da limpeza:");
  console.log("");

  const before = await countCurrentData();

  console.table(before);



  console.log("");
  console.log("Iniciando limpeza controlada...");
  console.log("");

  const deleted = await resetDataKeepingAdminDemo();

  console.log("Registros removidos:");
  console.log("");

  console.table(deleted);



  console.log("");
  console.log("Garantindo Administradora Demo...");
  console.log("");

  const administrator = await ensureAdministratorDemo();

  console.table({
    id: administrator.id,
    name: administrator.name,
    cnpj: administrator.cnpj,
    email: administrator.email,
    status: administrator.status,
  });



  console.log("");
  console.log("Recriando usuários iniciais...");
  console.log("");

  const users = await createInitialUsers(administrator.id);

  console.table({
    superAdminEmail: users.superAdmin.email,
    adminUserEmail: users.adminUser.email,
    administratorId: administrator.id,
  });



  console.log("");
  console.log("Removendo arquivos físicos de anexos...");
  console.log("");

  const uploadCleanup = await removeUploadedAttachmentsFolder();

  console.table(uploadCleanup);



  console.log("");
  console.log("Contagem depois da limpeza:");
  console.log("");

  const after = await countCurrentData();

  console.table(after);



  console.log("");
  console.log("✅ Reset concluído com sucesso.");
  console.log("");
  console.log("Acessos iniciais:");
  console.log("");
  console.log(`Super Admin: ${SUPER_ADMIN_EMAIL}`);
  console.log(`Senha: ${SUPER_ADMIN_PASSWORD}`);
  console.log("");
  console.log(`Administradora: ${ADMIN_USER_EMAIL}`);
  console.log(`Senha: ${ADMIN_USER_PASSWORD}`);
  console.log("");
}



main()
  .catch((error) => {
    console.error("");
    console.error("❌ Erro ao executar reset:");
    console.error(error);
    console.error("");
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });