// Peças de HTML dos e-mails. E-mail não é página: Gmail, Outlook e o
// Mail do iPhone ignoram boa parte do CSS, então tudo é tabela com estilo
// inline, largura máxima de 600px e nada de fonte externa obrigatória.

export const C = {
  bg: "#F4F5F8",
  card: "#FFFFFF",
  text: "#111318",
  text2: "#344054",
  muted: "#475467",
  soft: "#667085",
  faint: "#98A2B3",
  line: "#F2F4F7",
  line2: "#EAECF0",
  primary: "#536DFE",
  primarySoft: "#F5F6FF",
  out: "#B42318",
  outSoft: "#FEF3F2",
  outText: "#912018",
  in: "#067647",
  inSoft: "#ECFDF3",
  inText: "#085D3A",
  warn: "#93370D",
  warnSoft: "#FFFAEB",
  warnLine: "#FEF0C7",
  warnStrong: "#B54708",
};

export const FONT =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Texto já escapado + trechos em negrito: b("Saldo ", ["$10"], ".") */
export function strong(text: string, color: string = C.text): string {
  return `<b style="color:${color};font-weight:700">${esc(text)}</b>`;
}

export function heading(text: string): string {
  return `<h1 style="margin:0;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-0.02em;color:${C.text}">${esc(text)}</h1>`;
}

/** Parágrafo; `html` já vem escapado (use esc/strong pra montar). */
export function paragraph(html: string, opts: { size?: number; color?: string; top?: number; align?: string } = {}): string {
  return `<p style="margin:${opts.top ?? 10}px 0 0;font-family:${FONT};font-size:${opts.size ?? 15}px;line-height:1.55;color:${opts.color ?? C.muted};text-align:${opts.align ?? "left"}">${html}</p>`;
}

export function sectionTitle(text: string, right?: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-family:${FONT};font-size:12px;font-weight:700;color:${C.text2};text-transform:uppercase;letter-spacing:.05em;padding:0 0 8px">${esc(text)}</td>
${right ? `<td align="right" style="font-family:${FONT};font-size:12px;color:${C.faint};padding:0 0 8px">${esc(right)}</td>` : ""}
</tr></table>`;
}

/** Bloco com espaçamento lateral do cartão. */
export function block(html: string, top = 22): string {
  return `<tr><td style="padding:${top}px 32px 0">${html}</td></tr>`;
}

export function button(label: string, href: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${C.primary}" style="border-radius:14px">
<a href="${esc(href)}" style="display:block;padding:15px 20px;font-family:${FONT};font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:14px">${esc(label)}</a>
</td></tr></table>`;
}

/** Caixa colorida (aviso, destaque). */
export function box(html: string, bg: string, padding = "14px 16px"): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${bg}" style="background:${bg};border-radius:14px;padding:${padding}">${html}</td></tr></table>`;
}

