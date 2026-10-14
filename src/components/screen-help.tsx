"use client";

import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SCREEN_HELP, type ScreenHelpKey } from "@/lib/help/content";

/**
 * O "?" ao lado do título da tela: abre ali mesmo um resumo de três
 * pontos e o link pro artigo completo na central de ajuda.
 */
export function ScreenHelp({ screen }: { screen: ScreenHelpKey }) {
  const help = SCREEN_HELP[screen];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Como funciona esta tela"
          title="Como funciona esta tela"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--primary-soft) text-[14px] font-bold text-(--primary) transition-colors hover:bg-(--primary-light) data-[state=open]:bg-(--primary) data-[state=open]:text-white"
        >
          ?
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[min(380px,calc(100vw-32px))] p-5">
        <p className="text-[16px] font-bold text-(--text-primary)">{help.title}</p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {help.points.map((p) => (
            <li key={p} className="flex gap-2.5 text-[14px] leading-relaxed text-(--text-body)">
              <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-(--primary)" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <Link
          href={`/ajuda/${help.article}`}
          className="mt-4 inline-block text-[14px] font-semibold text-(--primary) hover:underline"
        >
          Ler o artigo completo →
        </Link>
      </PopoverContent>
    </Popover>
  );
}
