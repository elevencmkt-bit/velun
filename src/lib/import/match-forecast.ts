// Cruzamento entre o extrato e as previsões já lançadas.
//
// Uma recorrência cadastrada grava os próximos lançamentos como
// `pending`: uma previsão do que vai acontecer. Quando o extrato chega,
// o banco diz o que aconteceu de verdade. Os dois descrevem o mesmo
// dinheiro, e somar os dois infla o mês inteiro.
//
// O cruzamento por impressão digital não resolve isso, porque ela inclui
// a descrição: "Sylaris Monthly" e "Zelle Credit From Sylaris, LLC" são
// textos diferentes. Ela serve pra impedir importar o mesmo extrato duas
// vezes, que é outro problema.
//
// Então o casamento aqui é por conta + direção + valor + proximidade de
// data, e nunca por texto.

export type ForecastCandidate = {
  id: string;
  date: string;
  amountCents: number;
  direction: "in" | "out";
  /** Intervalo da recorrência que gerou a previsão. */
  frequency: "weekly" | "monthly" | "yearly";
};

export type MatchInput = {
  date: string;
  amountCents: number;
  direction: "in" | "out";
};

function daysApart(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  return Math.abs(Math.round(ms / 86_400_000));
}

/**
 * Janela de dias aceitável entre a previsão e o lançamento real.
 *
 * Precisa ser menor que metade do intervalo da recorrência, senão uma
 * previsão casa com a ocorrência da semana errada. Semanal com janela de
 * 5 dias alcançaria a semana vizinha; com 3, não.
 *
 * O preço é previsão que erra a data por mais que isso não ser sugerida.
 * Isso é o certo: o cruzamento aqui é para o caso óbvio, e caso duvidoso
 * tem que chegar na revisão como não cruzado em vez de cruzado errado —
 * juntar errado funde dois lançamentos e perde um.
 */
function windowDays(frequency: ForecastCandidate["frequency"]): number {
  return frequency === "weekly" ? 3 : 5;
}

/**
 * Escolhe a previsão que esta linha do extrato quita, ou null.
 *
 * O valor tem que ser exato. Valor aproximado convida junção errada, e
 * previsão cujo valor real veio diferente (ou que foi paga em duas
 * transferências) deve aparecer na revisão como previsão sem par, pra
 * quem revisa decidir — não como junção que o sistema inventou.
 *
 * `taken` são as previsões já casadas com outra linha deste mesmo
 * extrato: uma previsão quita uma linha só. Sem isso, duas compras
 * iguais no mês casariam as duas com a mesma previsão.
 */
export function matchForecast(
  row: MatchInput,
  candidates: ForecastCandidate[],
  taken: Set<string>,
): ForecastCandidate | null {
  let best: ForecastCandidate | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (taken.has(candidate.id)) continue;
    if (candidate.direction !== row.direction) continue;
    if (candidate.amountCents !== row.amountCents) continue;

    const distance = daysApart(candidate.date, row.date);
    if (distance > windowDays(candidate.frequency)) continue;

    // Empate em distância fica com o primeiro: a lista chega ordenada
    // por data, então o resultado é estável.
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}
