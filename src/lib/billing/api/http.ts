import { NextResponse } from "next/server";

import {
  ActiveSubscriptionAlreadyExistsError,
  InvalidSubscriptionOperationError,
  SubscriptionNotFoundError,
} from "@/lib/billing/subscriptions";
import { BillingSuperAdminAuthorizationError } from "@/lib/billing/api/super-admin";

export function billingApiError(error: unknown) {
  if (error instanceof BillingSuperAdminAuthorizationError) {
    return error.response;
  }

  console.error("[billing-api]", error);

  if (error instanceof SubscriptionNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof ActiveSubscriptionAlreadyExistsError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof InvalidSubscriptionOperationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "O corpo da requisição não contém um JSON válido." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { error: "Não foi possível concluir a operação de cobrança." },
    { status: 500 },
  );
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidSubscriptionOperationError(
      `O campo ${field} é obrigatório.`,
    );
  }

  return value.trim();
}

export function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new InvalidSubscriptionOperationError("Valor textual inválido.");
  }
  return value.trim();
}

export function optionalInteger(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) {
    throw new InvalidSubscriptionOperationError(
      `O campo ${field} deve ser um número inteiro.`,
    );
  }
  return parsed;
}

export function requireInteger(value: unknown, field: string): number {
  const parsed = optionalInteger(value, field);
  if (parsed === undefined) {
    throw new InvalidSubscriptionOperationError(
      `O campo ${field} é obrigatório.`,
    );
  }
  return parsed;
}

export function optionalDate(
  value: unknown,
  field: string,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new InvalidSubscriptionOperationError(
      `O campo ${field} contém uma data inválida.`,
    );
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidSubscriptionOperationError(
      `O campo ${field} contém uma data inválida.`,
    );
  }
  return parsed;
}

export function requireDate(value: unknown, field: string): Date {
  const parsed = optionalDate(value, field);
  if (!(parsed instanceof Date)) {
    throw new InvalidSubscriptionOperationError(
      `O campo ${field} é obrigatório.`,
    );
  }
  return parsed;
}

export function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new InvalidSubscriptionOperationError("Valor booleano inválido.");
  }
  return value;
}
