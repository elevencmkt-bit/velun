import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runScheduledEmails } from "@/lib/email/run";
import { emailConfigured } from "@/lib/email/send";

// Chamada de hora em hora pela função agendada do Netlify
// (netlify/functions/emails.mts), com o segredo CRON_SECRET.
//
// POST            roda de verdade (manda e registra)
// GET ?dry=1      só mostra o que mandaria agora, sem mandar nem registrar
//
// A resposta de verdade traz só contagens: o log do Netlify não precisa
// ver assunto de e-mail (que tem valores).

export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 500 });
  if (!authorized(request)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  if (!emailConfigured()) return NextResponse.json({ error: "RESEND_API_KEY não configurada" }, { status: 500 });

  const report = await runScheduledEmails(createAdminClient());
  const count = (kind: string) => report.sent.filter((s) => s.kind === kind).length;
  return NextResponse.json({
    households: report.households,
    sent: { weekly: count("weekly"), monthly: count("monthly"), alerts: count("alerts") },
    skipped: report.skipped.length,
    errors: report.errors.map((e) => ({ kind: e.kind ?? null, error: e.error })),
  });
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  if (request.nextUrl.searchParams.get("dry") !== "1") {
    return NextResponse.json({ error: "use POST, ou GET ?dry=1 pra simular" }, { status: 405 });
  }
  const report = await runScheduledEmails(createAdminClient(), { dryRun: true });
  return NextResponse.json(report);
}
