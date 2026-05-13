import { getAuthUser } from "@/lib/auth-guard";
import {
  ensureBaseNotificationPreferencesForUser,
  listUserNotificationPreferences,
  updateNotificationPreference,
} from "@/lib/notification-preferences";
import {
  getNotificationEventConfig,
  listNotificationEvents,
  type NotificationChannel,
} from "@/lib/notification-events";
import {
  canAccessNotifications,
  canManageOwnNotificationPreferences,
} from "@/lib/access-control";
import { NextResponse } from "next/server";



/* =========================================================
   ETAPA 25.6 - API DE PREFERÊNCIAS DE NOTIFICAÇÃO

   Rota:
   GET /api/notifications/preferences

   Objetivo:
   Retornar as preferências de notificação do usuário logado.

   Rota:
   PATCH /api/notifications/preferences

   Objetivo:
   Atualizar uma preferência específica do usuário logado.

   Regras:
   - usuário precisa estar autenticado;
   - usuário só altera as próprias preferências;
   - SYSTEM pode ser ligado/desligado;
   - EMAIL pode ser ligado/desligado quando estiver ativo em
     enabledChannels do evento;
   - WHATSAPP permanece bloqueado enquanto não estiver ativo em
     enabledChannels do evento.

   ETAPA 26.2 - AUDITORIA DE PERMISSÕES

   Agora a rota usa a matriz central:

   src/lib/access-control.ts

   Permissões exigidas:
   - ACCESS_NOTIFICATIONS
   - MANAGE_OWN_NOTIFICATION_PREFERENCES

   ETAPA 42.3.4 — E-MAIL ATIVO PARA EVENTOS DE CHAMADOS

   Ajustes desta revisão:
   - GET passa a devolver flags auxiliares por canal:
     systemAvailable, systemActiveNow,
     emailAvailable, emailActiveNow,
     whatsappAvailable, whatsappActiveNow.
   - PATCH valida se o canal enviado está ativo no evento antes
     de permitir alteração.
   - EMAIL passa a poder ser alterado quando EMAIL existir em
     enabledChannels.
   - WHATSAPP continua bloqueado enquanto não estiver em
     enabledChannels.
   - Mantida compatibilidade com a página atual, que já consome
     availableChannels e enabledChannels.
   ========================================================= */



type AuthUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};



function isChannelAvailable(
  channels: NotificationChannel[],
  channel: NotificationChannel
) {
  return channels.includes(channel);
}



function isChannelActiveNow(
  channels: NotificationChannel[],
  channel: NotificationChannel
) {
  return channels.includes(channel);
}



function validateChannelUpdate({
  field,
  eventConfig,
}: {
  field: "systemEnabled" | "emailEnabled" | "whatsappEnabled";
  eventConfig: ReturnType<typeof getNotificationEventConfig>;
}) {
  if (field === "systemEnabled") {
    return {
      ok: isChannelActiveNow(eventConfig.enabledChannels, "SYSTEM"),
      error:
        "O canal de notificação no sistema não está ativo para este evento.",
    };
  }

  if (field === "emailEnabled") {
    return {
      ok: isChannelActiveNow(eventConfig.enabledChannels, "EMAIL"),
      error:
        "O canal de e-mail ainda não está ativo para este evento.",
    };
  }

  if (field === "whatsappEnabled") {
    return {
      ok: isChannelActiveNow(eventConfig.enabledChannels, "WHATSAPP"),
      error:
        "O canal de WhatsApp ainda não está ativo para este evento.",
    };
  }

  return {
    ok: false,
    error: "Canal inválido.",
  };
}



/* =========================================================
   MONTA RESPOSTA DAS PREFERÊNCIAS

   Combina:
   - matriz de eventos;
   - preferências salvas no banco.

   Assim a tela consegue mostrar:
   - nome amigável;
   - descrição;
   - canais disponíveis;
   - canais ativos agora;
   - valores salvos pelo usuário.
   ========================================================= */

