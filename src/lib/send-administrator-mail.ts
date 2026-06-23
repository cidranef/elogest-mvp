import {
  sendMail,
  type SendMailInput,
  type SendMailResult,
} from "@/lib/mail";
import {
  getDemoAdministratorState,
  shouldSkipExternalDelivery,
} from "@/lib/demo-administrator";

/* =========================================================
   ELOGEST — ETAPA 57.4
   ENVIO DE E-MAIL POR ADMINISTRADORA

   Fluxos que conhecem administratorId devem usar este wrapper.
   A administradora demo não chama o provedor real.
   ========================================================= */

export type SendAdministratorMailInput = SendMailInput & {
  administratorId: string;
};

export async function sendAdministratorMail(
  input: SendAdministratorMailInput,
): Promise<SendMailResult> {
  const administrator = await getDemoAdministratorState(
    input.administratorId,
  );

  if (!administrator) {
    throw new Error("Administradora não encontrada para envio de e-mail.");
  }

  if (shouldSkipExternalDelivery(administrator)) {
    console.info(
      "[EloGest Mail] Envio externo ignorado para Administradora Demo.",
      {
        administratorId: input.administratorId,
        to: input.to,
        subject: input.subject,
      },
    );

    return {
      ok: true,
      skipped: true,
      messageId: "demo-mail-skipped",
    };
  }

  return sendMail({
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
}
