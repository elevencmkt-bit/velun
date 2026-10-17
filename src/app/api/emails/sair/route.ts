import { NextResponse, type NextRequest } from "next/server";
import { unsubscribeByToken } from "@/lib/email/unsubscribe";

// Link "parar de receber" dos e-mails.
//
// GET: abre a página que pergunta antes (antivírus de e-mail e prévias de
// link abrem endereços sozinhos — não dá pra desligar só por um GET).
// POST: o "Cancelar inscrição" do Gmail/Yahoo (RFC 8058), um clique só.

export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/emails/sair";
  return NextResponse.redirect(url);
}

export async function POST(request: NextRequest) {
  const t = request.nextUrl.searchParams.get("t") ?? "";
  const k = request.nextUrl.searchParams.get("k") ?? "";
  const ok = await unsubscribeByToken(t, k);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
