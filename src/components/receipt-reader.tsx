"use client";

import { useRef, useState } from "react";
import { Camera, Info, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parseReceipt, type ReceiptGuess } from "@/lib/receipt-parse";

export type ReceiptRead = ReceiptGuess & {
  /** Miniatura pra mostrar no formulário (URL local, do próprio navegador). */
  previewUrl: string;
};

/**
 * "Ler recibo ou print": a pessoa escolhe uma imagem (ou tira a foto, no
 * celular), o navegador reconhece o texto e devolve total, data e loja.
 * Tudo no aparelho: a imagem não é enviada nem guardada.
 */
export function ReceiptReader({
  order,
  today,
  onRead,
}: {
  order: "mdy" | "dmy";
  today: string;
  onRead: (result: ReceiptRead) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function read(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Escolha uma imagem (foto ou print).");
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      // O leitor só é baixado na primeira vez que alguém usa.
      const { createWorker } = await import("tesseract.js");
      // Tudo servido pelo próprio Velun (public/ocr), sem CDN de fora.
      const worker = await createWorker(["eng", "por"], 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr/core",
        langPath: "/ocr/lang",
        gzip: true,
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") setProgress(Math.round(m.progress * 100));
        },
      });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      const guess = parseReceipt(data.text ?? "", { order, today });
      if (!guess.amountCents && !guess.date && !guess.merchant) {
        setError("Não consegui ler essa imagem. Tente um print ou uma foto mais nítida.");
        return;
      }
      onRead({ ...guess, previewUrl: URL.createObjectURL(file) });
    } catch {
      setError("Não consegui ler essa imagem agora. Tente de novo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[13px] border-[1.5px] border-dashed border-(--primary-border) bg-(--primary-soft) text-[14px] font-semibold text-(--primary) transition-colors hover:bg-(--primary-light) disabled:opacity-80"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Lendo a imagem{progress > 0 ? `… ${progress}%` : "…"}
            </>
          ) : (
            <>
              <Camera className="h-4 w-4" />
              Ler recibo ou print
            </>
          )}
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Como funciona a leitura"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--primary-soft) text-(--primary) hover:bg-(--primary-light)"
            >
              <Info className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="w-[min(330px,calc(100vw-32px))] p-4">
            <p className="text-[14px] font-bold text-(--text-primary)">Como funciona a leitura</p>
            <ul className="mt-2.5 flex flex-col gap-2 text-[13px] leading-relaxed text-(--text-body)">
              <li>
                Funciona melhor com <b>print de app</b> (Zelle, banco, e-mail) ou foto <b>nítida, reta e bem iluminada</b>.
              </li>
              <li>Recibo apagado, amassado ou torto pode sair com erro: confira antes de lançar.</li>
              <li>A imagem é lida no seu aparelho e não fica guardada.</li>
            </ul>
          </PopoverContent>
        </Popover>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void read(file);
        }}
      />
      {error ? (
        <p className="text-[13px] text-(--expense-dark)" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
