import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { HELP_FAQ, HELP_TOPICS, articleByPath, articleHref, articlesOf, helpSearchIndex } from "@/lib/help/content";
import { HelpSearch } from "@/components/help/help-search";
import { HelpTopicIcon } from "@/components/help/help-topic-icon";

export default function AjudaPage() {
  const index = helpSearchIndex();

  return (
    <main>
      <section className="bg-(--bg-surface) px-4 pt-12 pb-12 sm:px-8 sm:pt-14">
        <div className="mx-auto flex max-w-[1120px] flex-col items-center gap-3 text-center">
          <h1 className="text-[30px] font-extrabold tracking-[-0.035em] sm:text-[40px]">Como podemos ajudar?</h1>
          <p className="text-[15px] text-(--text-muted) sm:text-[16px]">
            Guias curtos de cada parte do Velun, do primeiro lançamento à privacidade do casal.
          </p>
          <div className="mt-4 flex w-full justify-center text-left">
            <HelpSearch index={index} variant="hero" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-4 pt-10 sm:px-8">
        <h2 className="mb-4 text-[20px] font-bold tracking-[-0.02em]">Por assunto</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {HELP_TOPICS.map((t) => {
            const count = articlesOf(t.slug).length;
            return (
              <Link
                key={t.slug}
                href={`/ajuda/${t.slug}`}
                className="flex gap-4 rounded-[20px] bg-(--bg-surface) p-5 shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_30px_rgba(16,24,40,.05)] transition-transform hover:-translate-y-0.5 sm:flex-col sm:gap-3 sm:p-[22px]"
              >
                <HelpTopicIcon icon={t.icon} />
                <span className="flex flex-col gap-1">
                  <span className="text-[16px] font-bold tracking-[-0.01em]">{t.title}</span>
                  <span className="text-[13.5px] leading-normal text-(--text-muted)">{t.description}</span>
                  <span className="mt-1 text-[12px] font-semibold text-(--text-light)">
                    {count} {count === 1 ? "artigo" : "artigos"}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-4 pt-12 pb-16 sm:px-8">
        <h2 className="mb-4 text-[20px] font-bold tracking-[-0.02em]">Perguntas frequentes</h2>
        <div className="flex max-w-[820px] flex-col gap-2.5">
          {HELP_FAQ.map((f, i) => {
            const linked = f.link ? articleByPath(f.link) : undefined;
            return (
              <details
                key={f.q}
                open={i === 0}
                className="group rounded-[16px] bg-(--bg-surface) shadow-[0_1px_2px_rgba(16,24,40,.03),0_6px_20px_rgba(16,24,40,.04)]"
              >
                <summary className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-[15px] font-semibold sm:px-[22px] [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown className="h-[18px] w-[18px] shrink-0 text-(--text-muted) transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="px-5 pb-5 text-[14px] leading-relaxed text-(--text-secondary) sm:px-[22px]">
                  {f.a}{" "}
                  {linked ? (
                    <Link href={articleHref(linked)} className="font-semibold whitespace-nowrap text-(--primary) hover:underline">
                      Ler mais →
                    </Link>
                  ) : null}
                </p>
              </details>
            );
          })}
        </div>
      </section>
    </main>
  );
}
