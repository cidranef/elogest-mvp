import { db } from "@/lib/db";
import {
  getNotificationEnabledChannels,
  getNotificationEventConfig,
  listNotificationEvents,
  shouldRespectUserNotificationPreference,
  type NotificationChannel,
  type NotificationEventType,
} from "@/lib/notification-events";



/* =========================================================
   ETAPA 25.4 - SERVIÇO DE PREFERÊNCIAS DE NOTIFICAÇÃO

   Este arquivo centraliza a leitura e criação das preferências
   de notificação por usuário.

   ETAPA 37.4:
   - Corrigida a criação/listagem de preferências.
   - Removida dependência direta do alias userId_eventType em findUnique/update.
   - Passa a usar findFirst + update por id, mais tolerante ao schema atual.
   - Incluído TICKET_ASSIGNED_PUBLIC nas preferências base.
   - Base agora é montada a partir da matriz central de eventos.

   ETAPA 42.3.4 — E-MAILS DE NOTIFICAÇÃO

   Ajustes:
   - SYSTEM continua ativo por padrão.
   - EMAIL passa a iniciar ativo por padrão apenas para eventos
     externos preparados e que possuem EMAIL ativo em enabledChannels.
   - Mantida a possibilidade de o usuário desativar EMAIL nas
     preferências.

   ETAPA 42.10 — WHATSAPP EM MODO DE TESTE

   Ajustes:
   - WHATSAPP passa a iniciar ativo por padrão apenas para eventos
     externos preparados e que possuem WHATSAPP ativo em enabledChannels.
   - Isso NÃO envia mensagem real.
   - O envio real permanece bloqueado em src/lib/whatsapp.ts.
   - A preferência passa apenas a permitir que o dispatcher execute
     o modo de teste/simulado do WhatsApp.

   ETAPA 42.10.4 — ALINHAMENTO COM MATRIZ CONTROLADA

   Ajustes desta revisão:
   - getDefaultNotificationPreference() passa a usar enabledChannels,
     não availableChannels.
   - Isso evita ativar por padrão canais que existem apenas como
     possibilidade futura.
   - Eventos sem userPreferenceEnabled não entram na base.
   - SYSTEM só nasce ativo se estiver ativo em enabledChannels.
   - EMAIL só nasce ativo se estiver ativo em enabledChannels.
   - WHATSAPP só nasce ativo se estiver ativo em enabledChannels.

   ETAPA 50 — ENQUETES

   Ajustes desta revisão:
   - Nenhuma regra paralela foi criada para enquetes.
   - Os eventos POLL_PUBLISHED, POLL_EXTENDED e
     POLL_RESULTS_PUBLISHED entram automaticamente na base a partir
     da matriz central de notification-events.ts.
   - Nesta etapa, somente SYSTEM nasce ativo para esses eventos.
   - EMAIL e WHATSAPP permanecem preparados para evolução futura.
   ========================================================= */



/* =========================================================
   TIPOS AUXILIARES
   ========================================================= */

export type NotificationPreferenceResult = {
  id?: string;
  userId: string;
  eventType: NotificationEventType;
  systemEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};





type NotificationPreferenceLike = {
  id?: string;
  userId: string;
  eventType: string;
  systemEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};


type EnsurePreferenceInput = {
  userId: string;
  eventType?: string | null;
};



type IsChannelEnabledInput = {
  userId: string;
  eventType?: string | null;
  channel: NotificationChannel;
};



type UpdatePreferenceInput = {
  userId: string;
  eventType?: string | null;
  systemEnabled?: boolean;
  emailEnabled?: boolean;
  whatsappEnabled?: boolean;
};



/* =========================================================
   NORMALIZA EVENT TYPE

   Se vier um evento desconhecido, cai para GENERAL.
   ========================================================= */

export function normalizePreferenceEventType(
  eventType?: string | null
): NotificationEventType {
  const config = getNotificationEventConfig(eventType || "GENERAL");

  return config.type;
}