async function buildPreferencesResponse(userId: string) {
  await ensureBaseNotificationPreferencesForUser(userId);

  const events = listNotificationEvents();
  const preferences = await listUserNotificationPreferences(userId);

  const preferenceMap = new Map(
    preferences.map((preference) => [preference.eventType, preference])
  );

  const items = events
    .filter((event) => event.userPreferenceEnabled)
    .map((event) => {
      const preference = preferenceMap.get(event.type);

      const systemAvailable = isChannelAvailable(
        event.availableChannels,
        "SYSTEM"
      );
      const emailAvailable = isChannelAvailable(
        event.availableChannels,
        "EMAIL"
      );
      const whatsappAvailable = isChannelAvailable(
        event.availableChannels,
        "WHATSAPP"
      );

      const systemActiveNow = isChannelActiveNow(
        event.enabledChannels,
        "SYSTEM"
      );
      const emailActiveNow = isChannelActiveNow(
        event.enabledChannels,
        "EMAIL"
      );
      const whatsappActiveNow = isChannelActiveNow(
        event.enabledChannels,
        "WHATSAPP"
      );

      return {
        eventType: event.type,
        label: event.label,
        description: event.description,

        availableChannels: event.availableChannels,
        enabledChannels: event.enabledChannels,

        externalReady: event.externalReady,
        userPreferenceEnabled: event.userPreferenceEnabled,

        systemAvailable,
        emailAvailable,
        whatsappAvailable,

        systemActiveNow,
        emailActiveNow,
        whatsappActiveNow,

        systemEnabled:
          preference?.systemEnabled !== undefined
            ? preference.systemEnabled
            : systemActiveNow,

        emailEnabled:
          preference?.emailEnabled !== undefined
            ? preference.emailEnabled
            : emailActiveNow,

        whatsappEnabled:
          preference?.whatsappEnabled !== undefined
            ? preference.whatsappEnabled
            : false,

        createdAt: preference?.createdAt || null,
        updatedAt: preference?.updatedAt || null,
      };
    });

  return items;
}



/* =========================================================
   GET - LISTAR PREFERÊNCIAS DO USUÁRIO
   ========================================================= */

export async function GET() {
  try {
    const user = (await getAuthUser()) as AuthUser;

    if (!user) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (!canAccessNotifications(user)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para acessar notificações." },
        { status: 403 }
      );
    }

    if (!canManageOwnNotificationPreferences(user)) {
      return NextResponse.json(
        {
          error:
            "Usuário sem permissão para acessar preferências de notificação.",
        },
        { status: 403 }
      );
    }

    const preferences = await buildPreferencesResponse(user.id);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      preferences,
    });
  } catch (error: any) {
    console.error("ERRO AO LISTAR PREFERÊNCIAS DE NOTIFICAÇÃO:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao listar preferências de notificação." },
      { status: 500 }
    );
  }
}



/* =========================================================
   PATCH - ATUALIZAR PREFERÊNCIA DO USUÁRIO
   ========================================================= */

export async function PATCH(req: Request) {
  try {
    const user = (await getAuthUser()) as AuthUser;
    const body = await req.json();

    if (!user) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (!canAccessNotifications(user)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para acessar notificações." },
        { status: 403 }
      );
    }

    if (!canManageOwnNotificationPreferences(user)) {
      return NextResponse.json(
        {
          error:
            "Usuário sem permissão para alterar preferências de notificação.",
        },
        { status: 403 }
      );
    }

    const eventType = String(body?.eventType || "").trim();

    if (!eventType) {
      return NextResponse.json(
        { error: "Tipo de evento não informado." },
        { status: 400 }
      );
    }

    const eventConfig = getNotificationEventConfig(eventType);

    if (!eventConfig.userPreferenceEnabled) {
      return NextResponse.json(
        { error: "Este evento não permite configuração pelo usuário." },
        { status: 400 }
      );
    }



    /* =========================================================
       ATUALIZAÇÃO DOS CANAIS

       Aceitamos somente boolean quando enviado.
       Campo omitido mantém valor atual.

       Segurança:
       - Só permite alterar um canal se ele estiver ativo agora
         em enabledChannels.
       - Isso libera EMAIL nos eventos já habilitados.
       - Mantém WHATSAPP bloqueado até entrar em enabledChannels.
       ========================================================= */

    const updateData: {
      systemEnabled?: boolean;
      emailEnabled?: boolean;
      whatsappEnabled?: boolean;
    } = {};

    if (typeof body?.systemEnabled === "boolean") {
      const validation = validateChannelUpdate({
        field: "systemEnabled",
        eventConfig,
      });

      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400 }
        );
      }

      updateData.systemEnabled = body.systemEnabled;
    }

    if (typeof body?.emailEnabled === "boolean") {
      const validation = validateChannelUpdate({
        field: "emailEnabled",
        eventConfig,
      });

      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400 }
        );
      }

      updateData.emailEnabled = body.emailEnabled;
    }

    if (typeof body?.whatsappEnabled === "boolean") {
      const validation = validateChannelUpdate({
        field: "whatsappEnabled",
        eventConfig,
      });

      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400 }
        );
      }

      updateData.whatsappEnabled = body.whatsappEnabled;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Nenhuma preferência válida enviada para atualização." },
        { status: 400 }
      );
    }

    const updatedPreference = await updateNotificationPreference({
      userId: user.id,
      eventType: eventConfig.type,
      ...updateData,
    });

    const preferences = await buildPreferencesResponse(user.id);

    return NextResponse.json({
      success: true,
      message: "Preferência atualizada com sucesso.",
      updatedPreference,
      preferences,
    });
  } catch (error: any) {
    console.error("ERRO AO ATUALIZAR PREFERÊNCIA DE NOTIFICAÇÃO:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao atualizar preferência de notificação." },
      { status: 500 }
    );
  }
}
