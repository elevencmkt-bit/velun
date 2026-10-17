// Onde baixar o arquivo, por banco. Curto e sem prometer nome de botão
// que o banco pode mudar amanhã: diz o caminho geral e qual formato
// escolher. O padrão vale pra qualquer banco.

type Tip = { bank: string | null; text: string };

const BY_BANK: { match: RegExp; bank: string; text: (isCard: boolean) => string }[] = [
  {
    match: /regions/i,
    bank: "Regions",
    text: () =>
      "No site da Regions (pelo computador), abra a conta e procure Download/Export. Escolha Quicken (QFX) — ou CSV/Excel. O extrato mensal em PDF continua valendo.",
  },
  {
    match: /chase/i,
    bank: "Chase",
    text: () => "No site da Chase, abra a conta ou o cartão e use o ícone de download. Escolha QFX (Quicken) ou CSV.",
  },
  {
    match: /bank of america|bofa/i,
    bank: "Bank of America",
    text: () => "No site do Bank of America, abra a conta e use Download. Escolha Quicken (QFX) ou Excel/CSV.",
  },
  {
    match: /wells/i,
    bank: "Wells Fargo",
    text: () => "No site do Wells Fargo, abra a conta e use Download Account Activity. Escolha Quicken (QFX) ou CSV.",
  },
  {
    match: /amex|american express/i,
    bank: "American Express",
    text: () => "No site da Amex, abra a fatura (Statements & Activity) e use Download. Escolha QFX ou CSV.",
  },
  {
    match: /capital one|discover|citi/i,
    bank: "",
    text: () => "No site do cartão, abra as transações e procure Download. Escolha QFX (Quicken) ou CSV.",
  },
  {
    match: /nubank|nu pagamentos/i,
    bank: "Nubank",
    text: (isCard) =>
      isCard
        ? "A fatura em PDF do Nubank o Velun já lê. Se o app oferecer exportar a fatura em CSV ou OFX, também serve."
        : "No app do Nubank, procure exportar o extrato da conta em OFX ou CSV (às vezes chega por e-mail).",
  },
  {
    match: /nomad/i,
    bank: "Nomad",
    text: () => "O extrato em PDF da Nomad o Velun já lê. Se o app oferecer CSV, também serve.",
  },
  {
    match: /ita[uú]|bradesco|santander|banco do brasil|\bbb\b|caixa|inter|c6|sicoob|sicredi|btg|xp/i,
    bank: "",
    text: () =>
      "No internet banking, abra o extrato, escolha o período e procure Exportar ou Salvar como. Prefira OFX (às vezes chamado de Money ou Quicken); senão, Excel ou CSV.",
  },
];

export function exportTip(institution: string | null, isCard: boolean): Tip {
  const hit = institution ? BY_BANK.find((b) => b.match.test(institution)) : undefined;
  if (hit) return { bank: hit.bank || institution, text: hit.text(isCard) };
  return {
    bank: null,
    text: isCard
      ? "No site do cartão, abra as transações ou a fatura e procure Download ou Exportar. Prefira OFX/QFX (Quicken); senão, CSV ou Excel."
      : "No site do banco, abra o extrato e procure Download ou Exportar. Prefira OFX/QFX (Quicken): já vem com data e sinal certinhos. Senão, CSV ou Excel.",
  };
}