/* =========================================================
   PREFERÊNCIA PADRÃO

   Regra atual do MVP:
   - SYSTEM começa ativo somente se estiver ativo em enabledChannels.
   - EMAIL começa ativo somente se estiver ativo em enabledChannels.
   - WHATSAPP começa ativo somente se estiver ativo em enabledChannels.

   Diferença importante:
   - availableChannels = canal possível/agendado para futuro.
   - enabledChannels   = canal ativo agora no MVP.

   Observação:
   Se o usuário já possui preferência salva, respeitamos o que
   está salvo no banco.
   ========================================================= */

export function getDefaultNotificationPreference(
  eventType?: string | null
): Omit<
  NotificationPreferenceResult,
  "id" | "userId" | "createdAt" | "updatedAt"
> {
  const normalizedEventType = normalizePreferenceEventType(eventType);
  const enabledChannels = getNotificationEnabledChannels(normalizedEventType);

  return {
    eventType: normalizedEventType,
    systemEnabled: enabledChannels.includes("SYSTEM"),
    emailEnabled: enabledChannels.includes("EMAIL"),
    whatsappEnabled: enabledChannels.includes("WHATSAPP"),
  };
}



/* =========================================================
   SERIALIZAR PREFERÊNCIA

   Mantém retorno padronizado para API e componentes.
   ========================================================= */

function serializePreference(
  preference: NotificationPreferenceLike,
): NotificationPreferenceResult {
  return {
    id: preference.id,
    userId: preference.userId,
    eventType: preference.eventType as NotificationEventType,
    systemEnabled: !!preference.systemEnabled,
    emailEnabled: !!preference.emailEnabled,
    whatsappEnabled: !!preference.whatsappEnabled,
    createdAt: preference.createdAt,
    updatedAt: preference.updatedAt,
  };
}



/* =========================================================
   BUSCAR PREFERÊNCIA EXISTENTE

   ETAPA 37.4:
   Usamos findFirst em vez de findUnique(userId_eventType), para evitar
   quebra caso o schema atual ainda não tenha a constraint composta
   nomeada/gerada da forma esperada pelo Prisma Client.
   ========================================================= */

async function findExistingNotificationPreference({
  userId,
  eventType,
}: {
  userId: string;
  eventType: NotificationEventType;
}) {
  return db.notificationPreference.findFirst({
    where: {
      userId,
      eventType,
    },
  });
}



/* =========================================================
   GARANTIR PREFERÊNCIA DO USUÁRIO

   Busca preferência existente.

   Se não existir:
   - cria uma nova com padrão seguro;
   - retorna a preferência criada.

   Segurança:
   - Eventos sem preferência de usuário não deveriam chegar aqui pela API,
     mas mantemos o normalize para evitar quebra em chamadas antigas.
   ========================================================= */

export async function ensureNotificationPreference({
  userId,
  eventType,
}: EnsurePreferenceInput): Promise<NotificationPreferenceResult> {
  const normalizedEventType = normalizePreferenceEventType(eventType);

  const existingPreference = await findExistingNotificationPreference({
    userId,
    eventType: normalizedEventType,
  });

  if (existingPreference) {
    return serializePreference(existingPreference);
  }

  const defaultPreference = getDefaultNotificationPreference(normalizedEventType);

  try {
    const createdPreference = await db.notificationPreference.create({
      data: {
        userId,
        eventType: defaultPreference.eventType,
        systemEnabled: defaultPreference.systemEnabled,
        emailEnabled: defaultPreference.emailEnabled,
        whatsappEnabled: defaultPreference.whatsappEnabled,
      },
    });

    return serializePreference(createdPreference);
  } catch (error) {
    /*
       Defesa contra corrida:
       Se duas chamadas tentarem criar a mesma preferência ao mesmo tempo,
       buscamos novamente antes de propagar erro.
    */
    const preferenceAfterCreateAttempt =
      await findExistingNotificationPreference({
        userId,
        eventType: normalizedEventType,
      });

    if (preferenceAfterCreateAttempt) {
      return serializePreference(preferenceAfterCreateAttempt);
    }

    throw error;
  }
}



