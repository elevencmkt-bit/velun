import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  HELP_ARTICLES,
  articleByPath,
  articleHref,
  articlesOf,
  topicBySlug,
  type HelpArticle,
} from "@/lib/help/content";
import { ArticleBody } from "@/components/help/article-body";

export const dynamicParams = false;

export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ topico: a.topic, artigo: a.slug }));
}

type Params = Promise<{ topico: string; artigo: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { topico, artigo } = await params;
  const article = articleByPath(`${topico}/${artigo}`);
  return article ? { title: article.title, description: article.summary } : {};
}

export default async function ArtigoPage({ params }: { params: Params }) {
  const { topico, artigo } = await params;
  const article = articleByPath(`${topico}/${artigo}`);
  const topic = topicBySlug(topico);
  if (!article || !topic) notFound();

  const siblings = articlesOf(topic.slug);
  const sections = article.body.filter((b): b is { h2: string; id: string } => "h2" in b);
  const related = (article.related ?? [])
    .map((p) => articleByPath(p))
    .filter((a): a is HelpArticle => Boolean(a));

  return (
    <main className="mx-auto grid max-w-[1180px] grid-cols-1 gap-8 px-4 pt-6 pb-16 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)_180px] lg:gap-10 lg:pt-8">
      <nav aria-label={`Artigos de ${topic.title}`} className="flex flex-col gap-0.5 max-lg:order-3">
        <Link href="/ajuda" className="px-3 pb-2.5 text-[13px] text-(--text-muted) hover:text-(--primary)">
          ← Todos os assuntos
        </Link>
        <span className="px-3 pt-1 pb-2 text-[12px] font-bold tracking-[0.06em] text-(--text-light) uppercase">{topic.title}</span>
        {siblings.map((a) => {
          const on = a.slug === article.slug;
          return (
            <Link
              key={a.slug}
              href={articleHref(a)}
              aria-current={on ? "page" : undefined}
              className={`rounded-[10px] px-3 py-2 text-[14px] leading-snug ${
                on ? "bg-(--primary-soft) font-semibold text-(--primary)" : "text-(--text-secondary) hover:bg-(--bg-hover)"
              }`}
            >
              {a.title}
            </Link>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-col gap-8">
        <article className="rounded-[20px] bg-(--bg-surface) px-5 py-7 shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_30px_rgba(16,24,40,.05)] sm:px-[52px] sm:py-11">
          <nav aria-label="Caminho" className="text-[13px] text-(--text-light)">
            <Link href="/ajuda" className="text-(--text-muted) hover:text-(--primary)">
              Ajuda
            </Link>{" "}
            ›{" "}
            <Link href={`/ajuda/${topic.slug}`} className="text-(--text-muted) hover:text-(--primary)">
              {topic.title}
            </Link>
          </nav>
          <h1 className="mt-3 text-[26px] leading-tight font-extrabold tracking-[-0.03em] sm:text-[32px]">{article.title}</h1>
          <p className="mt-2.5 mb-6 text-[17px] leading-relaxed text-(--text-muted)">{article.summary}</p>
          <ArticleBody blocks={article.body} />
        </article>

        {related.length > 0 ? (
          <section>
            <h2 className="mb-3.5 text-[17px] font-bold">Veja também</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={articleHref(r)}
                  href={articleHref(r)}
                  className="flex flex-col gap-1.5 rounded-[18px] bg-(--bg-surface) px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,.03),0_6px_20px_rgba(16,24,40,.04)] hover:-translate-y-0.5 transition-transform"
                >
                  <span className="text-[12px] font-semibold text-(--text-light)">{topicBySlug(r.topic)?.title}</span>
                  <span className="text-[15px] font-semibold">{r.title}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {sections.length > 1 ? (
        <aside className="hidden flex-col gap-1.5 self-start lg:sticky lg:top-24 lg:flex">
          <span className="pb-1.5 text-[12px] font-bold tracking-[0.06em] text-(--text-light) uppercase">Neste artigo</span>
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="border-l-2 border-(--border-primary) py-1 pl-3 text-[13px] text-(--text-muted) hover:border-(--primary) hover:text-(--primary)"
            >
              {s.h2}
            </a>
          ))}
        </aside>
      ) : (
        <div className="hidden lg:block" />
      )}
    </main>
  );
}
