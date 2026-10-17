import { findMccInDescription } from "./mcc";

// O banco escreve "Card Purchase Fxreplay 5817 Oklahoma City OK 73103
// 9889": tipo da operação, nome do estabelecimento cortado, código da
// categoria do cartão, cidade, CEP e o final do cartão. Pra quem lê a
// lista, só "Fxreplay" importa.
//
// Esta função tira o nome legível desse texto. O texto original NUNCA
// se perde: vai junto com o lançamento (`bank_description`) e é dele que
// sai a impressão digital que evita importar a mesma linha duas vezes —
// então renomear um lançamento não quebra a detecção de duplicata.
//
// Na dúvida, devolve o texto do banco como veio: um nome feio é melhor
// que um nome errado.

// Operações que trazem o estabelecimento logo depois.
const PURCHASE_PREFIXES = [
  /^recurring card transaction\s+/i,
  /^card purchase return\s+/i,
  /^card purchase\s+/i,
  /^pin purchase return\s+/i,
  /^pin purchase\s+/i,
  /^debit card purchase\s+/i,
  /^pos purchase\s+/i,
  /^card refund\s+/i,
  /^compra\s+/i, // Nomad: "Compra PUBLIX #2022"
];

// Intermediários de pagamento que aparecem antes do nome da loja.
const PROCESSOR_PREFIXES = [
  /^dd\s*\*\s*/i, // DoorDash
  /^sp\s+/i, // Shopify
  /^sq\s*\*\s*/i, // Square
  /^tst\s*\*\s*/i, // Toast
  /^pp\s*\*\s*/i, // PayPal
  /^paypal\s*\*\s*/i,
  /^py\s*\*\s*/i,
];

// Nomes conhecidos que o banco abrevia ou corta. A chave é o começo do
// nome já limpo, em minúsculas.
const KNOWN_NAMES: Array<[RegExp, string]> = [
  [/^facebk\b|^facebook\b|^meta\s*pay/i, "Facebook"],
  [/^amzn\b|^amazon\b/i, "Amazon"],
  [/^doordash/i, "DoorDash"],
  [/^wal-?mart\b|^walmart\b|^wm supercenter\b/i, "Walmart"],
  [/^publix\b/i, "Publix"],
  [/^google workspac/i, "Google Workspace"],
  [/^google \*?youtube/i, "YouTube"],
  [/^netflix\b/i, "Netflix"],
  [/^spotify\b/i, "Spotify"],
  [/^uber\s*\*?\s*eats/i, "Uber Eats"],
  [/^uber\b/i, "Uber"],
  [/^lyft\b/i, "Lyft"],
  [/^apple\.com|^apple\b/i, "Apple"],
  [/^target\b/i, "Target"],
  [/^costco\b/i, "Costco"],
  [/^starbucks\b/i, "Starbucks"],
  [/^mcdonald/i, "McDonald's"],
  [/^chick-?fil-?a/i, "Chick-fil-A"],
  [/^stltones/i, "STL Tones"],
  [/^murphy\s*\d*\s*at\s*walmrt|^murphy usa/i, "Murphy USA"],
];

/** Palavras com a primeira letra maiúscula, sem mexer em siglas (LLC, AI). */
function tidyCase(text: string): string {
  return text
    .split(" ")
    .map((word) => {
      if (word.length <= 3 && word === word.toUpperCase()) return word;
      if (word === word.toLowerCase() || word === word.toUpperCase()) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word;
    })
    .join(" ");
}

/** "Netflix.Com" → "Netflix", "Amazon.Com*5r1d" → "Amazon", "#1220" some. */
function cleanMerchant(text: string): string {
  let name = text.trim();

  for (const prefix of PROCESSOR_PREFIXES) name = name.replace(prefix, "");

  // "UBER * EATS": o asterisco aqui separa o nome, não um código.
  if (/^uber\s*\*?\s*eats/i.test(name)) return "Uber Eats";
  // Código de pedido depois de asterisco: "Facebk *Y6vpa76".
  name = name.replace(/\s*\*.*$/, "");
  // Número de loja: "Wal-Mart #1220", "Speedway 43431".
  name = name.replace(/\s*#\s*\w+/g, "");
  name = name.replace(/\s+\d{3,}\b/g, "");
  // Referência colada ao fim: "Scribd R692483000", "Godaddy#41854".
  name = name.replace(/\s+[a-z]{1,2}\d{6,}\w*$/i, "");
  // Letra solta que sobrou no fim ("Macy's 811 8001 S").
  name = name.replace(/\s+[a-z]$/i, "");
  // Domínio: "Netflix.Com" → "Netflix".
  name = name.replace(/\.(com|net|org|io|co|us)\b/gi, "");
  // Sobras no fim: hífen, barra, ponto.
  name = name.replace(/[\s\-/.,]+$/, "").replace(/\s+/g, " ").trim();

  for (const [pattern, known] of KNOWN_NAMES) {
    if (pattern.test(name)) return known;
  }
  return tidyCase(name);
}

/** Corta tudo a partir do código da categoria do cartão (MCC). */
function beforeMcc(text: string): string {
  const mcc = findMccInDescription(text);
  if (!mcc) return text;
  const index = text.search(new RegExp(`(^|\\s)${mcc}(\\s|$)`));
  return index > 0 ? text.slice(0, index) : text;
}

export function cleanBankDescription(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return raw;

  // Zelle: o que importa é com quem. "Zelle Credit From Aj Sushi LLC Ref#
  // 626000f02gxg" → "Zelle · Aj Sushi LLC".
  const zelle = text.match(/^zelle\s+(?:credit|debit|payment)?\s*(?:from|to)\s+(.+?)(?:\s+ref\s*#.*)?$/i);
  if (zelle) return `Zelle · ${tidyCase(zelle[1].trim())}`;

  if (/^paid overdraft item fee/i.test(text)) return "Taxa de saldo negativo";
  if (/^overdraft protection/i.test(text)) return "Proteção de saldo negativo";
  if (/^returned item fee/i.test(text)) return "Taxa de item devolvido";
  if (/^monthly (service|maintenance) fee/i.test(text)) return "Tarifa mensal";

  const intlFee = text.match(/^international service assessment\s+(.+)$/i);
  if (intlFee) return `Taxa internacional · ${cleanMerchant(beforeMcc(intlFee[1]))}`;

  for (const prefix of PURCHASE_PREFIXES) {
    if (prefix.test(text)) {
      const merchant = cleanMerchant(beforeMcc(text.replace(prefix, "")));
      return merchant || text;
    }
  }

  // Formato desconhecido: só tira números longos soltos no fim
  // (referências), que nunca são nome.
  const trimmed = text.replace(/(\s+\d{5,})+$/, "").trim();
  return trimmed || text;
}

const GENERIC =
  /^(zelle( credit| debit| payment)?|deposit|mobile deposit|atm( withdrawal)?|withdrawal|transfer|online transfer( (to|from))?|internal transfer|ach( credit| debit)?|check|cheque|payment|pix( enviado| recebido)?|ted|doc|pagamento|transferencia( enviada| recebida)?)$/;

/**
 * Texto do banco que não diz QUEM ("Zelle Credit", "Deposit", "Transfer"):
 * acontece muito em print do app, que corta o nome. Esses não ensinam
 * nome nem categoria — senão renomear um Zelle pra "Salário" faria todo
 * Zelle virar salário.
 */
export function isGenericBankText(raw: string): boolean {
  const key = cleanBankDescription(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return key === "" || GENERIC.test(key);
}
