// Cruzamento entre o extrato e lançamentos que o usuário já CONFIRMOU.
//
// Previsão (`pending`) é palpite, e o extrato a substitui sem cerimônia —
// isso é `match-forecast.ts`. Aqui é diferente: um lançamento confirmado
// à mão é algo que o usuário afirmou que aconteceu. Se o extrato traz o
// mesmo dinheiro com outro nome ("Netflix" digitado vs "PIN Purchase
// Netflix.Com 4899 Los Gatos"), o mês conta duas vezes — mas apontar a
// junção errada apagaria um lançamento verdadeiro.
//
// Por isso dois níveis:
//
// 1. Par único: um lançamento confirmado e uma linha do extrato com o
//    mesmo valor e direção, e nenhum outro de cada lado, com datas
//    próximas. Vira sugestão de junção na linha, DESMARCADA — junta só
//    se quem revisa pedir.
//
// 2. Ambíguo: o valor aparece mais de uma vez de algum lado, ou as datas
//    estão longe. Não dá pra apontar qual linha é qual, então não há
//    junção: a tela só avisa que o lançamento pode estar em dobro.
//
// O que fica de fora de propósito: pagamento que o banco dividiu em
// duas transferências (Will Business: $1.600 lançados contra $500 +
// $1.121,58 no extrato). Casar isso exige somar combinações de linhas,
// e errar nessa conta é pior que o trabalho de apagar à mão.

export type ConfirmedCandidate = {
  id: string;
  date: string;
  amountCents: number;
  direction: "in" | "out";
  fingerprint: string;
};

export type StatementLine = {
  date: string;
  amountCents: number;
  direction: "in" | "out";
  fingerprint: string;
  /**
   * Linha ainda livre: não é duplicata e não quitou nenhuma previsão.
   * Só linha livre entra no par único.
   */
  free: boolean;
};

/**
 * Até quantos dias de distância um par único vira sugestão de junção.
 *
 * Maior que a janela das previsões (5) porque a data de um lançamento
 * digitado à mão é a lembrança de quem digitou, não a data de
 * compensação do banco. Além disso o par já é único no valor, o que
 * reduz muito a chance de coincidência.
 */
export const CONFIRMED_WINDOW_DAYS = 7;

function daysApart(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  return Math.abs(Math.round(ms / 86_400_000));
}

const keyOf = (x: { direction: string; amountCents: number }) => `${x.direction}|${x.amountCents}`;

/**
 * Candidatos que valem a pena olhar: tira os que o extrato já trouxe com
 * a MESMA impressão digital. Esses já foram marcados como duplicata na
 * revisão — são o mesmo dinheiro com o mesmo nome — e oferecer de novo
 * casaria uma linha nova com um lançamento que já tem par.
 */
export function relevantCandidates<T extends ConfirmedCandidate>(
  lines: StatementLine[],
  candidates: T[],
): T[] {
  const statementFingerprints = new Set(lines.map((l) => l.fingerprint));
  return candidates.filter((c) => !statementFingerprints.has(c.fingerprint));
}

/**
 * Nível 1: pares únicos. Devolve índice da linha do extrato → id do
 * lançamento confirmado.
 */
export function matchConfirmed(
  lines: StatementLine[],
  candidates: ConfirmedCandidate[],
): Map<number, string> {
  const relevant = relevantCandidates(lines, candidates);

  const linesByKey = new Map<string, number[]>();
  lines.forEach((line, index) => {
    if (!line.free) return;
    const list = linesByKey.get(keyOf(line)) ?? [];
    list.push(index);
    linesByKey.set(keyOf(line), list);
  });

  const candidatesByKey = new Map<string, ConfirmedCandidate[]>();
  for (const c of relevant) {
    const list = candidatesByKey.get(keyOf(c)) ?? [];
    list.push(c);
    candidatesByKey.set(keyOf(c), list);
  }

  const result = new Map<number, string>();
  for (const [key, lineIndexes] of linesByKey) {
    const cands = candidatesByKey.get(key) ?? [];
    if (lineIndexes.length !== 1 || cands.length !== 1) continue;

    const line = lines[lineIndexes[0]];
    if (daysApart(line.date, cands[0].date) > CONFIRMED_WINDOW_DAYS) continue;

    result.set(lineIndexes[0], cands[0].id);
  }
  return result;
}

export type PossibleDouble<T extends ConfirmedCandidate = ConfirmedCandidate> = {
  candidate: T;
  /** Datas das linhas do extrato com o mesmo valor e direção. */
  statementDates: string[];
};

/**
 * Nível 2: lançamentos confirmados que dividem valor e direção com
 * alguma linha do extrato mas não viraram par único. Só aviso.
 *
 * `paired` são os ids que já estão numa sugestão de junção (nível 1),
 * aceita ou não — esses aparecem na própria linha, não aqui.
 */
export function possibleDoubles<T extends ConfirmedCandidate>(
  lines: StatementLine[],
  candidates: T[],
  paired: Set<string>,
): PossibleDouble<T>[] {
  const datesByKey = new Map<string, string[]>();
  for (const line of lines) {
    const list = datesByKey.get(keyOf(line)) ?? [];
    list.push(line.date);
    datesByKey.set(keyOf(line), list);
  }

  return relevantCandidates(lines, candidates)
    .filter((c) => !paired.has(c.id) && datesByKey.has(keyOf(c)))
    .map((c) => ({ candidate: c, statementDates: [...datesByKey.get(keyOf(c))!].sort() }))
    .sort((a, b) => a.candidate.date.localeCompare(b.candidate.date));
}
