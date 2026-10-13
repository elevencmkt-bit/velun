// Calculadora do topo: a conta fica numa lista de pedaços (número,
// operação, número…). Sem eval: precedência normal (× e ÷ antes de + e −)
// e os centavos arredondados no fim, pra 0,1 + 0,2 dar 0,3.

export type Op = "+" | "−" | "×" | "÷";
export type CalcState = {
  /** ["12", "+", "3.5"] — números como texto, pra guardar o que se digitou. */
  tokens: string[];
  /** Resultado do último "=", mostrado até digitar de novo. */
  result: string | null;
};

export const EMPTY: CalcState = { tokens: [], result: null };

const OPS: Op[] = ["+", "−", "×", "÷"];
const isOp = (t: string | undefined): t is Op => !!t && (OPS as string[]).includes(t);

/** Arredonda pra tirar o lixo de ponto flutuante (0.30000000000000004). */
function clean(n: number): number {
  return Math.round(n * 1e10) / 1e10;
}

/** Calcula a lista; null quando não dá (divisão por zero, conta vazia). */
export function evaluate(tokens: string[]): number | null {
  const list = isOp(tokens[tokens.length - 1]) ? tokens.slice(0, -1) : tokens;
  if (list.length === 0) return null;
  // Primeiro × e ÷.
  const pass: (number | Op)[] = [];
  for (const t of list) {
    if (isOp(t)) {
      pass.push(t);
      continue;
    }
    const n = Number(t === "-" || t === "" ? "0" : t);
    if (!Number.isFinite(n)) return null;
    const prev = pass[pass.length - 1];
    if (prev === "×" || prev === "÷") {
      pass.pop();
      const left = pass.pop() as number;
      if (prev === "÷" && n === 0) return null;
      pass.push(prev === "×" ? left * n : left / n);
    } else {
      pass.push(n);
    }
  }
  // Depois + e −.
  let acc = pass[0] as number;
  for (let i = 1; i < pass.length; i += 2) {
    const op = pass[i] as Op;
    const n = pass[i + 1] as number;
    acc = op === "+" ? acc + n : acc - n;
  }
  return clean(acc);
}

/** Número pra mostrar: 1,234.5 (mesmo formato dos valores do app). */
export function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

/** Como a conta aparece em cima do resultado: "1,200 + 35.5 ×". */
export function formatTokens(tokens: string[]): string {
  return tokens
    .map((t) => {
      if (isOp(t)) return t;
      const [int, dec] = t.split(".");
      const sign = int.startsWith("-") ? "−" : "";
      const digits = int.replace("-", "");
      const grouped = digits ? Number(digits).toLocaleString("en-US") : "0";
      return sign + grouped + (dec !== undefined ? `.${dec}` : "");
    })
    .join(" ");
}

export type Key = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | Op | "=" | "C" | "⌫" | "%" | "±";

/** Aplica uma tecla e devolve o novo estado. */
export function press(state: CalcState, key: Key): CalcState {
  if (state.result === "Erro") state = EMPTY;
  let tokens = [...state.tokens];

  if (key === "C") return EMPTY;

  // Depois do "=": número começa conta nova; operação continua do resultado.
  if (state.result !== null) {
    if (/^[0-9.]$/.test(key)) tokens = [];
    else if (isOp(key) || key === "%" || key === "±") tokens = [state.result];
    else if (key === "⌫" || key === "=") return state;
  }
  const last = tokens[tokens.length - 1];

  if (/^[0-9]$/.test(key)) {
    if (last === undefined || isOp(last)) tokens.push(key);
    else if (last === "0") tokens[tokens.length - 1] = key;
    else if (last === "-0") tokens[tokens.length - 1] = `-${key}`;
    else if (last.replace(/[-.]/g, "").length < 15) tokens[tokens.length - 1] = last + key;
    return { tokens, result: null };
  }

  if (key === ".") {
    if (last === undefined || isOp(last)) tokens.push("0.");
    else if (!last.includes(".")) tokens[tokens.length - 1] = last + ".";
    return { tokens, result: null };
  }

  if (isOp(key)) {
    if (last === undefined) tokens.push("0", key);
    else if (isOp(last)) tokens[tokens.length - 1] = key;
    else tokens.push(key);
    return { tokens, result: null };
  }

  if (key === "⌫") {
    if (last === undefined) return state;
    if (isOp(last) || last.length <= 1 || last === "-0") tokens.pop();
    else {
      const next = last.slice(0, -1);
      if (next === "-") tokens.pop();
      else tokens[tokens.length - 1] = next;
    }
    return { tokens, result: null };
  }

  if (key === "±") {
    if (last === undefined || isOp(last)) return { tokens, result: null };
    tokens[tokens.length - 1] = last.startsWith("-") ? last.slice(1) : `-${last}`;
    return { tokens, result: null };
  }

  if (key === "%") {
    // "200 + 10%" vira 200 + 20 (10% de 200); sozinho, 10% vira 0.1.
    if (last === undefined || isOp(last)) return { tokens, result: null };
    const n = Number(last);
    const op = tokens[tokens.length - 2];
    const base = op === "+" || op === "−" ? evaluate(tokens.slice(0, -2)) : null;
    const value = base !== null ? (base * n) / 100 : n / 100;
    tokens[tokens.length - 1] = String(clean(value));
    return { tokens, result: null };
  }

  // "="
  const value = evaluate(tokens);
  if (value === null) return { tokens, result: tokens.length ? "Erro" : null };
  return { tokens, result: String(value) };
}

/** Tecla do teclado físico → tecla da calculadora. */
export function keyFromKeyboard(k: string): Key | null {
  if (/^[0-9]$/.test(k)) return k as Key;
  if (k === "." || k === ",") return ".";
  if (k === "+") return "+";
  if (k === "-") return "−";
  if (k === "*" || k === "x" || k === "X") return "×";
  if (k === "/") return "÷";
  if (k === "Enter" || k === "=") return "=";
  if (k === "Backspace") return "⌫";
  if (k === "Delete" || k === "c" || k === "C") return "C";
  if (k === "%") return "%";
  return null;
}
