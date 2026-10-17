// Função agendada do Netlify: de hora em hora, pede pro Velun mandar os
// e-mails que estiverem na hora (resumo da semana, fechamento do mês,
// avisos). Quem decide o que mandar é a rota /api/cron/emails; aqui só o
// relógio. Precisa de CRON_SECRET nas variáveis de ambiente do site.
//
// https://docs.netlify.com/functions/scheduled-functions/

export default async function emails() {
  const base = (process.env.URL ?? "https://velunapp.com").replace(/\/+$/, "");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[emails] CRON_SECRET não configurado");
    return;
  }
  const res = await fetch(`${base}/api/cron/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  console.log("[emails]", res.status, await res.text());
}

export const config = {
  schedule: "0 * * * *",
};
