import { db } from "@/lib/db";
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
import {
  getActiveUserAccessFromCookies,
  type ActiveUserAccess,
} from "@/lib/user-access";
import { NextResponse } from "next/server";



/* =========================================================
   API DE PREFERÊNCIAS DE NOTIFICAÇÃO - ELOGEST

   GET /api/notifications/preferences
   - Retorna preferências de notificação do usuário logado.

   PATCH /api/notifications/preferences
   - Atualiza uma preferência específica do usuário logado.

   ETAPA 42.10.4 — SEGURANÇA BACK-END / PERFIL ATIVO

   Ajustes:
   - GET exige sessão válida.
   - GET exige perfil ativo válido.
   - GET retorna 401 quando não há sessão.
   - GET retorna 403 quando não há perfil ativo/permissão.
   - PATCH exige sessão válida.
   - PATCH exige perfil ativo válido.
   - PATCH bloqueia evento que não pertence ao perfil ativo.
   - PATCH bloqueia canal que não está ativo em enabledChannels.
   - PATCH não permite ativar WhatsApp em evento sem WHATSAPP ativo.
   - Respostas 401/403 ficam compatíveis com redirecionamento:
       401 -> /login
       403 -> /contexto

   ETAPA 42.10.6.2 — WHATSAPP DA CONTA / OPT-OUT

   Ajustes desta revisão:
   - GET retorna whatsappAccount com telefone e status global do WhatsApp.
   - PATCH aceita action=PAUSE_WHATSAPP para preencher phoneOptOutAt.
   - PATCH aceita action=RESUME_WHATSAPP para limpar phoneOptOutAt.
   - O controle é por usuário, independente do perfil ativo.
   - Mantém a validação de sessão/perfil ativo para evitar acesso direto.

   ETAPA 43 — ARQUITETURA DE PERFIS, VÍNCULOS E PERMISSÕES

   Ajustes desta revisão:
   - Permissões são avaliadas pelo perfil ativo.
   - CONSELHEIRO passa a ter preferências compatíveis com o portal.
   - Payload do usuário retorna activeAccess para rastreabilidade visual.
   ========================================================= */



type AuthUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;

  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;

  phone?: string | null;
  phoneOptInAt?: Date | string | null;
  phoneOptOutAt?: Date | string | null;
};



type EffectiveUser = AuthUser & {
  activeAccess?: ActiveUserAccess | null;
};



const ADMIN_VISIBLE_EVENTS = [
  "TICKET_CREATED",
  "TICKET_ASSIGNED",
  "TICKET_ASSIGNED_PUBLIC",
  "TICKET_PUBLIC_COMMENT",
  "TICKET_INTERNAL_COMMENT",
  "TICKET_STATUS_CHANGED",
  "TICKET_RESOLVED",
  "TICKET_RATED",
];

const SINDICO_VISIBLE_EVENTS = [
  "TICKET_CREATED",
  "TICKET_ASSIGNED_PUBLIC",
  "TICKET_PUBLIC_COMMENT",
  "TICKET_STATUS_CHANGED",
  "TICKET_RESOLVED",
];

const PORTAL_USER_VISIBLE_EVENTS = [
  "TICKET_CREATED",
  "TICKET_ASSIGNED_PUBLIC",
  "TICKET_PUBLIC_COMMENT",
  "TICKET_STATUS_CHANGED",
  "TICKET_RESOLVED",
];

const PREFERENCES_PAGE_ALLOWED_ROLES = [
  "SUPER_ADMIN",
  "ADMINISTRADORA",
  "SINDICO",
  "MORADOR",
  "PROPRIETARIO",
  "CONSELHEIRO",
];



/* =========================================================
   HELPERS
   ========================================================= */

function normalizeRole(role?: string | null) {
  return String(role || "").trim().toUpperCase();
}



function normalizeEventType(eventType?: string | null) {
  return String(eventType || "").trim().toUpperCase();
}



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



function isPreferencesRoleAllowed(user: EffectiveUser) {
  const role = normalizeRole(user.role);

  return PREFERENCES_PAGE_ALLOWED_ROLES.includes(role);
}



function canShowPreferenceForRole(user: EffectiveUser, eventType: string) {
  const role = normalizeRole(user.role);
  const normalizedEventType = normalizeEventType(eventType);

  if (role === "SUPER_ADMIN" || role === "ADMINISTRADORA") {
    return ADMIN_VISIBLE_EVENTS.includes(normalizedEventType);
  }

  if (role === "SINDICO" || role === "CONSELHEIRO") {
    return SINDICO_VISIBLE_EVENTS.includes(normalizedEventType);
  }

  if (role === "MORADOR" || role === "PROPRIETARIO") {
    return PORTAL_USER_VISIBLE_EVENTS.includes(normalizedEventType);
  }

  return false;
}