/** Três números lado a lado (Vai sair / Vai entrar / Domingo). */
export function stats(
  items: { label: string; value: string; color: string; bg: string; note?: string }[],
): string {
  const cells = items
    .map(
      (it, i) => `<td width="${Math.floor(100 / items.length)}%" valign="top" style="padding:0 ${i < items.length - 1 ? 8 : 0}px 0 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${it.bg}" style="background:${it.bg};border-radius:14px;padding:14px">
<div style="font-family:${FONT};font-size:12px;font-weight:600;color:${it.color === C.text ? C.muted : it.color}">${esc(it.label)}</div>
<div style="font-family:${FONT};font-size:19px;font-weight:800;color:${it.color};margin-top:4px;white-space:nowrap">${esc(it.value)}</div>
${it.note ? `<div style="font-family:${FONT};font-size:12px;color:${C.soft};margin-top:3px">${esc(it.note)}</div>` : ""}
</td></tr></table></td>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`;
}

/** Linha de lançamento: nome + detalhe à esquerda, valor à direita. */
export function itemRow(opts: {
  name: string;
  meta: string;
  metaColor?: string;
  amount: string;
  amountColor: string;
  lead?: string;
  border?: boolean;
}): string {
  const border = opts.border === false ? "" : `border-top:1px solid ${C.line};`;
  return `<tr>
${opts.lead !== undefined ? `<td width="44" valign="top" style="${border}padding:11px 0;font-family:${FONT}">${opts.lead}</td>` : ""}
<td valign="top" style="${border}padding:11px 10px 11px 0;font-family:${FONT}">
<div style="font-size:14px;font-weight:600;color:${C.text}">${esc(opts.name)}</div>
<div style="font-size:12px;color:${opts.metaColor ?? C.soft};margin-top:2px;${opts.metaColor ? "font-weight:600" : ""}">${esc(opts.meta)}</div>
</td>
<td align="right" valign="top" style="${border}padding:11px 0;font-family:${FONT};font-size:14px;font-weight:700;color:${opts.amountColor};white-space:nowrap">${esc(opts.amount)}</td>
</tr>`;
}

export function dayLead(day: number | null, weekday: string): string {
  if (day === null) return "";
  return `<div style="font-size:18px;font-weight:800;line-height:1;color:${C.text};text-align:center;width:36px">${day}</div><div style="font-size:11px;font-weight:600;color:${C.faint};text-transform:uppercase;margin-top:3px;text-align:center;width:36px">${esc(weekday)}</div>`;
}

export function table(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
}

/** Tabela com cabeçalho (conta por conta). */
export function grid(opts: {
  head: string[];
  rows: { cells: { html: string; color?: string; bold?: boolean }[]; note?: string }[];
  total?: { html: string; color?: string }[];
}): string {
  const widths = ["40%", "20%", "20%", "20%"];
  const th = opts.head
    .map(
      (h, i) =>
        `<td width="${widths[i] ?? "20%"}" ${i > 0 ? 'align="right"' : ""} style="font-family:${FONT};font-size:12px;font-weight:600;color:${C.faint};padding:0 0 8px">${esc(h)}</td>`,
    )
    .join("");
  const body = opts.rows
    .map((r) => {
      const tds = r.cells
        .map(
          (c, i) =>
            `<td ${i > 0 ? 'align="right"' : ""} valign="top" style="border-top:1px solid ${C.line};padding:11px 0;font-family:${FONT};font-size:14px;font-weight:${c.bold || i === 0 ? 700 : 600};color:${c.color ?? C.text};${i > 0 ? "white-space:nowrap;" : ""}">${c.html}${
              i === 0 && r.note
                ? `<div style="font-size:12px;font-weight:400;color:${C.soft};margin-top:2px">${esc(r.note)}</div>`
                : ""
            }</td>`,
        )
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");
  const total = opts.total
    ? `<tr>${opts.total
        .map(
          (c, i) =>
            `<td ${i > 0 ? 'align="right"' : ""} style="border-top:1.5px solid #E4E7EC;padding:11px 0 0;font-family:${FONT};font-size:14px;font-weight:800;color:${c.color ?? C.text};white-space:nowrap">${c.html}</td>`,
        )
        .join("")}</tr>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${th}</tr>${body}${total}</table>`;
}

/** Barra de progresso (categorias, metas). */
export function bar(fraction: number, color: string): string {
  const pct = Math.max(2, Math.min(100, Math.round(fraction * 100)));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.line}" style="background:${C.line};border-radius:99px;height:8px;line-height:8px;font-size:0">
<table role="presentation" width="${pct}%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${color}" style="background:${color};border-radius:99px;height:8px;line-height:8px;font-size:0">&nbsp;</td></tr></table>
</td></tr></table>`;
}

/**
 * O e-mail inteiro: fundo cinza, cartão branco com a marca e o cabeçalho,
 * os blocos e o rodapé fora do cartão.
 */
export function shell(opts: {
  title: string;
  /** Texto que aparece ao lado do assunto na caixa de entrada. */
  preheader: string;
  /** Texto pequeno à direita da marca (período, data). */
  tag?: string;
  /** Linhas <tr> do cartão (use block()). */
  body: string;
  /** HTML do rodapé (já escapado). */
  footer?: string;
  siteUrl: string;
}): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg}">${esc(opts.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg}">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td bgcolor="${C.card}" style="background:${C.card};border-radius:20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:26px 32px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="36" valign="middle"><a href="${esc(opts.siteUrl)}" style="text-decoration:none"><img src="${esc(opts.siteUrl)}/icon.png" width="28" height="28" alt="" style="display:block;border:0;border-radius:8px"></a></td>
<td valign="middle" style="font-family:${FONT};font-size:18px;font-weight:800;letter-spacing:-0.03em;color:${C.text}">velun</td>
${opts.tag ? `<td align="right" valign="middle" style="font-family:${FONT};font-size:12px;font-weight:600;color:${C.faint}">${esc(opts.tag)}</td>` : ""}
</tr></table>
</td></tr>
${opts.body}
<tr><td style="height:30px;line-height:30px;font-size:0">&nbsp;</td></tr>
</table>
</td></tr>
${
  opts.footer
    ? `<tr><td align="center" style="padding:20px 16px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.faint}">${opts.footer}</td></tr>`
    : ""
}
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function link(label: string, href: string): string {
  return `<a href="${esc(href)}" style="color:${C.primary};text-decoration:none">${esc(label)}</a>`;
}
