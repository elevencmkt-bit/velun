// Reconhecimento de texto em imagem, no navegador (tesseract.js). Usado
// pelo "Ler recibo ou print" e pela importação de prints. Nada sai do
// aparelho: o leitor e o vocabulário vêm do próprio Velun (public/ocr).

import type { OcrScreen, OcrWord } from "@/lib/import/screenshot";

type Worker = Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;

let workerPromise: Promise<Worker> | null = null;
let onProgress: ((pct: number) => void) | null = null;

/** Um leitor só por aba, criado na primeira leitura. */
function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = import("tesseract.js")
      .then(({ createWorker }) =>
        createWorker(["eng", "por"], 1, {
          workerPath: "/ocr/worker.min.js",
          corePath: "/ocr/core",
          langPath: "/ocr/lang",
          gzip: true,
          logger: (m: { status: string; progress: number }) => {
            if (m.status === "recognizing text") onProgress?.(Math.round(m.progress * 100));
          },
        }),
      )
      .catch((err) => {
        workerPromise = null;
        throw err;
      });
  }
  return workerPromise;
}

/**
 * Print de app: cinza, contraste esticado e preto-e-branco. Na lista do
 * banco isso tira o "verde de entrada" e o cinza do saldo do caminho e
 * melhora muito a leitura de "-$" e dos centavos.
 */
async function binarize(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  let min = 255;
  let max = 0;
  const gray = new Uint8ClampedArray(px.length / 4);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    gray[j] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const span = Math.max(1, max - min);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const v = ((gray[j] - min) * 255) / span < 170 ? 0 : 255;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Texto corrido da imagem (recibo). */
export async function recognizeText(file: File, progress?: (pct: number) => void): Promise<string> {
  const worker = await getWorker();
  onProgress = progress ?? null;
  try {
    const { data } = await worker.recognize(file);
    return data.text ?? "";
  } finally {
    onProgress = null;
  }
}

/** Palavras com posição (lista de lançamentos de um print). */
export async function recognizeScreen(file: File, progress?: (pct: number) => void): Promise<OcrScreen> {
  const worker = await getWorker();
  const canvas = await binarize(file);
  onProgress = progress ?? null;
  try {
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    const words: OcrWord[] = [];
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          for (const w of line.words) {
            words.push({
              text: w.text,
              confidence: Math.round(w.confidence),
              x0: w.bbox.x0,
              y0: w.bbox.y0,
              x1: w.bbox.x1,
              y1: w.bbox.y1,
            });
          }
        }
      }
    }
    return { width: canvas.width, height: canvas.height, words };
  } finally {
    onProgress = null;
  }
}
