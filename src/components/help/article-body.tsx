import { Info } from "lucide-react";
import type { HelpBlock } from "@/lib/help/content";

/** `**assim**` vira negrito; o resto é texto puro. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-(--text-primary)">
            {p.slice(2, -2)}
          </strong>
        ) : (
          p
        ),
      )}
    </>
  );
}

const PARAGRAPH = "text-[16px] leading-[1.7] text-(--text-body)";

export function ArticleBody({ blocks }: { blocks: HelpBlock[] }) {
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((b, i) => {
        if ("h2" in b) {
          return (
            <h2 key={i} id={b.id} className="mt-5 scroll-mt-24 text-[20px] font-bold tracking-[-0.02em] text-(--text-primary)">
              {b.h2}
            </h2>
          );
        }
        if ("p" in b) {
          return (
            <p key={i} className={PARAGRAPH}>
              <RichText text={b.p} />
            </p>
          );
        }
        if ("list" in b) {
          return (
            <ul key={i} className="flex flex-col gap-2 pl-1">
              {b.list.map((item, j) => (
                <li key={j} className={`flex gap-3 ${PARAGRAPH}`}>
                  <span aria-hidden className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-(--primary)" />
                  <span>
                    <RichText text={item} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }
        if ("steps" in b) {
          return (
            <ol key={i} className="flex flex-col gap-3">
              {b.steps.map((item, j) => (
                <li key={j} className={`flex gap-3 ${PARAGRAPH}`}>
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-(--primary-soft) text-[13px] font-bold text-(--primary)"
                  >
                    {j + 1}
                  </span>
                  <span>
                    <RichText text={item} />
                  </span>
                </li>
              ))}
            </ol>
          );
        }
        if ("tip" in b) {
          return (
            <div key={i} className="flex gap-3 rounded-[14px] bg-(--primary-soft) px-[18px] py-4 text-[14.5px] leading-relaxed text-(--text-body)">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-(--primary)" aria-hidden />
              <span>
                <RichText text={b.tip} />
              </span>
            </div>
          );
        }
        return (
          <dl key={i} className="overflow-hidden rounded-[16px] border border-(--border-soft) bg-(--bg-subtle)">
            {b.table.map(([term, desc], j) => (
              <div
                key={j}
                className={`grid gap-1 px-[18px] py-3.5 text-[14px] leading-relaxed sm:grid-cols-[190px_1fr] sm:gap-4 ${
                  j > 0 ? "border-t border-(--border-soft)" : ""
                }`}
              >
                <dt className="font-semibold text-(--text-primary)">{term}</dt>
                <dd className="text-(--text-secondary)">
                  <RichText text={desc} />
                </dd>
              </div>
            ))}
          </dl>
        );
      })}
    </div>
  );
}
