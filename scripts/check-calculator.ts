// Rodar: npx tsx scripts/check-calculator.ts
import assert from "node:assert/strict";
import { EMPTY, evaluate, formatTokens, press, type CalcState, type Key } from "../src/lib/calculator";

const run = (keys: Key[], start: CalcState = EMPTY) => keys.reduce(press, start);
const res = (keys: Key[]) => run(keys).result;

assert.equal(res(["1", "2", "+", "3", "="]), "15");
assert.equal(res(["2", "+", "3", "×", "4", "="]), "14", "× antes de +");
assert.equal(res(["1", "0", "÷", "4", "="]), "2.5");
assert.equal(res(["0", ".", "1", "+", "0", ".", "2", "="]), "0.3", "sem lixo de ponto flutuante");
assert.equal(res(["5", "÷", "0", "="]), "Erro");
assert.equal(run(["5", "÷", "0", "=", "3"]).tokens.join(""), "3", "depois do erro, recomeça");
assert.equal(res(["2", "0", "0", "+", "1", "0", "%", "="]), "220", "200 + 10% = 220");
assert.equal(res(["5", "0", "%", "="]), "0.5");
assert.equal(res(["8", "±", "+", "3", "="]), "-5");
assert.deepEqual(run(["1", "+", "×"]).tokens, ["1", "×"], "troca a operação");
assert.deepEqual(run(["1", "2", "⌫"]).tokens, ["1"]);
assert.deepEqual(run([".", "5"]).tokens, ["0.5"]);
assert.equal(res(["2", "=", "×", "3", "="]), "6", "continua do resultado");
assert.deepEqual(run(["2", "=", "7"]).tokens, ["7"], "número depois do = começa de novo");
assert.equal(evaluate(["3", "+"]), 3, "operação solta no fim é ignorada");
assert.equal(formatTokens(["1200", "+", "35.5", "×"]), "1,200 + 35.5 ×");
assert.equal(formatTokens(["-8"]), "−8");
console.log("check-calculator: ok");