/* =========================================================
   USUÁRIO COM PERFIL ATIVO

   A sessão base identifica quem está logado.
   O perfil ativo define em qual papel o usuário está operando.

   Regra:
   - Sem sessão: 401.
   - Sem perfil ativo: 403.
   - Perfil ativo não permitido: 403.
   ========================================================= */

async function getNotificationPreferencesContextUser() {
  const sessionUser = (await getAuthUser()) as AuthUser | null;

  if (!sessionUser?.id) {
    return {
      ok: false as const,
      status: 401,
      error: "Não autorizado.",
      user: null,
    };
  }

  const activeAccess: ActiveUserAccess | null = await getActiveUserAccessFromCookies({
    userId: sessionUser.id,
  });

  if (!activeAccess) {
    return {
      ok: false as const,
      status: 403,
      error: "Selecione um perfil de acesso antes de continuar.",
      user: sessionUser,
    };
  }

  const effectiveUser: EffectiveUser = {
    ...sessionUser,

    role: activeAccess.role || sessionUser.role,

    administratorId:
      activeAccess.administratorId !== undefined
        ? activeAccess.administratorId
        : sessionUser.administratorId,

    condominiumId:
      activeAccess.condominiumId !== undefined
        ? activeAccess.condominiumId
        : sessionUser.condominiumId,

    unitId:
      activeAccess.unitId !== undefined
        ? activeAccess.unitId
        : sessionUser.unitId,

    residentId:
      activeAccess.residentId !== undefined
        ? activeAccess.residentId
        : sessionUser.residentId,

    activeAccess,
  };

  if (!isPreferencesRoleAllowed(effectiveUser)) {
    return {
      ok: false as const,
      status: 403,
      error:
        "Este perfil de acesso não possui preferências de notificação configuráveis.",
      user: effectiveUser,
    };
  }

  if (!canAccessNotifications(effectiveUser.activeAccess || effectiveUser)) {
    return {
      ok: false as const,
      status: 403,
      error: "Usuário sem permissão para acessar notificações.",
      user: effectiveUser,
    };
  }

  if (!canManageOwnNotificationPreferences(effectiveUser.activeAccess || effectiveUser)) {
    return {
      ok: false as const,
      status: 403,
      error:
        "Usuário sem permissão para acessar preferências de notificação.",
      user: effectiveUser,
    };
  }

  return {
    ok: true as const,
    status: 200,
    error: null,
    user: effectiveUser,
  };
}



function userPayload(user: EffectiveUser | AuthUser | null) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    activeAccess: "activeAccess" in user && user.activeAccess
      ? {
          accessId: user.activeAccess.accessId,
          role: user.activeAccess.role,
          label: user.activeAccess.label,
          administratorId: user.activeAccess.administratorId,
          condominiumId: user.activeAccess.condominiumId,
          unitId: user.activeAccess.unitId,
          residentId: user.activeAccess.residentId,
          unitPersonLinkId: user.activeAccess.unitPersonLinkId || null,
          linkType: user.activeAccess.linkType || null,
          source: user.activeAccess.source,
        }
      : null,
  };
}



async function getWhatsAppAccount(userId: string) {
  const user = await db.user.findFirst({
    where: {
      id: userId,
      isActive: true,
    },
    select: {
      id: true,
      phone: true,
      phoneOptInAt: true,
      phoneOptOutAt: true,
    },
  });

  if (!user) {
    return {
      phone: null,
      phoneOptInAt: null,
      phoneOptOutAt: null,
      whatsappPaused: true,
      whatsappAvailable: false,
    };
  }

  return {
    phone: user.phone || null,
    phoneOptInAt: user.phoneOptInAt || null,
    phoneOptOutAt: user.phoneOptOutAt || null,
    whatsappPaused: !!user.phoneOptOutAt,
    whatsappAvailable: !!user.phone,
  };
}



