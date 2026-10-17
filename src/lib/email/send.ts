// Envio pelo Resend (https://resend.com/docs/api-reference/emails/send-email),
// direto pela API — sem SDK, é um POST só.
//
// Variáveis de ambiente (no Netlify):
//   RESEND_API_KEY   chave "Sending access" do Resend
//   EMAIL_FROM       opcional; padrão "Velun <ola@velunapp.com>"

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Link "parar de receber" (vira o cabeçalho List-Unsubscribe). */
  unsubscribeUrl?: string | null;
  /** Agrupa no painel do Resend (ex.: "weekly"). */
  tag?: string;
  /** Mesmo valor em 24h = o Resend não manda de novo. */
  idempotencyKey?: string;
};

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function emailFrom(): string {
  return process.env.EMAIL_FROM || "Velun <ola@velunapp.com>";
}

export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY não configurada." };

  const headers: Record<string, string> = {};
  if (email.unsubscribeUrl) {
    // Gmail e Yahoo mostram "Cancelar inscrição" ao lado do remetente e
    // mandam um POST pra esse endereço (RFC 8058).
    headers["List-Unsubscribe"] = `<${email.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: emailFrom(),
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers,
        tags: email.tag ? [{ name: "tipo", value: email.tag }] : undefined,
      }),
    });
    const data = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!res.ok) return { ok: false, error: data?.message ?? `Resend respondeu ${res.status}` };
    return { ok: true, id: data?.id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
