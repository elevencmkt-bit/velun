"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";

// Barra que só aparece na tela (some na impressão). Abre a janela de
// impressão sozinha quando o relatório chega pronto; dali é "Salvar como
// PDF". O PDF é feito pelo próprio navegador: os dados não passam por
// nenhum serviço de fora.
export function PrintToolbar({ autoPrint, backHref }: { autoPrint: boolean; backHref: string }) {
  useEffect(() => {
    if (!autoPrint) return;
    let cancelled = false;
    // Espera fontes e imagens (o logo) carregarem: imprimir antes deixa
    // o logo em branco no PDF.
    const t = setTimeout(async () => {
      await document.fonts?.ready;
      await Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map(
            (img) =>
              new Promise((resolve) => {
                img.addEventListener("load", resolve, { once: true });
                img.addEventListener("error", resolve, { once: true });
              }),
          ),
      );
      if (!cancelled) window.print();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [autoPrint]);

  return (
    <div className="sticky top-0 z-10 border-b border-[#E4E7EC] bg-white/90 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-[816px] flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link
          href={backHref}
          className="flex h-10 items-center gap-2 rounded-[12px] px-3 text-sm font-semibold text-(--text-secondary) hover:bg-[#F2F4F7]"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar aos Relatórios
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-(--text-muted) max-sm:hidden">
            Na janela que abrir, escolha <b>Salvar como PDF</b>.
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex h-10 items-center gap-2 rounded-[12px] bg-(--primary) px-4 text-sm font-bold text-white shadow-[0_6px_16px_rgba(83,109,254,.3)]"
          >
            <Download className="h-4 w-4" /> Baixar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
