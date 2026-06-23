import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/* =========================================================
   ELOGEST — ETAPA 57.4
   PROTEÇÕES DA ADMINISTRADORA DEMO

   Fonte central para:
   - identificar administradoras demo;
   - bloquear comunicações externas;
   - bloquear ações estruturais;
   - impedir decisões por nome, e-mail ou ID fixo.
   ========================================================= */

export type DemoAdministratorState = {
  id: string;
  isDemo: boolean;
  demoProtectionEnabled: boolean;
};

export type DemoProtectedOperation =
  | "DELETE_ADMINISTRATOR"
  | "DEACTIVATE_ADMINISTRATOR"
  | "CHANGE_PLAN"
  | "DELETE_CONDOMINIUM"
  | "DELETE_UNIT"
  | "DELETE_CORE_USER"
  | "CHANGE_DEMO_EMAIL"
  | "EXTERNAL_EMAIL"
  | "EXTERNAL_WHATSAPP"
  | "EXTERNAL_PAYMENT"
  | "EXTERNAL_WEBHOOK";

const STRUCTURAL_OPERATIONS = new Set<DemoProtectedOperation>([
  "DELETE_ADMINISTRATOR",
  "DEACTIVATE_ADMINISTRATOR",
  "CHANGE_PLAN",
  "DELETE_CONDOMINIUM",
  "DELETE_UNIT",
  "DELETE_CORE_USER",
  "CHANGE_DEMO_EMAIL",
]);

const EXTERNAL_OPERATIONS = new Set<DemoProtectedOperation>([
  "EXTERNAL_EMAIL",
  "EXTERNAL_WHATSAPP",
  "EXTERNAL_PAYMENT",
  "EXTERNAL_WEBHOOK",
]);

export async function getDemoAdministratorState(
  administratorId: string,
): Promise<DemoAdministratorState | null> {
  const normalizedId = String(administratorId || "").trim();

  if (!normalizedId) return null;

  return db.administrator.findUnique({
    where: { id: normalizedId },
    select: {
      id: true,
      isDemo: true,
      demoProtectionEnabled: true,
    },
  });
}

export function isDemoOperationAllowed({
  administrator,
  operation,
}: {
  administrator: DemoAdministratorState;
  operation: DemoProtectedOperation;
}) {
  if (!administrator.isDemo) return true;

  if (EXTERNAL_OPERATIONS.has(operation)) {
    return false;
  }

  if (
    administrator.demoProtectionEnabled &&
    STRUCTURAL_OPERATIONS.has(operation)
  ) {
    return false;
  }

  return true;
}

export async function canAdministratorPerformOperation({
  administratorId,
  operation,
}: {
  administratorId: string;
  operation: DemoProtectedOperation;
}) {
  const administrator = await getDemoAdministratorState(administratorId);

  if (!administrator) return false;

  return isDemoOperationAllowed({ administrator, operation });
}

export function demoOperationBlockedResponse(
  operation: DemoProtectedOperation,
) {
  return NextResponse.json(
    {
      error:
        "Esta ação está bloqueada para preservar a Administradora Demo.",
      code: "DEMO_OPERATION_BLOCKED",
      operation,
    },
    { status: 403 },
  );
}

export async function requireDemoOperationAllowed({
  administratorId,
  operation,
}: {
  administratorId: string;
  operation: DemoProtectedOperation;
}) {
  const administrator = await getDemoAdministratorState(administratorId);

  if (!administrator) {
    return {
      allowed: false as const,
      error: NextResponse.json(
        {
          error: "Administradora não encontrada.",
          code: "ADMINISTRATOR_NOT_FOUND",
        },
        { status: 404 },
      ),
    };
  }

  const allowed = isDemoOperationAllowed({
    administrator,
    operation,
  });

  if (!allowed) {
    return {
      allowed: false as const,
      error: demoOperationBlockedResponse(operation),
    };
  }

  return {
    allowed: true as const,
    administrator,
  };
}

export function shouldSkipExternalDelivery(
  administrator: DemoAdministratorState,
) {
  return administrator.isDemo;
}

export function isStructuralDemoProtectionEnabled(
  administrator: DemoAdministratorState,
) {
  return administrator.isDemo && administrator.demoProtectionEnabled;
}
