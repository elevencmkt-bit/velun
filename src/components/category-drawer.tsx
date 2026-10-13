"use client";

import { createElement, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountAvatar } from "@/components/account-avatar";
import { Money } from "@/components/money";
import { getCategoryDetail, type CategoryDetail } from "@/lib/actions/category-detail";
import { updateTransactionCategory } from "@/lib/actions/transactions";
import { categoryInsight } from "@/lib/category-insight";
import { getCategoryIcon } from "@/lib/category-icons";
import type { CurrencyCode } from "@/lib/money";
import { fitsDirection } from "@/lib/category-kind";
import { themedFg } from "@/lib/theme-color";

export type CategoryDrawerQuery = {
  /** "2026-09" */
  month: string;
  name: string;
  direction: "in" | "out";
  status: "cleared" | "pending";
  /** Cor da categoria no relatório (texto), pra o cabeçalho combinar. */
  color?: string;
  /** Só uma conta (filtro de conta do Dashboard). */
  accountId?: string | null;
};

const NONE = "__none__";

function monthTitle(month: string) {
  const [y, m] = month.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function dayTitle(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function shortDay(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/**
 * Painel lateral com os lançamentos de uma categoria num mês. Abre por
 * cima da tela (pela direita no computador, de baixo no celular), então o
 * relatório fica como está. Dá pra trocar a categoria ali mesmo.
 */
export function CategoryDrawer({
  query,
  onClose,
  currency,
}: {
  query: CategoryDrawerQuery | null;
  onClose: () => void;
  currency: CurrencyCode;
}) {
  const [detail, setDetail] = useState<CategoryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const router = useRouter();

  const key = query ? `${query.month}|${query.name}|${query.direction}|${query.status}|${query.accountId ?? ""}` : null;

  useEffect(() => {
    if (!query) return;
    let alive = true;
    // Começa a buscar quando o painel abre; o estado volta ao abrir outro.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setNote(null);
    setDetail(null);
    getCategoryDetail(query)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setError("Não consegui carregar os lançamentos."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // a chave resume a consulta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function changeCategory(id: string, value: string) {
    if (!query) return;
    const categoryId = value === NONE ? null : value;
    startSaving(async () => {
      try {
        const { alsoUpdated } = await updateTransactionCategory(id, categoryId);
        const fresh = await getCategoryDetail(query);
        setDetail(fresh);
        const name = fresh.categories.find((c) => c.id === categoryId)?.name ?? "Sem categoria";
        setNote(
          alsoUpdated > 0
            ? `Foi pra ${name}, e mais ${alsoUpdated} ${alsoUpdated === 1 ? "lançamento igual" : "lançamentos iguais"} sem categoria foram junto.`
            : `Foi pra ${name}.`,
        );
        router.refresh();
      } catch {
        setNote("Não consegui trocar a categoria.");
      }
    });
  }

  const open = query !== null;
  const dir = query?.direction ?? "out";
  const kind = dir === "in" ? "income" : "expense";
  const options = (detail?.categories ?? []).filter((c) => fitsDirection(c, dir));
  const matched = detail?.categories.find((c) => c.name === query?.name);
  const icon = createElement(getCategoryIcon(query?.name ?? null, dir, matched?.icon ?? null), {
    className: "h-5 w-5",
  });
  const accent = themedFg(query?.color ?? "#475467");
  const delta = detail ? detail.totalCents - detail.prevCents : 0;
  // Gasto que sobe é ruim; receita que sobe é boa.
  const deltaGood = dir === "out" ? delta <= 0 : delta >= 0;
  const insight = categoryInsight(detail?.rows ?? []);

  const groups: { date: string; rows: CategoryDetail["rows"] }[] = [];
  for (const r of detail?.rows ?? []) {
    const last = groups[groups.length - 1];
    if (last && last.date === r.date) last.rows.push(r);
    else groups.push({ date: r.date, rows: [r] });
  }

  const [y, m] = (query?.month ?? "2026-01").split("-").map(Number);
  const prevName = new Date(y, m - 2, 1).toLocaleDateString("pt-BR", { month: "long" });
  const categoryParam = query?.name === "Sem categoria" ? "none" : matched?.id ?? "";
  const transactionsHref = `/transacoes?month=${query?.month ?? ""}${categoryParam ? `&category=${categoryParam}` : ""}${
    query?.status === "pending" ? "&status=pending" : ""
  }${query?.accountId ? `&account=${query.accountId}` : ""}`;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col gap-0 overflow-hidden bg-(--bg-surface) p-0 data-open:zoom-in-100 data-closed:zoom-out-100 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:h-[88dvh] max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-t-[24px] max-sm:rounded-b-none sm:top-0 sm:right-0 sm:left-auto sm:h-dvh sm:w-[460px] sm:max-w-[460px] sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:rounded-l-[24px]"
      >
        <div className="flex flex-col gap-4 border-b border-(--border-soft) px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
                style={{ backgroundColor: `color-mix(in srgb, ${accent} 12%, var(--bg-surface))`, color: accent }}
              >
                {icon}
              </span>
              <div className="min-w-0">
                <DialogTitle className="truncate text-[20px] font-extrabold tracking-[-0.02em] text-(--text-primary)">
                  {query?.name}
                </DialogTitle>
                <p className="text-[13px] text-(--text-muted)">
                  {query ? monthTitle(query.month) : ""}
                  {query?.status === "pending" ? " · a vencer" : ""}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-(--bg-hover) text-(--text-secondary) hover:bg-(--bg-strong)"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>

          {detail ? (
            <>
              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-[14px] bg-(--bg-subtle) p-3">
                  <div className="text-xs text-(--text-muted)">Total</div>
                  <div className="text-[17px] font-extrabold tabular-nums">
                    <Money cents={detail.totalCents} currency={currency} />
                  </div>
                </div>
                <div
                  className="rounded-[14px] p-3"
                  style={{ backgroundColor: delta === 0 ? "var(--bg-subtle)" : deltaGood ? "var(--success-soft)" : "var(--danger-soft)" }}
                >
                  <div className="text-xs" style={{ color: delta === 0 ? "var(--text-muted)" : deltaGood ? "var(--success-text)" : "var(--danger-text)" }}>
                    vs {prevName}
                  </div>
                  <div
                    className="text-[17px] font-extrabold tabular-nums"
                    style={{ color: delta === 0 ? "var(--text-primary)" : deltaGood ? "var(--success-text)" : "var(--danger-text)" }}
                  >
                    {delta === 0 ? "igual" : (
                      <>
                        {delta > 0 ? "+" : "−"}
                        <Money cents={Math.abs(delta)} currency={currency} />
                      </>
                    )}
                  </div>
                </div>
                <div className="rounded-[14px] bg-(--bg-subtle) p-3">
                  <div className="text-xs text-(--text-muted)">Lançamentos</div>
                  <div className="text-[17px] font-extrabold tabular-nums">{detail.rows.length}</div>
                </div>
              </div>
              {insight.top || insight.heavy ? (
                <p className="text-[13px] leading-relaxed text-(--text-secondary)">
                  {insight.top ? (
                    <>
                      Mais caro: <b>{insight.top.description}</b>,{" "}
                      <b>
                        <Money cents={insight.top.amount_cents} currency={currency} />
                      </b>{" "}
                      em {shortDay(insight.top.date)}.{" "}
                    </>
                  ) : null}
                  {insight.heavy ? (
                    <>
                      {insight.heavy.description} soma{" "}
                      <b>
                        <Money cents={insight.heavy.cents} currency={currency} />
                      </b>{" "}
                      em {insight.heavy.count} vezes —{" "}
                      {insight.heavy.share >= 0.5 ? "mais da metade do mês" : "quase metade do mês"}.
                    </>
                  ) : null}
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 sm:px-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-(--text-muted)">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : error ? (
            <p className="py-16 text-center text-sm text-(--expense-dark)">{error}</p>
          ) : detail && detail.rows.length === 0 && detail.hiddenCents === 0 ? (
            <p className="py-16 text-center text-sm text-(--text-muted)">Nenhum lançamento nessa categoria no mês.</p>
          ) : (
            <>
              {groups.map((g) => (
                <div key={g.date}>
                  <div className="mt-4 mb-0.5 text-[11px] font-bold tracking-[0.04em] text-(--text-light) uppercase">
                    {dayTitle(g.date)}
                  </div>
                  {g.rows.map((r) => (
                    <div key={r.id} className="flex min-h-[58px] items-center gap-3 border-b border-(--border-soft) py-2 last:border-0">
                      <AccountAvatar institution={r.institution} type={r.account_type} size={30} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-(--text-primary)">{r.description}</div>
                        <div className="truncate text-xs text-(--text-muted)">{r.account_name}</div>
                      </div>
                      {r.can_edit ? (
                        <Select
                          value={r.category_id ?? NONE}
                          disabled={isSaving}
                          onValueChange={(v) => changeCategory(r.id, v)}
                        >
                          <SelectTrigger
                            aria-label={`Categoria de ${r.description}`}
                            className="h-8! max-w-[132px] rounded-full border-[1.5px] border-(--border-primary) px-2.5 text-xs font-semibold text-(--text-secondary)"
                          >
                            <SelectValue placeholder="Sem categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Sem categoria</SelectItem>
                            {options.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                      <span
                        className="shrink-0 text-sm font-bold tabular-nums"
                        style={{ color: dir === "in" ? "var(--income-dark)" : "var(--expense-dark)" }}
                      >
                        {dir === "in" ? "+" : "−"}
                        <Money cents={r.amount_cents} currency={currency} />
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              {detail && detail.hiddenCents > 0 ? (
                <p className="mt-4 rounded-[12px] bg-(--bg-subtle) px-3 py-2.5 text-xs leading-relaxed text-(--text-muted)">
                  Mais <Money cents={detail.hiddenCents} currency={currency} /> de contas pessoais que mostram só o
                  total por categoria.
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-(--border-soft) px-5 pt-3.5 pb-[calc(16px+env(safe-area-inset-bottom))] sm:px-6 sm:pb-5">
          {note ? <p className="text-xs font-medium text-(--text-secondary)">{note}</p> : null}
          <Link
            href={transactionsHref}
            onClick={onClose}
            className="flex h-12 items-center justify-center gap-2 rounded-[14px] bg-(--primary-soft) text-sm font-bold text-(--primary) hover:bg-(--primary-light)"
          >
            Abrir em Transações <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
