"use client";

import { useState } from "react";
import { FileDown, Lock, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DateInput } from "@/components/date-input";

type Account = { id: string; name: string };
type PeriodKind = "month" | "year" | "custom";

const pad = (n: number) => String(n).padStart(2, "0");

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
}

function monthTitle(month: string) {
  const [y, m] = month.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * "Baixar PDF" dos Relatórios: escolhe período, o quanto de detalhe e as
 * contas, e abre o relatório pronto pra salvar em PDF numa aba nova.
 */
export function ReportPdfButton({ month, today, accounts }: { month: string; today: string; accounts: Account[] }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PeriodKind>("month");
  const [full, setFull] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(accounts.map((a) => a.id)));
  const year = month.slice(0, 4);
  const [from, setFrom] = useState(monthBounds(month).from);
  const [to, setTo] = useState(monthBounds(month).to);
  const [error, setError] = useState<string | null>(null);

  // Ano: de 1º de janeiro até hoje (ano corrente) ou até 31/12.
  const yearTo = today.startsWith(year) ? today : `${year}-12-31`;

  function range(): { from: string; to: string } | null {
    if (kind === "month") return monthBounds(month);
    if (kind === "year") return { from: `${year}-01-01`, to: yearTo };
    if (!from || !to) return null;
    return from <= to ? { from, to } : { from: to, to: from };
  }

  function generate() {
    setError(null);
    const r = range();
    if (!r) return setError("Escolha as duas datas.");
    if (selected.size === 0) return setError("Escolha pelo menos uma conta.");
    const qs = new URLSearchParams({ from: r.from, to: r.to, mode: full ? "full" : "summary", print: "1" });
    if (selected.size < accounts.length) qs.set("accounts", [...selected].join(","));
    window.open(`/relatorio-pdf?${qs.toString()}`, "_blank", "noopener");
    setOpen(false);
  }

  const seg = (on: boolean) =>
    `flex h-11 flex-1 items-center justify-center rounded-[12px] text-[14px] font-semibold transition-colors ${
      on ? "bg-(--bg-surface) text-(--primary) shadow-[0_1px_3px_rgba(16,24,40,.12)]" : "text-(--text-muted) hover:text-(--text-secondary)"
    }`;
  const opt = (on: boolean) =>
    `flex w-full items-start gap-3 rounded-[14px] border-[1.5px] p-3.5 text-left transition-colors ${
      on ? "border-(--primary) bg-(--primary-soft)" : "border-(--border-primary) bg-(--bg-surface) hover:border-(--primary-border)"
    }`;
  const radio = (on: boolean) =>
    `mt-0.5 h-[18px] w-[18px] shrink-0 rounded-full ${on ? "border-[5px] border-(--primary)" : "border-2 border-(--border-strong)"}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex h-12 items-center gap-2 rounded-[16px] bg-(--bg-surface) px-4 text-[14px] font-semibold text-(--text-secondary) shadow-(--shadow-card) hover:text-(--text-primary)"
        >
          <FileDown className="h-[18px] w-[18px] text-(--primary)" />
          Baixar PDF
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-h-[92dvh] gap-5 overflow-y-auto rounded-[24px] bg-(--bg-surface) p-5 sm:max-w-[520px] sm:p-7"
      >
        <div className="flex items-center justify-between">
          <DialogTitle className="text-[21px] font-extrabold tracking-[-0.02em] text-(--text-primary)">
            Baixar relatório em PDF
          </DialogTitle>
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-(--bg-hover) text-(--text-secondary) hover:bg-(--bg-strong)"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-(--text-body)">Período</span>
          <div role="radiogroup" aria-label="Período" className="flex gap-1.5 rounded-[16px] bg-(--bg-hover) p-[5px]">
            <button type="button" role="radio" aria-checked={kind === "month"} className={seg(kind === "month")} onClick={() => setKind("month")}>
              {monthTitle(month)}
            </button>
            <button type="button" role="radio" aria-checked={kind === "year"} className={seg(kind === "year")} onClick={() => setKind("year")}>
              Ano {year}
            </button>
            <button type="button" role="radio" aria-checked={kind === "custom"} className={seg(kind === "custom")} onClick={() => setKind("custom")}>
              Escolher datas
            </button>
          </div>
          {kind === "custom" ? (
            <div className="grid grid-cols-2 gap-3">
              <DateInput aria-label="De" defaultValue={from} onChange={setFrom} className="[&_input]:h-12 [&_input]:rounded-[12px]" />
              <DateInput aria-label="Até" defaultValue={to} onChange={setTo} className="[&_input]:h-12 [&_input]:rounded-[12px]" />
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-(--text-body)">O que vai no PDF</span>
          <div role="radiogroup" aria-label="Conteúdo" className="flex flex-col gap-2">
            <button type="button" role="radio" aria-checked={full} className={opt(full)} onClick={() => setFull(true)}>
              <span className={radio(full)} />
              <span>
                <span className="block text-sm font-bold text-(--text-primary)">Completo</span>
                <span className="block text-xs text-(--text-muted)">
                  Resumo, categorias, contas, a vencer e todos os lançamentos por categoria
                  {kind !== "month" ? ", mais as tabelas categoria × mês" : ""}
                </span>
              </span>
            </button>
            <button type="button" role="radio" aria-checked={!full} className={opt(!full)} onClick={() => setFull(false)}>
              <span className={radio(!full)} />
              <span>
                <span className="block text-sm font-bold text-(--text-primary)">Só o resumo</span>
                <span className="block text-xs text-(--text-muted)">Números, categorias e contas, sem a lista de lançamentos</span>
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-(--text-body)">Contas</span>
          {accounts.map((a) => {
            const on = selected.has(a.id);
            return (
              <button
                key={a.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (on) next.delete(a.id);
                    else next.add(a.id);
                    return next;
                  })
                }
                className="flex h-11 items-center gap-2.5 text-left text-sm text-(--text-primary)"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] ${
                    on ? "bg-(--primary)" : "border-2 border-(--border-strong) bg-(--bg-surface)"
                  }`}
                >
                  {on ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                      <path d="M5 12l5 5 9-10" />
                    </svg>
                  ) : null}
                </span>
                {a.name}
              </button>
            );
          })}
        </div>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-(--text-muted)">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--primary)" />
          O PDF é montado aqui no navegador. Contas pessoais que mostram só o total entram como total, sem lançamentos.
        </p>

        {error ? <p className="text-sm font-medium text-(--expense-dark)">{error}</p> : null}

        <button
          type="button"
          onClick={generate}
          className="h-[54px] rounded-[14px] bg-(--primary) text-base font-bold text-white shadow-[0_8px_20px_rgba(83,109,254,.3)]"
        >
          Gerar PDF
        </button>
      </DialogContent>
    </Dialog>
  );
}
