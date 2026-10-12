// Copia o worker do leitor de PDF pra /public, onde o navegador pode
// buscá-lo em /pdf.worker.mjs. Roda antes do build e antes do dev, em
// vez de versionar 2 MB de binário que sairiam de sincronia com o
// pacote na primeira atualização.
//
// O resolve é feito pelo caminho do módulo principal, e não por
// "pdf-parse/package.json": o pacote não expõe o package.json em
// "exports", então pedir por ele falha.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const entry = require.resolve("pdf-parse"); // .../dist/pdf-parse/cjs/index.cjs
const webDir = resolve(entry, "..", "..", "web");
const source = join(webDir, "pdf.worker.mjs");

mkdirSync("public", { recursive: true });
copyFileSync(source, join("public", "pdf.worker.mjs"));
console.log("pdf.worker.mjs copiado para public/");