/* =========================================================
   VERIFICAR SE CANAL ESTÁ ATIVO PARA O USUÁRIO

   Regra:
   - Eventos que não respeitam preferência do usuário só permitem SYSTEM.
   - SYSTEM respeita a preferência quando o evento for configurável.
   - EMAIL respeita a preferência do usuário.
   - WHATSAPP respeita a preferência do usuário.
   - Se a preferência não existir, ensureNotificationPreference()
     cria usando a matriz atual baseada em enabledChannels.
   ========================================================= */

export async function isNotificationChannelEnabledForUser({
  userId,
  eventType,
  channel,
}: IsChannelEnabledInput) {
  const normalizedEventType = normalizePreferenceEventType(eventType);

  const respectsPreference =
    shouldRespectUserNotificationPreference(normalizedEventType);

  if (!respectsPreference) {
    return channel === "SYSTEM";
  }

  const preference = await ensureNotificationPreference({
    userId,
    eventType: normalizedEventType,
  });

  if (channel === "SYSTEM") {
    return preference.systemEnabled;
  }

  if (channel === "EMAIL") {
    return preference.emailEnabled;
  }

  if (channel === "WHATSAPP") {
    return preference.whatsappEnabled;
  }

  return false;
}



/* =========================================================
   BUSCAR TODAS AS PREFERÊNCIAS DO USUÁRIO
   ========================================================= */

export async function listUserNotificationPreferences(userId: string) {
  const preferences = await db.notificationPreference.findMany({
    where: {
      userId,
    },
    orderBy: {
      eventType: "asc",
    },
  });

  return preferences.map(serializePreference);
}



/* =========================================================
   ATUALIZAR PREFERÊNCIA DO USUÁRIO

   ETAPA 37.4:
   Atualização passa a usar o id da preferência encontrada/criada,
   evitando dependência direta de userId_eventType no update.

   Observação:
   A validação de perfil ativo, evento disponível e canal ativo
   é feita na API:
   src/app/api/notifications/preferences/route.ts
   ========================================================= */

export async function updateNotificationPreference({
  userId,
  eventType,
  systemEnabled,
  emailEnabled,
  whatsappEnabled,
}: UpdatePreferenceInput) {
  const normalizedEventType = normalizePreferenceEventType(eventType);

  const ensuredPreference = await ensureNotificationPreference({
    userId,
    eventType: normalizedEventType,
  });

  const data: {
    systemEnabled?: boolean;
    emailEnabled?: boolean;
    whatsappEnabled?: boolean;
  } = {};

  if (typeof systemEnabled === "boolean") {
    data.systemEnabled = systemEnabled;
  }

  if (typeof emailEnabled === "boolean") {
    data.emailEnabled = emailEnabled;
  }

  if (typeof whatsappEnabled === "boolean") {
    data.whatsappEnabled = whatsappEnabled;
  }

  if (!ensuredPreference.id) {
    throw new Error("NOTIFICATION_PREFERENCE_ID_NOT_FOUND");
  }

  const updatedPreference = await db.notificationPreference.update({
    where: {
      id: ensuredPreference.id,
    },
    data,
  });

  return serializePreference(updatedPreference);
}



/* =========================================================
   GARANTIR PREFERÊNCIAS BÁSICAS PARA UM USUÁRIO

   A lista vem da matriz central de eventos.

   Regra:
   - Cria apenas eventos com userPreferenceEnabled=true.
   - Usa enabledChannels para os padrões iniciais.
   - Eventos futuros/técnicos não geram preferência desnecessária.
   ========================================================= */

export async function ensureBaseNotificationPreferencesForUser(userId: string) {
  const events = listNotificationEvents().filter(
    (event) => event.userPreferenceEnabled
  );

  const results: NotificationPreferenceResult[] = [];

  for (const event of events) {
    const preference = await ensureNotificationPreference({
      userId,
      eventType: event.type,
    });

    results.push(preference);
  }

  return results;
}