async function updateWhatsAppAccountOptOut({
  userId,
  paused,
}: {
  userId: string;
  paused: boolean;
}) {
  const updated = await db.user.update({
    where: {
      id: userId,
    },
    data: {
      phoneOptOutAt: paused ? new Date() : null,
      phoneOptInAt: paused ? undefined : new Date(),
    },
    select: {
      id: true,
      phone: true,
      phoneOptInAt: true,
      phoneOptOutAt: true,
    },
  });

  return {
    phone: updated.phone || null,
    phoneOptInAt: updated.phoneOptInAt || null,
    phoneOptOutAt: updated.phoneOptOutAt || null,
    whatsappPaused: !!updated.phoneOptOutAt,
    whatsappAvailable: !!updated.phone,
  };
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
        "O canal de notificação no sistema não está ativo para este alerta.",
    };
  }

  if (field === "emailEnabled") {
    return {
      ok: isChannelActiveNow(eventConfig.enabledChannels, "EMAIL"),
      error:
        "O canal de e-mail ainda não está ativo para este alerta.",
    };
  }

  if (field === "whatsappEnabled") {
    return {
      ok: isChannelActiveNow(eventConfig.enabledChannels, "WHATSAPP"),
      error:
        "O canal de WhatsApp ainda não está ativo para este alerta.",
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
   - preferências salvas no banco;
   - perfil ativo do usuário.

   Assim a tela recebe apenas eventos compatíveis com o perfil ativo.
   ========================================================= */

async function buildPreferencesResponse(user: EffectiveUser) {
  await ensureBaseNotificationPreferencesForUser(user.id);

  const events = listNotificationEvents();
  const preferences = await listUserNotificationPreferences(user.id);

  const preferenceMap = new Map(
    preferences.map((preference) => [preference.eventType, preference])
  );

  const items = events
    .filter((event) => event.userPreferenceEnabled)
    .filter((event) => canShowPreferenceForRole(user, event.type))
    .map((event) => {
      const preference = preferenceMap.get(event.type) as any;

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
            : whatsappActiveNow,

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
    const contextUser = await getNotificationPreferencesContextUser();

    if (!contextUser.ok) {
      return NextResponse.json(
        {
          error: contextUser.error,
          user: userPayload(contextUser.user),
        },
        { status: contextUser.status }
      );
    }

    const preferences = await buildPreferencesResponse(contextUser.user);

    if (preferences.length === 0) {
      return NextResponse.json(
        {
          error:
            "Este perfil de acesso não possui preferências de notificação configuráveis.",
          user: userPayload(contextUser.user),
        },
        { status: 403 }
      );
    }

    const whatsappAccount = await getWhatsAppAccount(contextUser.user.id);

    return NextResponse.json({
      user: userPayload(contextUser.user),
      preferences,
      whatsappAccount,
    });
  } catch (error: unknown) {
    console.error("ERRO AO LISTAR PREFERÊNCIAS DE NOTIFICAÇÃO:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
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
    const contextUser = await getNotificationPreferencesContextUser();

    if (!contextUser.ok) {
      return NextResponse.json(
        {
          error: contextUser.error,
          user: userPayload(contextUser.user),
        },
        { status: contextUser.status }
      );
    }

    const user = contextUser.user;
    const body = await req.json();

    const action = normalizeEventType(body?.action);

    if (action === "PAUSE_WHATSAPP" || action === "RESUME_WHATSAPP") {
      const whatsappAccount = await updateWhatsAppAccountOptOut({
        userId: user.id,
        paused: action === "PAUSE_WHATSAPP",
      });

      const preferences = await buildPreferencesResponse(user);

      return NextResponse.json({
        success: true,
        message:
          action === "PAUSE_WHATSAPP"
            ? "WhatsApp pausado para sua conta."
            : "WhatsApp reativado para sua conta.",
        user: userPayload(user),
        preferences,
        whatsappAccount,
      });
    }

    const eventType = normalizeEventType(body?.eventType);

    if (!eventType) {
      return NextResponse.json(
        { error: "Tipo de alerta não informado." },
        { status: 400 }
      );
    }

    const eventConfig = getNotificationEventConfig(eventType);

    if (!eventConfig.userPreferenceEnabled) {
      return NextResponse.json(
        { error: "Este alerta não permite configuração pelo usuário." },
        { status: 400 }
      );
    }

    if (!canShowPreferenceForRole(user, eventConfig.type)) {
      return NextResponse.json(
        {
          error:
            "Este alerta não está disponível para o perfil ativo do usuário.",
        },
        { status: 403 }
      );
    }



    /* =========================================================
       ATUALIZAÇÃO DOS CANAIS

       Aceitamos somente boolean quando enviado.
       Campo omitido mantém valor atual.

       Segurança:
       - Só permite alterar um canal se ele estiver ativo agora
         em enabledChannels.
       - Isso bloqueia WhatsApp em eventos ainda não liberados.
       - Isso também impede alteração manual de evento fora do perfil.
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

    const preferences = await buildPreferencesResponse(user);
    const whatsappAccount = await getWhatsAppAccount(user.id);

    return NextResponse.json({
      success: true,
      message: "Preferência atualizada com sucesso.",
      updatedPreference,
      preferences,
      whatsappAccount,
    });
  } catch (error: unknown) {
    console.error("ERRO AO ATUALIZAR PREFERÊNCIA DE NOTIFICAÇÃO:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
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