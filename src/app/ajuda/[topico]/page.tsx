import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { HELP_TOPICS, articleHref, articlesOf, topicBySlug } from "@/lib/help/content";
import { HelpTopicIcon } from "@/components/help/help-topic-icon";

export const dynamicParams = false;

export function generateStaticParams() {
  return HELP_TOPICS.map((t) => ({ topico: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ topico: string }> }): Promise<Metadata> {
  const { topico } = await params;
  const topic = topicBySlug(topico);
  return topic ? { title: topic.title, description: topic.description } : {};
}

export default async function TopicoPage({ params }: { params: Promise<{ topico: string }> }) {
  const { topico } = await params;
  const topic = topicBySlug(topico);
  if (!topic) notFound();
  const articles = articlesOf(topic.slug);

  return (
    <main className="mx-auto max-w-[820px] px-4 pt-8 pb-16 sm:px-8">
      <nav aria-label="Caminho" className="text-[13px] text-(--text-light)">
        <Link href="/ajuda" className="text-(--text-muted) hover:text-(--primary)">
          Ajuda
        </Link>{" "}
        › {topic.title}
      </nav>
      <div className="mt-4 flex items-center gap-4">
        <HelpTopicIcon icon={topic.icon} />
        <div>
          <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">{topic.title}</h1>
          <p className="text-[15px] text-(--text-muted)">{topic.description}</p>
        </div>
      </div>
      <ul className="mt-8 flex flex-col overflow-hidden rounded-[20px] bg-(--bg-surface) shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_30px_rgba(16,24,40,.05)]">
        {articles.map((a, i) => (
          <li key={a.slug} className={i > 0 ? "border-t border-(--border-soft)" : ""}>
            <Link href={articleHref(a)} className="flex items-center gap-4 px-5 py-4 hover:bg-(--bg-subtle) sm:px-6">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[16px] font-semibold">{a.title}</span>
                <span className="text-[14px] leading-snug text-(--text-muted)">{a.summary}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-(--text-light)" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
