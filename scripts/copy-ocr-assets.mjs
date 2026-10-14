// Copia o leitor de recibos (tesseract.js) pra /public/ocr: o script do
// worker, o núcleo em WebAssembly e o vocabulário em inglês e português.
// Servidos pelo próprio Velun, e não por um CDN de fora: a leitura roda
// inteira no navegador sem depender de terceiros. Roda antes do build e
// do dev, como o worker do PDF, pra não versionar ~15 MB de binário.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = (name, file) => dirname(require.resolve(`${name}/${file}`));

const out = join("public", "ocr");
mkdirSync(join(out, "core"), { recursive: true });
mkdirSync(join(out, "lang"), { recursive: true });

// Worker do tesseract.js.
const tess = join(pkgDir("tesseract.js", "package.json"), "dist");
copyFileSync(join(tess, "worker.min.js"), join(out, "worker.min.js"));

// Núcleo: as variantes LSTM (o worker escolhe a que o navegador suporta).
const core = pkgDir("tesseract.js-core", "package.json");
for (const f of readdirSync(core)) {
  if (/^tesseract-core.*lstm\.wasm\.js$/.test(f)) copyFileSync(join(core, f), join(out, "core", f));
}

// Vocabulário: a versão "best_int" (menor e boa pra recibo).
for (const lang of ["eng", "por"]) {
  const dir = join(pkgDir(`@tesseract.js-data/${lang}`, "package.json"), "4.0.0_best_int");
  const file = `${lang}.traineddata.gz`;
  if (!existsSync(join(dir, file))) throw new Error(`faltou ${file}`);
  copyFileSync(join(dir, file), join(out, "lang", file));
}
console.log("leitor de recibos copiado para public/ocr/");
